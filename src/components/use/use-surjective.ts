import _ from 'lodash'
import {computed, Ref} from 'vue'

export default function useSurjective<X, Y>(
	x: Ref<X>,
	map: (x: X) => Y,
	inverse: (y: Y) => X,
	comparator = _.isEqual
) {
	let inverseCache: {x: X; y: Y} | null = null

	const y = computed(() => {
		const _x = x.value

		if (inverseCache && comparator(_x, inverseCache.x)) {
			return inverseCache.y
		}
		return map(_x)
	})

	function cachedInverse(y: Y) {
		const x = inverse(y)
		inverseCache = {x, y}
		return x
	}

	return {
		y,
		inverse: cachedInverse,
	}
}
