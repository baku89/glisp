import * as Exp from '../Exp'
import {evaluate, parse} from '../utils/testUtils2'

describe('subtyping', () => {
	// Top, Bottom, Unit
	test('_|_', '_|_', '=')
	test('_|_', '_', '<')
	test('_|_', '()', '<')
	test('_|_', '0', '<')
	test('_|_', 'Num2', '<')
	test('0', '_', '<')
	test('Num2', '_', '<')
	test('_', '_', '=')
	test('()', '()', '=')
	test('()', '0', '!=')
	test('()', '_', '<')

	// Atom, TyAtom
	test('1', '1', '=')
	test('1', 'Num2', '<')
	// run('1', Exp.tyNum.extends('1'), true)
	test('"hello"', '"hello"', '=')
	test('"hello"', 'Str2', '<')
	test('Str2', 'Num2', '!=')
	test('"hello"', 'Num2', '!=')
	test('1', '_', '<')
	test('Str2', 'Str2', '=')
	test('Num2', 'Num2', '=')

	// Enum
	test('true2', 'true2', '=')
	test('false2', 'Bool2', '<')
	test('Bool2', 'Bool2', '=')

	// Vectors
	test('[]', '[]', '=')
	test('[1]', '[]', '<')
	test('[1]', '[1]', '=')
	test('[1 2]', '[1]', '<')
	test('[1]', '[true]', '!=')
	test('[1]', '[Num2]', '<')
	//run('[1 Num2]', '[(| 1 Bool2) Num2]', '<')
	test('[1 2]', '[Num2 Num2]', '<')
	test('[...0]', '[...0]', '=')
	test('[...0]', '[...1]', '!=')
	test('[0 ...0]', '[...0]', '<')
	test('[...0]', '[]', '=')
	test('[0 ...0]', '[]', '<')
	test('[0 0]', '[...0]', '<')
	// run('[true false]', '(-> [Num2] (| () Bool2))', true)
	// run('[1 2 3 4 5]', '(-> [Num2] (| () Num2))', true)
	// run('[...Num2]', '(-> [Num2] (| () Num2))', true)
	// run('[...Bool2]', '(-> [Num2] (| () Num2))', false)

	// Dict
	test('{}', '{}', '=')
	test('{a:0}', '{a:_}', '<')
	test('{a:_|_}', '{a:0}', '<')
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

	test('(-> [] 0)', '(-> [_] Num2)', '<')
	test('(-> [Num2] _)', '(-> [0] _)', '<')

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
			expect(Exp.isSubtype(x, y)).toBe(x2y)
			expect(Exp.isSubtype(y, x)).toBe(y2x)
		})
	}
})

describe('checking type or atom', () => {
	test('_', false)
	test('_|_', true)
	test('()', false)
	test('0', false)
	test('"hello"', false)
	test('false2', false)
	test('Num2', true)
	test('Bool2', true)
	test('[]', false)
	test('[1 1]', false)
	test('[Num2 1]', true)
	test('[[]]', false)
	test('[[1 2] [Num2]]', true)
	test('[...1]', true)
	test('[...Num2]', true)
	test('{}', false)
	test('{a:1}', false)
	test('{a:Num2}', true)
	test('{a?:1}', true)
	test('{a?:Num2}', true)
	test('{...0}', true)
	test('{...Num2}', true)
	test('(-> [] _)', true)
	test('+$', false)

	function test(input: string, isType: boolean) {
		it(input + ' is ' + (isType ? 'type' : 'an atom'), () => {
			const exp = evaluate(parse(input))
			expect(exp.isType).toBe(isType)
		})
	}
})

describe('instance relationship', () => {
	test('_', '_')
	test('_|_', '_')
	test('()', '()')
	test('_|_', '_|_', false)
	test('0', '_')
	test('Num2', '_')

	test('0', 'Num2')
	test('"hello"', 'Num2', false)

	test('[]', '[]')
	test('[1 2]', '[...Num2]')
	test('[1 2 ...3]', '[...Num2]', false)
	test('[Num2 Num2]', '[...Num2]', false)

	test('{}', '{}')
	test('{a:1 b:2}', '{...Num2}')
	test('{a:1 ...2}', '{a:1 b:2}', false)
	test('{}', '{a?:Num2}')
	test('{a:1}', '{a?:Num2}')
	test('{a:1 b:"foo"}', '{...Num2}', false)

	test('+$', '(-> [Num2 Num2] Num2)')
	test('(-> [Num2 Num2] Num2)', '(-> [Num2 Num2] Num2)', false)

	function test(i: string, t: string, expected = true) {
		it(`${i} is ${expected ? '' : 'not '}a instance of ${t}`, () => {
			const iv = evaluate(parse(i))
			const tv = evaluate(parse(t))
			expect(iv.isInstanceOf(tv)).toBe(expected)
			expect(iv.infer2().isSubtypeOf(tv)).toBe(expected)
		})
	}
})
