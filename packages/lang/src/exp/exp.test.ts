import * as Exp from '../exp'
import * as Val from '../val'

describe('evaluator', () => {
	run(new Exp.Int(0), new Val.Int(0))
	run(new Exp.Int(10), new Val.Int(10))
	run(new Exp.Bool(false), new Val.Bool(false))
	run(new Exp.Bool(true), new Val.Bool(true))
	run(
		new Exp.Call(new Exp.Var('+'), [new Exp.Int(1), new Exp.Int(2)]),
		new Val.Int(3)
	)
	run(
		new Exp.Call(new Exp.Var('<'), [new Exp.Int(1), new Exp.Int(2)]),
		new Val.Bool(true)
	)

	function run(input: Exp.Node, expected: Val.Value) {
		test(`${input.print()} evaluates to ${expected.print()}`, () => {
			expect(isEqualPrimitive(input.eval(), expected)).toBe(true)
		})
	}
})

function isEqualPrimitive(a: Val.Value, b: Val.Value) {
	if (a.type === 'bottom') {
		return a.type === b.type
	}

	return a.type === b.type && a.value === b.value
}
