import {All, Bottom, TyUnion, Value} from './val'

export function uniteTy(...types: Value[]) {
	const flattenedTypes = types.flatMap(ty =>
		ty.type === 'tyUnion' ? ty.types : [ty]
	)

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

		if (ty.type === 'algCtor') {
			const variant = ty.superType
			const arr = [...prev, ty]
			const indices = new Set(
				variant.types.map(t => arr.findIndex(a => t.isSubtypeOf(a)))
			)
			const includesAllAlgCtors = !indices.has(-1)
			if (includesAllAlgCtors) {
				const arrSpliced = arr.filter((_, i) => !indices.has(i))
				return [...arrSpliced, variant]
			}
		}

		return [...prev, ty]
	}, [] as Exclude<Value, TyUnion>[])

	if (normalizedTypes.length === 0) return Bottom.instance
	if (normalizedTypes.length === 1) return normalizedTypes[0]

	return TyUnion.fromTypesUnsafe(normalizedTypes)
}

export function intersectTy(...types: Value[]) {
	if (types.length === 0) return All.instance
	if (types.length === 1) return types[0]

	const [first, ...rest] = types
	return rest.reduce(intersectTwo, first)

	function intersectTwo(a: Value, b: Value): Value {
		if (b.isSubtypeOf(a)) return b
		if (a.isSubtypeOf(b)) return a

		// TODO: Below code takes O(n^2) time
		const aTypes = a.type === 'tyUnion' ? a.types : [a]
		const bTypes = b.type === 'tyUnion' ? b.types : [b]

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
