import _ from 'lodash'

const _$ = {
	zipShorter<T, U>(array1: T[], array2: U[]) {
		const len = Math.min(array1.length, array2.length)
		return _.zip(_.take(array1, len), _.take(array2, len)) as [T, U][]
	},
	uncurry<T, U, V>(func: (arg0: T, arg1: U) => V) {
		return ([arg0, arg1]: [T, U]) => func(arg0, arg1)
	},
}

export default _$
