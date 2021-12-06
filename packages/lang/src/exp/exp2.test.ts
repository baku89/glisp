import {
	all,
	bottom,
	dict,
	False,
	num,
	str,
	sym,
	True,
	tyBool,
	tyDict,
	tyFn,
	tyNum,
	tyStr,
	tyValue,
	tyVar,
	tyVec,
	unit,
	Value,
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
	testInfer('_', all)
	testInfer('_|_', tyValue(bottom))
	testInfer('()', unit)
	testInfer('0', num(0))
	testInfer('"foo"', str('foo'))
	testInfer('true2', True)

	testInfer('Num2', tyValue(tyNum))
	testInfer('Bool2', tyValue(tyBool))

	testInfer('[]', vec())
	testInfer('[0 1]', vec(num(0), num(1)))
	testInfer('[Num2]', vec(tyValue(tyNum)))
	testInfer('[...0]', tyValue(tyVec([], num(0))))
	testInfer('{}', dict({}))
	testInfer('{a:0}', dict({a: num(0)}))
	testInfer('{a:Num2}', dict({a: tyValue(tyNum)}))
	testInfer('{a?:0}', tyValue(tyDict({a: {optional: true, value: num(0)}})))
	testInfer('{...0}', tyValue(tyDict({}, num(0))))
	testInfer('{a = Num2 a}', tyValue(tyNum))

	function testInfer(input: string, expected: Value) {
		it(`${input} is inferred to be ${expected.print()}`, () => {
			const inferred = parse(input).infer2()

			if (!inferred.isEqualTo(expected))
				throw new Error('Got=' + inferred.print())
		})
	}
})
