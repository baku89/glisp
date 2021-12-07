import {All, Bottom, TyUnion, UnitableType, Value} from './exp'

function asUnion(ty: Value): Value[] {
	return ty.type === 'tyUnion' ? ty.types : [ty]
}

export function uniteTy(...types: Value[]): Value {
	if (types.length === 0) return Bottom.instance
	if (types.length === 1) return types[0]

	const flattenedTypes: UnitableType[] = []

	for (const ty of types) {
		if (ty.type === 'all') return ty
		if (ty.type === 'bottom') continue
		if (ty.type === 'tyUnion') flattenedTypes.push(...ty.types)
		else flattenedTypes.push(ty)
	}

	const normalizedTypes = flattenedTypes.reduce((prev, ty) => {
		const index = prev.findIndex(p => p.isSubtypeOf(ty))

		const includesPrev = index !== -1
		if (includesPrev) {
			const cur = [...prev]
			cur[index] = ty
			return cur
		}

		const includedByPrev = prev.some(p => ty.isSubtypeOf(p))
		if (includedByPrev) {
			return prev
		}

		// Unite enum
		if (ty.type === 'enum') {
			const tyEnum = ty.superType
			const arr = [...prev, ty]
			const indices = new Set(
				tyEnum.types.map(t => arr.findIndex(a => t.isSubtypeOf(a)))
			)
			const includesAllValues = !indices.has(-1)
			if (includesAllValues) {
				const arrSpliced = arr.filter((_, i) => !indices.has(i))
				return [...arrSpliced, tyEnum]
			}
		}

		return [...prev, ty]
	}, [] as UnitableType[])

	if (normalizedTypes.length === 0) return Bottom.instance
	if (normalizedTypes.length === 1) return normalizedTypes[0]

	return TyUnion.fromTypesUnsafe(normalizedTypes)
}

export function tyDifference(original: Value, ...types: Value[]) {
	// Prefix 'o' and 's' means O(riginal) - S(ubtrahead)
	const oTypes = asUnion(original)
	const sTypes = asUnion(uniteTy(...types))

	/**
	 * Oの各要素について、それを部分型とするSの要素が１つでもあれば除外
	 * (Num | Str | false) - (Num | "hello" | Bool) = Str
	 * false <: Bool なので除外
	 * Num <: Num なので除外
	 * Str を部分型とする要素がSに無いので残す
	 */

	// 残り
	const restTypes = oTypes.filter(o => !sTypes.some(s => o.isSubtypeOf(s)))

	return uniteTy(...restTypes)
}

export function intersectTy(...types: Value[]) {
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
		return TyUnion.fromTypesUnsafe(types as UnitableType[])
	}
}
