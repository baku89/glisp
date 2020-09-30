import Case from 'case'
import {MalVal, MalKeyword} from '@/mal/types'
import printExp from '@/mal/printer'
import {Ref, unref} from 'vue'

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

export function clamp(value: number, min: number, max: number) {
	return Math.max(min, Math.min(value, max))
}

/**
 * Converts the bind expression to parameter's label
 * @param exp A bind expression
 */
export function getParamLabel(exp: MalVal) {
	const str = MalKeyword.isType(exp) ? exp.value : printExp(exp)
	return str.length === 1 ? str : Case.capital(str)
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
