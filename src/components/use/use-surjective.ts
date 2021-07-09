import _ from 'lodash'

export default function useSurjective<X, Y>(
	map: (x: X) => Y,
	inverse: (y: Y) => X,
	comparator = _.isEqual
) {
	let cached: {x: X; y: Y} | null = null

	function cachedMap(x: X) {
		if (cached && comparator(x, cached.x)) {
			return cached.y
		}
		return map(x)
	}

	function cachedInverse(y: Y) {
		const x = inverse(y)
		cached = {x, y}
		return x
	}

	return {
		map: cachedMap,
		inverse: cachedInverse,
	}
}
