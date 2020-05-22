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
let counter = 0

export class NonReactive<T> {
	private id: number

	constructor(value: T) {
		this.id = counter++
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

export function partition(n: number, coll: any[]) {
	const ret = []

	for (let i = 0; i < coll.length; i += n) {
		ret.push(coll.slice(i, i + n))
	}
	return ret
}

export function delay(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms))
}
