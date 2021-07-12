import {equalsValue, evalExp, readStr} from './glisp'

function test(test: string, toBe: string) {
	const _test = evalExp(readStr(test)).result
	const _toBe = evalExp(readStr(toBe)).result

	const succeed = equalsValue(_test, _toBe)
	const fn = succeed ? console.log : console.error

	const msg = `${test} | Expected: ${toBe} | Got: ${_test}`

	if (!succeed) {
		alert(msg)
		fn(msg)
	}
}

export default function runTest() {
	test('(instanceof Number *)', 'true')
	test('(instanceof true Boolean)', 'true')
	test('(instanceof * Number)', 'false')
	test('(instanceof Number Number)', 'false')
	test('(instanceof Number String)', 'false')
	test('(instanceof [3 false] [Number])', 'true')
	test('(instanceof [Number Number] [])', 'true')
	test('(instanceof [Number Number] *)', 'true')
	test('(instanceof (+ 1 2) Number)', 'true')
	test('(instanceof + (typeof +))', 'true')

	// Vector
	test('(instanceof [0 1 2] [...Number])', 'true')
	test('(instanceof [...0] [...Number])', 'true')
	test('(instanceof [0 ...0] [...Number])', 'true')
	test('(instanceof [0 1 ...2] [0 ...Number])', 'true')
	test('(instanceof [...0] [Number])', 'false')
	test('(instanceof [...0] [...0])', 'true')
	test('(instanceof [0] [Number Number])', 'false')
}
