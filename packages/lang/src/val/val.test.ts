import {evaluate, parse} from '../util/TestUtil'
import {isEqual, isSubtype, Value} from './val'

describe('value equality', () => {
	test('()')
	test('_')
	test('Never')
	test('0')
	test('"hello"')
	test('false')
	test('Num')
	test('[1 1]')
	test('[1 ...1]')
	test('{a: 10}')
	test('{a?: 10}')
	test('{...Num}')
	test('(-> [Num] Num)')
	test('(| 1 2 3)')

	function test(input: string) {
		it(`${input} equals to itself`, () => {
			const value = parse(input).eval().result
			expect(isEqual(value, value)).toBe(true)
		})
	}
})

describe('subtyping', () => {
	// All, Never, Unit
	test('Never', 'Never', '=')
	test('Never', '_', '<')
	test('Never', '()', '<')
	test('Never', '0', '<')
	test('Never', 'Num', '<')
	test('0', '_', '<')
	test('Num', '_', '<')
	test('_', '_', '=')
	test('()', '()', '=')
	test('()', '0', '!=')
	test('()', '_', '<')

	// Atom, TyAtom
	test('1', '1', '=')
	test('1', 'Num', '<')
	// run('1', Val.NumType.extends('1'), true)
	test('"hello"', '"hello"', '=')
	test('"hello"', 'Str', '<')
	test('Str', 'Num', '!=')
	test('"hello"', 'Num', '!=')
	test('1', '_', '<')
	test('Str', 'Str', '=')
	test('Num', 'Num', '=')

	// Enum
	test('true', 'true', '=')
	test('false', 'Bool', '<')
	test('Bool', 'Bool', '=')

	// Vectors
	test('[]', '[]', '=')
	test('[1]', '[]', '<')
	test('[1]', '[1]', '=')
	test('[1 2]', '[1]', '<')
	test('[1]', '[true]', '!=')
	test('[1]', '[Num]', '<')
	//run('[1 Num]', '[(| 1 Bool) Num]', '<')
	test('[1 2]', '[Num Num]', '<')
	test('[...0]', '[...0]', '=')
	test('[...0]', '[...1]', '!=')
	test('[0 ...0]', '[...0]', '<')
	test('[...0]', '[]', '=')
	test('[0 ...0]', '[]', '<')
	test('[0 0]', '[...0]', '<')
	test('[0]', '[0?]', '<')
	test('[]', '[0?]', '=')
	test('[0?]', '[0?]', '=')
	test('[...0]', '[0? ...0]', '=')
	test('[...0]', '[0?]', '=')
	test('[0 0 0? ...0]', '[0 0?]', '<')
	test('[0 0 0? ...0]', '[0 0? ...0]', '<')

	// Dict
	test('{}', '{}', '=')
	test('{a:0}', '{a:_}', '<')
	test('{a:Never}', '{a:0}', '<')
	test('{a:0}', '{a:0}', '=')
	test('{a:0}', '{a:1}', '!=')
	test('{a:0 b:0}', '{a:0}', '<')
	test('{a:0}', '{a?:0}', '<')
	test('{a?:0}', '{a?:0}', '=')
	test('{}', '{a?:0}', '=')
	test('{a:0 b:0}', '{...0}', '<')
	test('{a:0 b:1}', '{...0}', '!=')
	test('{a?:0}', '{...0}', '=')
	test('{a?:0 ...1}', '{...0}', '!=')
	test('{a:0 ...0}', '{...0}', '<')
	test('{a?:0 ...0}', '{...0}', '=')

	// TyFn
	test('(-> [] _)', '(-> [] _)', '=')
	test('(-> [_ _] _)', '(-> [_ _ _ _] _)', '<')
	test('(-> [(-> [_] _)] _)', '(-> [(-> [] _)] _)', '<')
	test('(-> [] (-> [] _))', '(-> [] (-> [_] _))', '<')

	test('(-> [] 0)', '(-> [_] Num)', '<')
	test('(-> [Num] _)', '(-> [0] _)', '<')

	function test(xInput: string, yInput: string, expected: '<' | '=' | '!=') {
		it(`${xInput} ${expected} ${yInput}`, () => {
			const x = evaluate(parse(xInput))
			const y = evaluate(parse(yInput))

			const [x2y, y2x] =
				expected === '<'
					? [true, false]
					: expected === '='
					? [true, true]
					: [false, false]
			expect(isSubtype(x, y)).toBe(x2y)
			expect(isSubtype(y, x)).toBe(y2x)
		})
	}
})

