import {equalsValue, evalStr} from './glisp'

function test(test: string, toBe: string) {
	const [_test] = evalStr(test)
	const [_toBe] = evalStr(toBe)

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

	// Subtype
	test('(subtypeof (| 1 2 3) (| 1 2 3 4))', 'true')

	// Vector
	test('(instanceof [0 1 2] [...Number])', 'true')
	test('(instanceof [...0] [...Number])', 'true')
	test('(instanceof [0 ...0] [...Number])', 'true')
	test('(instanceof [0 1 ...2] [0 ...Number])', 'true')
	test('(instanceof [...0] [Number])', 'false')
	test('(instanceof [...0] [...0])', 'true')
	test('(instanceof [0] [Number Number])', 'false')
	/* 
	// Expression
	test('(+ 1 2 (+ 3 4))', '10')
	test('((=> [x:Boolean] (not x)) true)', 'false')
	test('(((=> [x:Number] (=> [y: Number] (* x y))) 4) 10)', '40')
	
	// spread Normalization
	test('[...1 ...1 1 ...1]', '[...1]')
	test('{key: 1 ...1}', '{...1}')

	// Maybe Normalization
	test('??Number', '?Number')
	test('?_', '_')
	test('(| 1 2 ?3)', '?(| 1 2 3)') */
}
