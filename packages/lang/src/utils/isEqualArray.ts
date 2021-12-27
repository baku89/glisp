import {identity} from 'lodash'

export function isEqualArray<A, B>(
	a: A[],
	b: B[],
	isEqual: (a: A, b: B) => boolean = identity
) {
	return a.length === b.length && a.every((ai, i) => isEqual(ai, b[i]))
}
