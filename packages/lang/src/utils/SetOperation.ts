export function union<T>(...sets: Set<T>[]): Set<T> {
	const arr = sets.flatMap(s => Array.from(s))
	return new Set(arr)
}
