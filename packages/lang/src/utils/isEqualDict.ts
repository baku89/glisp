import {identity, keys} from 'lodash'

export function isEqualDict<T>(
	a: Record<string, T>,
	b: Record<string, T>,
	isEqual: (a: T, b: T) => boolean = identity
): boolean {
	const aKeys = new Set(keys(a))
	const bKeys = new Set(keys(b))

	for (const k of aKeys) {
		if (!bKeys.has(k)) return false
		if (!isEqual(a[k], b[k])) return false
		bKeys.delete(k)
	}

	return bKeys.size === 0
}
