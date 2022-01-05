import {testEval} from '../util/TestUtil'
import * as Val from '../val'

describe('functions in the prelude module', () => {
	testEval('(+ 1 2)', '3')
	testEval('(* 1 2)', '2')
	testEval('(< 1 2)', 'true')
	testEval('(if true 1 false)', '1')
	testEval('(< 4 (if true 1 2))', 'false')
	testEval('(not true)', 'false')
	testEval('(isEven 2)', 'true')
	testEval('(/ 15 5)', '3')
	testEval('(mod 5 2)', '1')
	testEval('(** 6 3)', '216')
	testEval('(gcd 20 16)', '4')
	testEval('(- 10 9)', '1')

	testEval('(| () Num)', Val.unionType(Val.unit, Val.NumType))

	testEval('(inc 10)', '11')
	testEval('(dec 10)', '9')
	testEval('(sqrt 25)', '5')
	testEval('(hypot 3 4)', '5')
	testEval('(id 10)', '10')
	testEval('((compose inc isEven) 1)', 'true')
	testEval('((compose inc isEven) 2)', 'false')
	testEval('((twice inc) 1)', '3')
	testEval('((compose id id) 1)', '1')
})
