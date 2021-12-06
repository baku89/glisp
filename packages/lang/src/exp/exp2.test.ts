import {
	all,
	bottom,
	dict,
	False,
	isSubtype,
	num,
	str,
	sym,
	True,
	tyDict,
	tyFn,
	tyNum,
	tyStr,
	tyVar,
	tyVec,
	unit,
	Value,
	vec,
} from '../exp'
import {evaluate, parse, testEval} from '../utils/testUtils2'

describe('default values of types', () => {
	run('1', '1')
	run('Num2', '0')
	run('Str2', '""')
	run('Bool2', 'false2')
	// run('(| 3 4)', '3')
	// run('(| Num2 Bool2)', '0')
	// run('(| Bool2 Num2)', 'false2')
	run('()', '()')
	run('_', '()')
	run('_|_', '_|_')
	run('<T>', '()')

	run('[]', '[]')
	run('[Num2 Str2]', '[0 ""]')
	run('[...Num2]', '[]')
	run('[Num2 ...Num2]', '[0]')

	run('{}', '{}')
	run('{a:Num2 b:Str2}', '{a:0 b:""}')
	run('{a:Num2 b?:Str2}', '{a:0}')
	run('{...Num2}', '{}')
	run('{a:Num2 ...Str2}', '{a:0}')
	run('{a?:Num2 ...Str2}', '{}')

	run('(-> [] Num2)', '0', true)
	run('(-> [Num2] Bool2)', 'false2', true)
	run('(-> [<T>] <T>)', '()', true)
	run('(-> [_] ())', '()', true)

	function run(input: string, expected: string, fn = false) {
		const eStr = fn ? `(=> [] ${expected})` : expected

		it(`default value of '${input}' is '${eStr}'`, () => {
			let dv: Value = parse(input).eval2().result.defaultValue
			const ev = parse(expected).eval2().result

			if (fn) {
				if (dv.type !== 'fn') throw new Error('Got=' + dv.print())
				dv = dv.fn().result
			}

			if (!dv.isEqualTo(ev)) {
				throw new Error('Got=' + dv.print())
			}
		})
	}
})

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

	test('<T>', '<T>', '=')
	test('<U>', '<T>', '!=')
	test('<U>', '_', '<')
	test('0', '<T>', '!=')

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
			expect(isSubtype(x, y)).toBe(x2y)
			expect(isSubtype(y, x)).toBe(y2x)
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
	test('<T>', true)
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
	test('0', '<T>', false)
	test('<T>', '<T>', false)
	test('<T>', '_')

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
			expect(iv.infer2().isSubtypeOf(tv)).toBe(expected)
		})
	}
})

describe('evaluating literals', () => {
	testEval(all, all)
	testEval(bottom, bottom)
	testEval(unit, unit)
	testEval(num(0), num(0))
	testEval(str('foo'), str('foo'))
	testEval(sym('true2'), True)
	testEval(sym('false2'), False)

	testEval('[]', vec())
	testEval('[0]', vec(num(0)))
	testEval('[...Num2]', tyVec([], tyNum))
	testEval('[1 ...Num2]', tyVec([num(1)], tyNum))
	testEval(vec(num(0)), vec(num(0)))
	testEval('{a:1 b:2}', dict({a: num(1), b: num(2)}))
	testEval(
		'{a?:Num2 ...Str}',
		tyDict({a: {optional: true, value: tyNum}}, tyStr)
	)
	testEval('(-> [Num2] Num2)', tyFn(tyNum, tyNum))
	testEval('<T>', tyVar('T'))
	testEval('{a = 10 a}', num(10))
	testEval('{a = {a = 20 a} a}', num(20))
})

describe('inferring expression type', () => {
	test('_', '_')
	test('_|_', '_')
	test('()', '()')
	test('0', '0')
	test('"foo"', '"foo"')
	test('true2', 'true2')

	test('<T>', '_')

	test('Num2', '_')
	test('Bool2', '_')

	test('[]', '[]')
	test('[0 1]', '[0 1]')
	test('[Num2]', '[_]')
	test('[...0]', '_')

	test('{}', '{}')
	test('{a:0}', '{a:0}')
	test('{a:Num2}', '{a:_}')
	test('{a?:0}', '_')
	test('{...0}', '_')
	test('{a: Num2}', '{a: _}')
	test('{a: (+$ 1 2)}', '{a: Num2}')

	test('(+$ 1 2)', 'Num2')
	test('[(+$ 1 2)]', '[Num2]')

	test('(=> [] 5)', '(-> [] 5)')
	test('(=> [x:Num2] "foo")', '(-> [Num2] "foo")')
	test('(=> [x:Num2] x)', '(-> [Num2] Num2)')
	test('(=> [x:(+$ 1 2)] (+$ x 4))', '(-> [3] Num2)')
	test('(=> [x:_] Num2)', '(-> [_] _)')

	test('(-> [Num2] Num2)', '_')

	test('{a = Num2 a}', '_')
	test('{a = 10}', '()')
	test('{a = (+$ 1 2) b = a b}', 'Num2')

	function test(input: string, expected: string) {
		it(`${input} is inferred to be ${expected}`, () => {
			const i = parse(input).infer2()
			const e = parse(expected).eval2().result

			if (!i.isEqualTo(e)) throw new Error('Got=' + i.print())
		})
	}
})

describe('evaluating function body', () => {
	test('(=> [x:Num2] x)', '0')
	test('(=> [x:Num2] (+$ x 10))', '10')
	test('(=> [x:Bool2] x)', 'false2')

	function test(input: string, expected: string) {
		it(`body of ${input} should evaluate to ${expected}`, () => {
			const i = parse(input)
			const e = parse(expected).eval2().result

			if (i.type !== 'eFn') throw new Error('Not a function, got =' + i.print())

			const result = i.body.eval2().result

			if (!result.isEqualTo(e)) throw new Error('Got=' + result.print())
		})
	}
})
