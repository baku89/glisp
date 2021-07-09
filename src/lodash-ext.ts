import _ from 'lodash'

const _$ = {
	zipShorter<T, U>(array1: T[], array2: U[]) {
		const len = Math.min(array1.length, array2.length)
		return _.zip(_.take(array1, len), _.take(array2, len)) as [T, U][]
	},
	valuesByKeys<T>(object: Record<string, T>, keys: string[]) {
		return keys.map(key => object[key])
	},
	everyByPair<T, U>(
		array1: T[],
		array2: U[],
		predicate: (a1: T, a2: U) => boolean
	) {
		const len = Math.min(array1.length, array2.length)
		for (let i = 0; i < len; i++) {
			if (!predicate(array1[i], array2[i])) return false
		}
		return true
	},
}

export default _$
