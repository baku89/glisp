import Case from 'case'

export function replaceRange(
	s: string,
	start: number,
	end: number,
	substitute: string
): [string, number, number] {
	return [
		s.substring(0, start) + substitute + s.substring(end),
		start,
		end + (substitute.length - (end - start))
	]
}

export function clamp(value: number, min: number, max: number) {
	return Math.max(min, Math.min(value, max))
}

/**
 * Converts the text to a capital case for parameter's label
 * except for one letter
 * @param str original value
 */
export function getParamCase(str: string) {
	return str.length === 1 ? str : Case.capital(str)
}
