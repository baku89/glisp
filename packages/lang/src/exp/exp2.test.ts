import * as Exp from '../exp'
import {testEval} from '../utils/testUtils2'

describe('evaluating literals', () => {
	testEval(Exp.all, Exp.all)
	testEval(Exp.bottom, Exp.bottom)
	testEval(Exp.unit, Exp.unit)
	testEval(Exp.num(0), Exp.num(0))
	testEval(Exp.str('foo'), Exp.str('foo'))
	testEval(Exp.sym('true2'), Exp.True)
	testEval(Exp.sym('false2'), Exp.False)
	testEval('[0]', Exp.vec(Exp.num(0)))
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
