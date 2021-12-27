import {differenceWith, remove} from 'lodash'

import {All, Bottom, isEqual, TyUnion, UnitableType, Value} from './val'

function asUnion<T extends Value>(ty: T): (T | UnitableType)[] {
	return ty.type === 'tyUnion' ? ty.types : [ty]
}

export function tyUnion(...types: Value[]): Value {
	if (types.length === 0) return Bottom.instance
	if (types.length === 1) return types[0]

	const flattenedTypes: UnitableType[] = []

	for (const ty of types) {
		if (ty.type === 'all') return ty
		if (ty.type === 'bottom') continue
		if (ty.type === 'tyUnion') flattenedTypes.push(...ty.types)
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
			if (pty.type !== 'enum') continue

			const tyEnum = pty.superType

			const includesAllEnum = tyEnum.types.every(enm =>
				prevTypes.some(p => isEqual(p, enm))
			)
			if (!includesAllEnum) continue

			remove(prevTypes, pty => pty.superType.isEqualTo(tyEnum))
			prevTypes.push(tyEnum)
		}

		return prevTypes
	}, [] as UnitableType[])

	if (normalizedTypes.length === 0) return Bottom.instance
	if (normalizedTypes.length === 1) return normalizedTypes[0]

	return TyUnion.fromTypesUnsafe(normalizedTypes)
}

export function tyDifference(original: Value, ...types: Value[]) {
	// Prefix 'o' and 's' means O(riginal) - S(ubtrahead)
	let oTypes: Value[] = asUnion(original)
	const sTypes = asUnion(tyUnion(...types))

	/**
	 * OにTyEnumが含まれる時、引き算をする。Bool - true = false になるように
	 */
	oTypes = oTypes.flatMap((oty): Value[] => {
		if (oty.type !== 'tyEnum') return [oty]

		// 列挙の差分を取る
		const enums = oty.types
		const restEnums = differenceWith(enums, sTypes, isEqual)

		// 特に引かさるものはねぇ
		if (restEnums.length === enums.length) {
			return [oty]
		}

		// Sから当核の列挙値すべてを消しておく
		remove(sTypes, sty => sty.type === 'enum' && oty.isInstance(sty))

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

	return tyUnion(...restTypes)
}

export function tyIntersection(...types: Value[]) {
	if (types.length === 0) return All.instance
	if (types.length === 1) return types[0]

	const [first, ...rest] = types
	return rest.reduce(intersectTwo, first)

	function intersectTwo(a: Value, b: Value): Value {
		if (a.type === 'bottom' || b.type === 'bottom') return Bottom.instance
		if (a.type === 'all') return b
		if (b.type === 'all') return a

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

		if (types.length === 0) return Bottom.instance
		if (types.length === 1) return types[0]
		return TyUnion.fromTypesUnsafe(types)
	}
}
