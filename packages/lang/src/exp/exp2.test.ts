import * as Exp from '../exp'
import {parse, testEval} from '../utils/testUtils2'

describe('evaluating literals', () => {
	testEval(Exp.all, Exp.all)
	testEval(Exp.bottom, Exp.bottom)
	testEval(Exp.unit, Exp.unit)
	testEval(Exp.num(0), Exp.num(0))
	testEval(Exp.str('foo'), Exp.str('foo'))
	testEval(Exp.sym('true2'), Exp.True)
	testEval(Exp.sym('false2'), Exp.False)

	testEval('[]', Exp.vec())
	testEval('[0]', Exp.vec(Exp.num(0)))
	testEval('[...Num2]', Exp.tyVec([], Exp.tyNum))
	testEval('[1 ...Num2]', Exp.tyVec([Exp.num(1)], Exp.tyNum))
	testEval(Exp.vec(Exp.num(0)), Exp.vec(Exp.num(0)))
	testEval('{a:1 b:2}', Exp.dict({a: Exp.num(1), b: Exp.num(2)}))
	testEval(
		'{a?:Num2 ...Str}',
		Exp.tyDict({a: {optional: true, value: Exp.tyNum}}, Exp.tyStr)
	)
	testEval('(-> [Num2] Num2)', Exp.tyFn(Exp.tyNum, Exp.tyNum))
	testEval('<T>', Exp.tyVar('T'))
	testEval('{a = 10 a}', Exp.num(10))
	testEval('{a = {a = 20 a} a}', Exp.num(20))
})

describe('inferring expression type', () => {
	testInfer('_', Exp.all)
	testInfer('_|_', Exp.tyValue(Exp.bottom))
	testInfer('()', Exp.unit)
	testInfer('0', Exp.num(0))
	testInfer('"foo"', Exp.str('foo'))
	testInfer('true2', Exp.True)

	testInfer('Num2', Exp.tyValue(Exp.tyNum))
	testInfer('Bool2', Exp.tyValue(Exp.tyBool))

	testInfer('[]', Exp.vec())
	testInfer('[0 1]', Exp.vec(Exp.num(0), Exp.num(1)))
	testInfer('[Num2]', Exp.vec(Exp.tyValue(Exp.tyNum)))
	testInfer('[...0]', Exp.tyValue(Exp.tyVec([], Exp.num(0))))
	testInfer('{}', Exp.dict({}))
	testInfer('{a:0}', Exp.dict({a: Exp.num(0)}))
	testInfer('{a:Num2}', Exp.dict({a: Exp.tyValue(Exp.tyNum)}))
	testInfer(
		'{a?:0}',
		Exp.tyValue(Exp.tyDict({a: {optional: true, value: Exp.num(0)}}))
	)
	testInfer('{...0}', Exp.tyValue(Exp.tyDict({}, Exp.num(0))))
	testInfer('{a = Num2 a}', Exp.tyValue(Exp.tyNum))

	function testInfer(input: string, expected: Exp.Value) {
		it(`${input} is inferred to be ${expected.print()}`, () => {
			const inferred = parse(input).infer2()

			if (!inferred.isEqualTo(expected))
				throw new Error('Got=' + inferred.print())
		})
	}
})