describe('checking type or atom', () => {
	test('_', false)
	test('Never', true)
	test('()', false)
	test('0', false)
	test('"hello"', false)
	test('false', false)
	test('Num', true)
	test('Bool', true)
	test('[]', false)
	test('[1 1]', false)
	test('[Num 1]', true)
	test('[[]]', false)
	test('[[1 2] [Num]]', true)
	test('[...1]', true)
	test('[...Num]', true)
	test('{}', false)
	test('{a:1}', false)
	test('{a:Num}', true)
	test('{a?:1}', true)
	test('{a?:Num}', true)
	test('{...0}', true)
	test('{...Num}', true)
	test('(-> [] _)', true)
	test('+', false)

	function test(input: string, isType: boolean) {
		it(input + ' is ' + (isType ? 'type' : 'an atom'), () => {
			const node = evaluate(parse(input))
			expect(node.isType).toBe(isType)
		})
	}
})

describe('instance relationship', () => {
	test('_', '_')
	test('Never', '_')
	test('()', '()')
	test('Never', 'Never', false)
	test('0', '_')
	test('Num', '_')

	test('0', 'Num')
	test('"hello"', 'Num', false)

	test('[]', '[]')
	test('[1 2]', '[...Num]')
	test('[1 2 ...3]', '[...Num]', false)
	test('[Num Num]', '[...Num]', false)

	test('{}', '{}')
	test('{a:1 b:2}', '{...Num}')
	test('{a:1 ...2}', '{a:1 b:2}', false)
	test('{}', '{a?:Num}')
	test('{a:1}', '{a?:Num}')
	test('{a:1 b:"foo"}', '{...Num}', false)

	test('+', '(-> [Num Num] Num)')
	test('(-> [Num Num] Num)', '(-> [Num Num] Num)', false)

	function test(i: string, t: string, expected = true) {
		it(`${i} is ${expected ? '' : 'not '}a instance of ${t}`, () => {
			const iv = parse(i)
			const tv = evaluate(parse(t))
			expect(iv.infer().result.isSubtypeOf(tv)).toBe(expected)
		})
	}
})

describe('default values of types', () => {
	test('1', '1')
	test('Num', '0')
	test('Str', '""')
	test('Bool', 'false')
	test('(| 3 4)', '3')
	test('(| Num Bool)', '0')
	test('(| Bool Num)', 'false')
	test('()', '()')
	test('_', '()')
	test('Never', 'Never')

	test('[]', '[]')
	test('[Num Str]', '[0 ""]')
	test('[...Num]', '[]')
	test('[Num ...Num]', '[0]')

	test('{}', '{}')
	test('{a:Num b:Str}', '{a:0 b:""}')
	test('{a:Num b?:Str}', '{a:0}')
	test('{...Num}', '{}')
	test('{a:Num ...Str}', '{a:0}')
	test('{a?:Num ...Str}', '{}')

	test('(-> [] Num)', '0', true)
	test('(-> Num Bool)', 'false', true)
	test('(-> <T> T T)', '()', true)
	test('(-> _ ())', '()', true)

	function test(input: string, expected: string, fn = false) {
		const eStr = fn ? `(=> [] ${expected})` : expected

		it(`default value of '${input}' is '${eStr}'`, () => {
			let dv: Value = parse(input).eval().result.defaultValue
			const ev = parse(expected).eval().result

			if (fn) {
				if (dv.type !== 'Fn') throw new Error('Got=' + dv.print())
				dv = dv.fn().result
			}

			if (!dv.isEqualTo(ev)) {
				throw new Error('Got=' + dv.print())
			}
		})
	}
})
