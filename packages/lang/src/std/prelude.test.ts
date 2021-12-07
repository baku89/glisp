import {testEval} from '../utils/testUtils'
import * as Val from '../val'

describe('functions in the prelude module', () => {
	testEval('(+ 1 2)', Val.num(3))
	testEval('(* 1 2)', Val.num(2))
	testEval('(< 1 2)', Val.bool(true))
	testEval('(let a = 10 a)', Val.num(10))
	testEval('(if true 1 false)', Val.num(1))
	testEval('(< 4 (if true 1 2))', Val.bool(false))
	testEval('(not true)', Val.bool(false))
	testEval('(isEven 2)', Val.bool(true))
	testEval('(/ 15 5)', Val.num(3))
	testEval('(% 5 2)', Val.num(1))
	testEval('(** 6 3)', Val.num(216))
	testEval('(gcd 20 16)', Val.num(4))
	testEval('(- 10 9)', Val.num(1))

	testEval('(| () Num)', Val.uniteTy(Val.unit, Val.tyNum))

	testEval('(inc 10)', Val.num(11))
	testEval('(dec 10)', Val.num(9))
	testEval('(sum [1 2 3 4])', Val.num(10))
	testEval('(sqrt 25)', Val.num(5))
	testEval('(hypot 3 4)', Val.num(5))
	testEval('(id 10)', Val.num(10))
	testEval('((compose inc isEven) 1)', Val.bool(true))
	testEval('((compose inc isEven) 2)', Val.bool(false))
	testEval('((twice inc) 1)', Val.num(3))
	testEval('((compose id id) 1)', Val.num(1))
})
