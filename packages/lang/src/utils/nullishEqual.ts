export function nullishEqual<T>(
	a: T | null | undefined,
	b: T | null | undefined,
	f: (x: T, y: T) => boolean
): boolean {
	if (a !== null && a !== undefined && b !== null && b !== undefined)
		return f(a, b)
	if (!a && !b) return true
	return false
}
