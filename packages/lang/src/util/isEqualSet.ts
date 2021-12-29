export function isEqualSet<T>(a: Set<T>, b: Set<T>) {
	if (a.size !== b.size) return false
	for (const ai of a) if (!b.has(ai)) return false
	return true
}
