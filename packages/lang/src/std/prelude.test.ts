import * as Exp from '../exp'
import {testEval} from '../utils/TestUtil'

describe('functions in the prelude module', () => {
	testEval('(+ 1 2)', Exp.num(3))
	testEval('(* 1 2)', Exp.num(2))
	testEval('(< 1 2)', Exp.bool(true))
	testEval('(let a = 10 a)', Exp.num(10))
	testEval('(if true 1 false)', Exp.num(1))
	testEval('(< 4 (if true 1 2))', Exp.bool(false))
	testEval('(not true)', Exp.bool(false))
	testEval('(isEven 2)', Exp.bool(true))
	testEval('(/ 15 5)', Exp.num(3))
	testEval('(mod 5 2)', Exp.num(1))
	testEval('(** 6 3)', Exp.num(216))
	testEval('(gcd 20 16)', Exp.num(4))
	testEval('(- 10 9)', Exp.num(1))

	testEval('(| () Num)', Exp.tyUnion(Exp.unit, Exp.tyNum))

	testEval('(inc 10)', Exp.num(11))
	testEval('(dec 10)', Exp.num(9))
	testEval('(sum [1 2 3 4])', Exp.num(10))
	testEval('(sqrt 25)', Exp.num(5))
	testEval('(hypot 3 4)', Exp.num(5))
	testEval('(id 10)', Exp.num(10))
	testEval('((compose inc isEven) 1)', Exp.bool(true))
	testEval('((compose inc isEven) 2)', Exp.bool(false))
	testEval('((twice inc) 1)', Exp.num(3))
	testEval('((compose id id) 1)', Exp.num(1))
})
