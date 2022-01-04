import {differenceWith, remove} from 'lodash'

import {All, isEqual, Never, UnionType, UnitableType, Value} from './val'

function asUnion<T extends Value>(ty: T): (T | UnitableType)[] {
	return ty.type === 'UnionType' ? ty.types : [ty]
}

export function unionType(...types: Value[]): Value {
	if (types.length === 0) return Never.instance
	if (types.length === 1) return types[0]

	const flattenedTypes: UnitableType[] = []

	for (const ty of types) {
		if (ty.type === 'All') return ty
		if (ty.type === 'Never') continue
		if (ty.type === 'UnionType') flattenedTypes.push(...ty.types)
		else flattenedTypes.push(ty)
	}

	const normalizedTypes = flattenedTypes.reduce((prevTypes, ty) => {
		const includedByPrev = prevTypes.some(pty => ty.isSubtypeOf(pty))
		if (includedByPrev) {
			return prevTypes
		}

		remove(prevTypes, pty => pty.isSubtypeOf(ty))
		prevTypes.push(ty)

		// Unite enum
		for (const pty of prevTypes) {
			if (pty.type !== 'Enum') continue

			const enumType = pty.superType

			const includesAllEnum = enumType.types.every(enm =>
				prevTypes.some(p => isEqual(p, enm))
			)
			if (!includesAllEnum) continue

			remove(prevTypes, pty => pty.superType.isEqualTo(enumType))
			prevTypes.push(enumType)
		}

		return prevTypes
	}, [] as UnitableType[])

	if (normalizedTypes.length === 0) return Never.instance
	if (normalizedTypes.length === 1) return normalizedTypes[0]

	return UnionType.fromTypesUnsafe(normalizedTypes)
}

export function differenceType(original: Value, ...types: Value[]) {
	// Prefix 'o' and 's' means O(riginal) - S(ubtrahead)
	let oTypes: Value[] = asUnion(original)
	const sTypes = asUnion(unionType(...types))

	/**
	 * OにTyEnumが含まれる時、引き算をする。Bool - true = false になるように
	 */
	oTypes = oTypes.flatMap((oty): Value[] => {
		if (oty.type !== 'EnumType') return [oty]

		// 列挙の差分を取る
		const enums = oty.types
		const restEnums = differenceWith(enums, sTypes, isEqual)

		// 特に引かさるものはねぇ
		if (restEnums.length === enums.length) {
			return [oty]
		}

		// Sから当核の列挙値すべてを消しておく
		remove(sTypes, sty => sty.type === 'Enum' && oty.isInstance(sty))

		return restEnums
	})

	/**
	 * Oの各要素について、それを部分型とするSの要素が１つでもあれば除外
	 * (Num | Str | false) - (Num | "hello" | Bool) = Str
	 * false <: Bool なので除外
	 * Num <: Num なので除外
	 * Str を部分型とする要素がSに無いので残す
	 */

	// 残り
	const restTypes = oTypes.filter(o => !sTypes.some(s => o.isSubtypeOf(s)))

	return unionType(...restTypes)
}

export function intersectionType(...types: Value[]) {
	if (types.length === 0) return All.instance
	if (types.length === 1) return types[0]

	const [first, ...rest] = types
	return rest.reduce(intersectTwo, first)

	function intersectTwo(a: Value, b: Value): Value {
		if (a.type === 'Never' || b.type === 'Never') return Never.instance
		if (a.type === 'All') return b
		if (b.type === 'All') return a

		if (b.isSubtypeOf(a)) return b
		if (a.isSubtypeOf(b)) return a

		// TODO: Below code takes O(n^2) time
		const aTypes = asUnion(a)
		const bTypes = asUnion(b)

		const types = aTypes.flatMap(at => {
			return bTypes.flatMap(bt => {
				if (bt.isSubtypeOf(at)) return [bt]
				if (at.isSubtypeOf(bt)) return [at]
				return []
			})
		})

		if (types.length === 0) return Never.instance
		if (types.length === 1) return types[0]
		return UnionType.fromTypesUnsafe(types)
	}
}
