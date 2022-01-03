import {parse, testEval} from '../util/TestUtil'
import {
	all,
	dict,
	False,
	never,
	num,
	str,
	True,
	tyFn,
	tyNum,
	tyStr,
	unit,
	vec,
	vecFrom,
} from '../val'

describe('evaluating literals', () => {
	testEval('_', all)
	testEval('Never', never)
	testEval('()', unit)
	testEval('0', num(0))
	testEval('"foo"', str('foo'))
	testEval('true', True)
	testEval('false', False)

	testEval('[]', vec())
	testEval('[0]', vec(num(0)))
	testEval('[...Num]', vecFrom([], undefined, tyNum))
	testEval('[1 ...Num]', vecFrom([num(1)], undefined, tyNum))
	testEval('[0]', vec(num(0)))
	testEval('{a:1 b:2}', dict({a: num(1), b: num(2)}))
	testEval('{a?:Num ...Str}', dict({a: tyNum}, ['a'], tyStr))
	testEval('(-> [Num] Num)', tyFn(tyNum, tyNum))
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
	testEval('((=> f:(-> Num Num) (f 1)) id)', '1')
})

describe('run-time error handling', () => {
	testEval('(try ([] 0) 1)', '1', true)
})

describe('inferring expression type', () => {
	test('_', '_')
	test('Never', '_')
	test('()', '()')
	test('0', '0')
	test('"foo"', '"foo"')
	test('true', 'true')

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
	test('(try 1 2)', '(| 1 2)')

	function test(input: string, expected: string) {
		it(`${input} is inferred to be ${expected}`, () => {
			const i = parse(input).infer().result
			const e = parse(expected).eval().result

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
			const e = parse(expected).eval().result

			if (i.type !== 'eFn') throw new Error('Not a function, got =' + i.print())

			const result = i.body.eval().result

			if (!result.isEqualTo(e)) throw new Error('Got=' + result.print())
		})
	}
})
