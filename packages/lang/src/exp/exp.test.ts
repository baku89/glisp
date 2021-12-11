import {evaluate, parse, testEval} from '../utils/TestUtil'
import {
	all,
	bottom,
	dict,
	False,
	isEqual,
	isSubtype,
	num,
	str,
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
} from '.'
import {TyUnion} from './exp'

describe('value equality', () => {
	test('()')
	test('_')
	test('_|_')
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
	test(TyUnion.fromTypesUnsafe([num(1), num(2), num(3)]))

	function test(input: string | Value) {
		const inputStr = typeof input === 'string' ? input : input.print()
		it(`${inputStr} equals to itself`, () => {
			const value = parse(input).eval2().result
			expect(isEqual(value, value)).toBe(true)
		})
	}
})

describe('evaluating literals', () => {
	testEval('_', all)
	testEval('_|_', bottom)
	testEval('()', unit)
	testEval('0', num(0))
	testEval('"foo"', str('foo'))
	testEval('true', True)
	testEval('false', False)

	testEval('[]', vec())
	testEval('[0]', vec(num(0)))
	testEval('[...Num]', tyVec([], tyNum))
	testEval('[1 ...Num]', tyVec([num(1)], tyNum))
	testEval('[0]', vec(num(0)))
	testEval('{a:1 b:2}', dict({a: num(1), b: num(2)}))
	testEval(
		'{a?:Num ...Str}',
		tyDict({a: {optional: true, value: tyNum}}, tyStr)
	)
	testEval('(-> [Num] Num)', tyFn(tyNum, tyNum))
	testEval('<T>', tyVar('T'))
	testEval('(let a = 10 a)', num(10))
	testEval('(let a = (let a = 20 a) a)', num(20))
})

describe('evaluating function definition', () => {
	testEval('((=> [] 5))', '5')
	testEval('((=> [x:Num] x) 1)', '1')
	testEval('((=> [x:Num] (+ x 1)) 10)', '11')
	testEval(
		`
(let add = (=> [x:Num] (=> [y:Num] (+ x y)))
     ((add 2) 3))
`,
		'5'
	)
	testEval(
		`
(let f = (=> [x:Num] (let x = 20 x))
     (f 5))
`,
		'20'
	)
	testEval(
		`
(let f = (=> [x:Num] (let x = 100 (=> [y:Num] (+ x y))))
     ((f 2) 3))
`,
		'103'
	)
})

describe('default values of types', () => {
	test('1', '1')
	test('Num', '0')
	test('Str', '""')
	test('Bool', 'false')
	// run('(| 3 4)', '3')
	// run('(| Num Bool)', '0')
	// run('(| Bool Num)', 'false')
	test('()', '()')
	test('_', '()')
	test('_|_', '_|_')
	test('<T>', '()')

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
	test('(-> [Num] Bool)', 'false', true)
	test('(-> [<T>] <T>)', '()', true)
	test('(-> [_] ())', '()', true)

	function test(input: string, expected: string, fn = false) {
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
	test('_|_', 'Num', '<')
	test('0', '_', '<')
	test('Num', '_', '<')
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
	test('1', 'Num', '<')
	// run('1', Exp.tyNum.extends('1'), true)
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
	// run('[true false]', '(-> [Num] (| () Bool))', true)
	// run('[1 2 3 4 5]', '(-> [Num] (| () Num))', true)
	// run('[...Num]', '(-> [Num] (| () Num))', true)
	// run('[...Bool]', '(-> [Num] (| () Num))', false)

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
	test('_|_', true)
	test('()', false)
	test('0', false)
	test('"hello"', false)
	test('false', false)
	test('<T>', true)
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
	test('Num', '_')

	test('0', 'Num')
	test('"hello"', 'Num', false)
	test('0', '<T>', false)
	test('<T>', '<T>', false)
	test('<T>', '_')

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
			const iv = evaluate(parse(i))
			const tv = evaluate(parse(t))
			expect(iv.infer2().isSubtypeOf(tv)).toBe(expected)
		})
	}
})

describe('inferring expression type', () => {
	test('_', '_')
	test('_|_', '_')
	test('()', '()')
	test('0', '0')
	test('"foo"', '"foo"')
	test('true', 'true')

	test('<T>', '_')

	test('Num', '_')
	test('Bool', '_')

	test('[]', '[]')
	test('[0 1]', '[0 1]')
	test('[Num]', '[_]')
	test('[...0]', '_')

	test('{}', '{}')
	test('{a:0}', '{a:0}')
	test('{a:Num}', '{a:_}')
	test('{a?:0}', '_')
	test('{...0}', '_')
	test('{a: Num}', '{a: _}')
	test('{a: (+ 1 2)}', '{a: Num}')

	test('(+ 1 2)', 'Num')
	test('[(+ 1 2)]', '[Num]')

	test('(=> [] 5)', '(-> [] 5)')
	test('(=> [x:Num] "foo")', '(-> [Num] "foo")')
	test('(=> [x:Num] x)', '(-> [Num] Num)')
	test('(=> [x:(+ 1 2)] (+ x 4))', '(-> [3] Num)')
	test('(=> [x:_] Num)', '(-> [_] _)')

	test('(-> [Num] Num)', '_')

	test('(let a = Num a)', '_')
	test('(let a = 10)', '()')
	test('(let a = (+ 1 2) b = a b)', 'Num')

	test('((=> <T> [x:T] x) 4)', '4')
	test('((=> <T> [x:T] x) (+ 1 2))', 'Num')
	test('((=> <T> [f:(-> [T] T)] f) inc)', '(-> [Num] Num)')
	test('((=> <T> [f:(-> [T] T)] (=> [x:T] (f x))) inc)', '(-> [Num] Num)')

	function test(input: string, expected: string) {
		it(`${input} is inferred to be ${expected}`, () => {
			const i = parse(input).infer2()
			const e = parse(expected).eval2().result

			if (!i.isEqualTo(e)) throw new Error('Got=' + i.print())
		})
	}
})

describe('evaluating function body', () => {
	test('(=> [x:Num] x)', '0')
	test('(=> [x:Num] (+ x 10))', '10')
	test('(=> [x:Bool] x)', 'false')
	test('(=> <T> [x:T] x)', '()')

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
