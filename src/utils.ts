import Case from 'case'
import {MalVal, isKeyword, isSymbol} from '@/mal/types'
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
 * @param exp A bind expression
 */
export function getParamLabel(exp: MalVal) {
	const str = isKeyword(exp) || isSymbol(exp) ? exp.slice(1) : printExp(exp)
	return str.length === 1 ? str : Case.capital(str)
}

const valueSymbol = Symbol('NonReactive.value')

/**
 * The utility class holds a value which does not need to be watched by Vue
 */
export class NonReactive<T> {
	constructor(value: T) {
		;(this as any)[valueSymbol] = value
	}

	public get value(): T {
		return (this as any)[valueSymbol]
	}
}

/**
 * Creates NonReactive object
 */
export function nonReactive<T>(value: T): NonReactive<T> {
	return new NonReactive(value)
}
