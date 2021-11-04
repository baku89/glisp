import * as Exp from '../exp'
import * as Parser from '../parser'
import {GlobalScope} from '../std/global'
import * as Val from '../val'

describe('evaluating without errors', () => {
	run(Exp.int(0), Val.int(0))
	run(Exp.int(10), Val.int(10))
	run(Exp.bool(false), Val.bool(false))
	run(Exp.bool(true), Val.bool(true))
	run(Exp.sym('_'), Val.bottom)
	run(Exp.call(Exp.sym('+'), Exp.int(1), Exp.int(2)), Val.int(3))
	run(Exp.call(Exp.sym('<'), Exp.int(1), Exp.int(2)), Val.bool(true))
	run(Exp.scope({a: Exp.int(10)}, Exp.sym('a')), Val.int(10))
	run(
		Exp.call(Exp.sym('if'), Exp.bool(true), Exp.int(1), Exp.bool(false)),
		Val.int(1)
	)
	run(
		Exp.call(
			Exp.sym('<'),
			Exp.int(4),
			Exp.call(Exp.sym('if'), Exp.bool(true), Exp.int(1), Exp.int(2))
		),
		Val.bool(false)
	)

	function run(input: Exp.Node, expected: Val.Value) {
		test(`${input.print()} evaluates to ${expected.print()}`, () => {
			input.parent = GlobalScope

			const {result, log} = input.eval()
			if (!Val.isEqual(result, expected)) {
				throw new Error('Got=' + result.print())
			}
			if (log.length > 0) {
				throw new Error('Expected no log, but got=' + printLog(log))
			}
		})
	}
})

describe('inferring a type', () => {
	testInfer(Exp.int(0), Val.int(0))
	testInfer(Exp.bool(false), Val.bool(false))
	testInfer(Exp.sym('Int'), Val.singleton(Val.tyInt))
	testInfer(Exp.obj(Val.singleton(Val.tyInt)), Val.singleton(Val.tyInt))
	testInfer(Exp.sym('_'), Val.bottom)
	testInfer('(not true)', Val.tyBool)
})

describe('inferring a type of polymorphic function application', () => {
	testInfer('(identity 1)', Val.int(1))
	testInfer('(if true 1 2)', Val.uniteTy(Val.int(1), Val.int(2)))
	testInfer('(identity (+ 1 2))', Val.tyInt)
	testInfer('(+ (identity 1) (identity 2))', Val.tyInt)
	testInfer('(if (identity true) (identity 2) (* 1 2))', Val.tyInt)
	testInfer('(identity (identity 1))', Val.int(1))
	testInfer('(. succ even?)', Val.tyFn([Val.tyInt], Val.tyBool))
	testInfer('((. succ even?) 1)', Val.tyBool)
})

describe('inferring invalid expression', () => {
	testInfer('(. succ)', Val.tyFn([Val.tyInt], Val.bottom))
	testInfer('(. _ succ)', Val.tyFn([Val.bottom], Val.tyInt))
	testInfer('(. _ succ)', Val.tyFn([Val.bottom], Val.tyInt))
	testInfer('(. not succ)', Val.tyFn([Val.tyBool], Val.tyInt))
	testInfer('(. succ not)', Val.tyFn([Val.tyInt], Val.tyBool))
})

function parse(input: string | Exp.Node): Exp.Node {
	if (typeof input === 'string') {
		return Parser.parse(input)
	} else {
		return input
	}
}

function testInfer(input: string | Exp.Node, expected: Val.Value) {
	const exp = parse(input)

	test(`${exp.print()} is inferred to be ${expected.print()}`, () => {
		exp.parent = GlobalScope

		const inferred = exp.infer().result
		const equal = inferred.isEqualTo(expected)
		if (!equal) throw new Error('Got=' + inferred.print())
	})
}

function printLog(log: Exp.Log[]) {
	return log.map(l => `[${l.level}] ${l.reason}\n`).join('')
}
