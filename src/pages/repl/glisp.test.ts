import {logToString} from '@/lib/WithLog'

import {equalsValue, evalStr} from './glisp'

function rep(test: string, toBe: string) {
	const [_test, testLog] = evalStr(test)
	const [_toBe, toBeLog] = evalStr(toBe)

	const log = [...testLog, ...toBeLog]

	if (log.length > 0) {
		throw new Error(logToString(log))
	}

	return equalsValue(_test, _toBe)
}

function expectRep(code: string, result: string) {
	return expect(rep(code, result)).toBeTruthy()
}

test('Type comparison', () => {
	expectRep('(instanceof Number *)', 'true')
	expectRep('(instanceof true Boolean)', 'true')
	expectRep('(instanceof * Number)', 'false')
	expectRep('(instanceof Number Number)', 'false')
	expectRep('(instanceof Number String)', 'false')
	expectRep('(instanceof [3 false] [Number])', 'true')
	expectRep('(instanceof [Number Number] [])', 'true')
	expectRep('(instanceof [Number Number] *)', 'true')
	expectRep('(instanceof (+ 1 2) Number)', 'true')
	expectRep('(instanceof + (typeof +))', 'true')
	expectRep('(instanceof Number *)', 'true')

	expectRep('(instanceof [0 1 2] [...Number])', 'true')
	expectRep('(instanceof [...0] [...Number])', 'true')
	expectRep('(instanceof [0 ...0] [...Number])', 'true')
	expectRep('(instanceof [0 1 ...2] [0 ...Number])', 'true')
	expectRep('(instanceof [...0] [Number])', 'false')
	expectRep('(instanceof [...0] [...0])', 'true')
	expectRep('(instanceof [0] [Number Number])', 'false')
})

test('Expressions', () => {
	expectRep('(+ 1 2 (+ 3 4))', '10')
	expectRep('((=> [x:Boolean] (not x)) true)', 'false')
	expectRep('(((=> [x:Number] (=> [y: Number] (* x y))) 4) 10)', '40')
})

test('Normalization logics', () => {
	// spread Normalization
	expectRep('[...1 ...1 1 ...1]', '[...1]')
	expectRep('{key: 1 ...1}', '{...1}')

	// Maybe Normalization
	expectRep('??Number', '?Number')
	expectRep('?_', '_')
	expectRep('(| 1 2 ?3)', '?(| 1 2 3)')
})
