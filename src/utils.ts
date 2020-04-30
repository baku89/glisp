import Case from 'case'
import {MalVal} from '@/mal/types'
import printExp from '@/mal/printer'

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
 * Converts the bind expression to parameter's label
 * except for one letter
 * @param str original value
 */
export function getParamLabel(ast: MalVal) {
	const str = printExp(ast)
	return str.length === 1 ? str : Case.capital(str)
}
