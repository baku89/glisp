import * as Exp from '../exp'
import * as Val from '../val'

describe('evaluator', () => {
	run(new Exp.Int(0), Val.int(0))
	run(new Exp.Int(10), Val.int(10))
	run(new Exp.Bool(false), Val.bool(false))
	run(new Exp.Bool(true), Val.bool(true))
	run(new Exp.Var('_'), Val.bottom)
	run(
		new Exp.Call(new Exp.Var('+'), [new Exp.Int(1), new Exp.Int(2)]),
		Val.int(3)
	)
	run(
		new Exp.Call(new Exp.Var('<'), [new Exp.Int(1), new Exp.Int(2)]),
		Val.bool(true)
	)
	run(new Exp.Scope({a: new Exp.Int(10)}, new Exp.Var('a')), Val.int(10))

	function run(input: Exp.Node, expected: Val.Value) {
		test(`${input.print()} evaluates to ${expected.print()}`, () => {
			expect(isEqualPrimitive(input.eval().result, expected)).toBe(true)
		})
	}
})

describe('infer type', () => {
	run(new Exp.Int(0), Val.int(0))
	run(new Exp.Bool(false), Val.bool(false))
	run(new Exp.Var('Int'), Val.singleton(Val.tyInt))
	run(new Exp.Obj(Val.singleton(Val.tyInt)), Val.singleton(Val.tyInt))
	run(new Exp.Var('_'), Val.bottom)

	function run(input: Exp.Node, expected: Val.Value) {
		test(`${input.print()} is inferred to be ${expected.print()}`, () => {
			input.infer().result.isEqualTo(expected)
		})
	}
})

function isEqualPrimitive(a: Val.Value, b: Val.Value) {
	switch (a.type) {
		case 'all':
		case 'bottom':
			return a.type === b.type
		case 'bool':
		case 'int':
			return a.type === b.type && a.value === b.value
		case 'tyAtom':
			return a === b
		default:
			throw new Error('Not yet implemented')
	}
}
