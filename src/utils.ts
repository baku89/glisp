import Case from 'case'
import {Ref, unref} from 'vue'

import {MalKeyword, MalVal} from '@/mal/types'

export function replaceRange(
	s: string,
	start: number,
	end: number,
	substitute: string
): [string, number, number] {
	return [
		s.substring(0, start) + substitute + s.substring(end),
		start,
		end + (substitute.length - (end - start)),
	]
}

export const unsignedMod = (x: number, y: number) => ((x % y) + y) % y

/**
 * Converts the bind expression to parameter's label
 * @param exp A bind expression
 */
export function getParamLabel(exp: MalVal) {
	const str = MalKeyword.is(exp) ? exp.value : exp.print()
	return str.length === 1 ? str : Case.capital(str)
}

export function partition<T>(n: number, coll: T[]): T[][] {
	const ret: T[][] = []

	for (let i = 0; i < coll.length; i += n) {
		ret.push(coll.slice(i, i + n))
	}
	return ret
}

export function delay(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

export function getHTMLElement(
	el: Ref<HTMLElement | any | null> | HTMLElement
): HTMLElement | undefined {
	const _el = unref(el)
	return _el instanceof HTMLElement
		? _el
		: _el instanceof Object && _el.$el instanceof HTMLElement
		? _el.$el
		: undefined
}

export function objectMap<V, T>(
	obj: {[k: string]: V},
	f: (value: [string, V]) => [string, T]
) {
	return Object.fromEntries(Object.entries(obj).map(f))
}
