export function nullishEqual<T>(
	a: T | null,
	b: T | null,
	f: (x: T, y: T) => boolean
): boolean {
	if (a === null && b === null) return true
	if (a !== null && b !== null) return f(a, b)
	return false
}
