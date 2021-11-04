import * as Exp from '../exp'
import {GlobalScope} from '../std/global'
import * as Val from '../val'

describe('evaluates without errors', () => {
	run(Exp.int(0), Val.int(0))
	run(Exp.int(10), Val.int(10))
	run(Exp.bool(false), Val.bool(false))
	run(Exp.bool(true), Val.bool(true))
	run(Exp.sym('_'), Val.bottom)
	run(Exp.call(Exp.sym('+'), Exp.int(1), Exp.int(2)), Val.int(3))
	run(Exp.call(Exp.sym('<'), Exp.int(1), Exp.int(2)), Val.bool(true))
	run(Exp.scope({a: Exp.int(10)}, Exp.sym('a')), Val.int(10))

	function run(input: Exp.Node, expected: Val.Value) {
		test(`${input.print()} evaluates to ${expected.print()}`, () => {
			input.parent = GlobalScope

			const {result, log} = input.eval()
			if (!Val.isEqual(result, expected)) {
				fail('Got=' + result.print())
			}
			if (log.length > 0) {
				fail('Expected no log, but got=' + printLog(log))
			}
		})
	}
})

describe('infer type', () => {
	testInfer(Exp.int(0), Val.int(0))
	testInfer(Exp.bool(false), Val.bool(false))
	testInfer(Exp.sym('Int'), Val.singleton(Val.tyInt))
	testInfer(Exp.obj(Val.singleton(Val.tyInt)), Val.singleton(Val.tyInt))
	testInfer(Exp.sym('_'), Val.bottom)
})

describe('infer polymorphic function application', () => {
	testInfer(Exp.call(Exp.sym('identity'), Exp.int(1)), Val.int(1))
	testInfer(
		Exp.call(Exp.sym('if'), Exp.bool(true), Exp.int(1), Exp.int(2)),
		Val.uniteTy(Val.int(1), Val.int(2))
	)
	testInfer(
		Exp.call(
			Exp.sym('identity'),
			Exp.call(Exp.sym('+'), Exp.int(1), Exp.int(2))
		),
		Val.tyInt
	)
})

function testInfer(input: Exp.Node, expected: Val.Value) {
	test(`${input.print()} is inferred to be ${expected.print()}`, () => {
		input.parent = GlobalScope

		const inferred = input.infer().result
		const equal = inferred.isEqualTo(expected)
		if (!equal) throw new Error('Got=' + inferred.print())
	})
}

function printLog(log: Exp.Log[]) {
	return log.map(l => `[${l.level}] ${l.reason}\n`).join('')
}
