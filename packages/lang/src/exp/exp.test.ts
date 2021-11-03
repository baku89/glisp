import * as Exp from '../exp'
import {GlobalScope} from '../std/global'
import * as Val from '../val'

describe('evaluator', () => {
	run(Exp.int(0), Val.int(0))
	run(Exp.int(10), Val.int(10))
	run(Exp.bool(false), Val.bool(false))
	run(Exp.bool(true), Val.bool(true))
	run(Exp.sym('_'), Val.bottom)
	run(Exp.call(Exp.sym('+'), [Exp.int(1), Exp.int(2)]), Val.int(3))
	run(Exp.call(Exp.sym('<'), [Exp.int(1), Exp.int(2)]), Val.bool(true))
	run(Exp.scope({a: Exp.int(10)}, Exp.sym('a')), Val.int(10))

	function run(input: Exp.Node, expected: Val.Value) {
		test(`${input.print()} evaluates to ${expected.print()}`, () => {
			input.parent = GlobalScope

			const evaluated = input.eval().result
			if (!Val.isEqual(evaluated, expected)) {
				const msg = `Expected=${expected.print()}, got=${evaluated.print()}`
				throw new Error(msg)
			}
		})
	}
})

describe('infer type', () => {
	run(Exp.int(0), Val.int(0))
	run(Exp.bool(false), Val.bool(false))
	run(Exp.sym('Int'), Val.singleton(Val.tyInt))
	run(Exp.obj(Val.singleton(Val.tyInt)), Val.singleton(Val.tyInt))
	run(Exp.sym('_'), Val.bottom)

	function run(input: Exp.Node, expected: Val.Value) {
		test(`${input.print()} is inferred to be ${expected.print()}`, () => {
			input.infer().result.isEqualTo(expected)
		})
	}
})
