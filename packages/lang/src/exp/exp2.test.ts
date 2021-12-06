import {
	all,
	bottom,
	dict,
	False,
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
	vec,
} from '../exp'
import {parse, testEval} from '../utils/testUtils2'

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
