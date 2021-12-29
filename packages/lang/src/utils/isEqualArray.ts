import {identity} from 'lodash'

export function isEqualArray<A, B>(
	a: readonly A[],
	b: readonly B[],
	isEqual: (a: A, b: B) => boolean = identity
) {
	return a.length === b.length && a.every((ai, i) => isEqual(ai, b[i]))
}
