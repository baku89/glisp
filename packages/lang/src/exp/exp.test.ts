import * as Exp from '../exp'
import * as Parser from '../parser'
import {GlobalScope} from '../std/global'
import * as Val from '../val'

describe('evaluating without errors', () => {
	run(Exp.int(0), Val.int(0))
	run(Exp.int(10), Val.int(10))
	run(Exp.obj(Val.bool(false)), Val.bool(false))
	run(Exp.obj(Val.bool(true)), Val.bool(true))
	run(Exp.obj(Val.bottom), Val.bottom)
	run('(+ 1 2)', Val.int(3))
	run('(< 1 2)', Val.bool(true))
	run(Exp.scope({a: Exp.int(10)}, Exp.sym('a')), Val.int(10))
	run('(if true 1 false)', Val.int(1))
	run('(< 4 (if true 1 2))', Val.bool(false))
	run('(not true)', Val.bool(false))
	run('(even? 2)', Val.bool(true))
	run('((. succ even?) 1)', Val.bool(true))
	run('((. succ even?) 2)', Val.bool(false))
	run('((twice succ) 1)', Val.int(3))

	run('[]', Val.vec())
	run('[1 true]', Val.vec(Val.int(1), Val.bool(true)))
	run('[(+ 1 2)]', Val.vec(Val.int(3)))
	run('[[[]]]', Val.vec(Val.vec(Val.vec())))
	run('(id [1])', Val.vec(Val.int(1)))

	function run(input: string | Exp.Node, expected: Val.Value) {
		const exp = parse(input)
		test(`${exp.print()} evaluates to ${expected.print()}`, () => {
			exp.parent = GlobalScope

			const {result, log} = exp.eval()
			if (!Val.isEqual(result, expected)) {
				throw new Error('Got=' + result.print() + '\n' + printLog(log))
			}
			if (log.length > 0) {
				throw new Error('Expected no log, but got=' + printLog(log))
			}
		})
	}
})

describe('inferring a type', () => {
	testInfer(Exp.int(0), Val.int(0))
	testInfer(Exp.obj(Val.bool(false)), Val.bool(false))
	testInfer(Exp.sym('Int'), Val.tyValue(Val.tyInt))
	testInfer(Exp.obj(Val.tyValue(Val.tyInt)), Val.tyValue(Val.tyInt))
	testInfer(Exp.sym('_'), Val.bottom)
	testInfer('(not true)', Val.tyBool)
})

describe('inferring vectors', () => {
	const i1 = Val.int(1)
	const i2 = Val.int(2)
	const i3 = Val.int(3)

	testInfer('[]', Val.vec())
	testInfer('[1 2 3]', Val.vec(i1, i2, i3))
	testInfer('[Int]', Val.vec(Val.tyValue(Val.tyInt)))
	testInfer('[(succ 0)]', Val.vec(Val.tyInt))
	testInfer('[(. succ even?)]', Val.vec(Val.tyFn(Val.tyInt, Val.tyBool)))
	testInfer('[...1]', Val.tyValue(Val.vecV(i1)))
	testInfer('[...Int]', Val.tyValue(Val.vecV(Val.tyValue(Val.tyInt))))
	testInfer('[...Bool]', Val.tyValue(Val.vecV(Val.tyValue(Val.tyBool))))
	testInfer(
		'[Int Bool]',
		Val.vec(Val.tyValue(Val.tyInt), Val.tyValue(Val.tyBool))
	)
	testInfer(
		'[Int ...Bool]',
		Val.tyValue(Val.vecV(Val.tyValue(Val.tyInt), Val.tyValue(Val.tyBool)))
	)
})

describe('inferring a type of polymorphic function application', () => {
	testInfer('(id 1)', Val.int(1))
	testInfer('(if true 1 2)', Val.uniteTy(Val.int(1), Val.int(2)))
	testInfer('(id (+ 1 2))', Val.tyInt)
	testInfer('(+ (id 1) (id 2))', Val.tyInt)
	testInfer('(if (id true) (id 2) (* 1 2))', Val.tyInt)
	testInfer('(id (id 1))', Val.int(1))
	testInfer('(. succ even?)', Val.tyFn(Val.tyInt, Val.tyBool))
	testInfer('((. succ even?) 1)', Val.tyBool)
	testInfer('(twice succ)', Val.tyFn(Val.tyInt, Val.tyInt))
	testInfer('(twice not)', Val.tyFn(Val.tyBool, Val.tyBool))
	testInfer('(twice (twice not))', Val.tyFn(Val.tyBool, Val.tyBool))
	testInfer(
		'(if ((twice not) true) ((twice succ) 1) ((twice succ) 2))',
		Val.tyInt
	)
})

describe('inferring invalid expression', () => {
	testInfer('(. succ)', Val.tyFn(Val.tyInt, Val.bottom))
	testInfer('(. _ succ)', Val.tyFn(Val.bottom, Val.tyInt))
	testInfer('(. _ succ)', Val.tyFn(Val.bottom, Val.tyInt))
	testInfer('(. not succ)', Val.tyFn(Val.tyBool, Val.tyInt))
	testInfer('(. succ not)', Val.tyFn(Val.tyInt, Val.tyBool))
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

		const inferred = exp.infer()
		const equal = inferred.isEqualTo(expected)
		if (!equal) throw new Error('Got=' + inferred.print())
	})
}

function printLog(log: Exp.Log[]) {
	return log.map(l => `[${l.level}] ${l.reason}\n`).join('')
}
