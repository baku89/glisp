import * as Exp from '../exp'
import * as Parser from '../parser'
import {GlobalScope} from '../std/global'
import * as Val from '../val'

const T = Val.tyVar('T')
const U = Val.tyVar('U')

describe('evaluating literals', () => {
	testEval(Exp.int(0), Val.int(0))
	testEval(Exp.int(10), Val.int(10))
	testEval(Exp.obj(Val.bool(false)), Val.bool(false))
	testEval(Exp.obj(Val.bool(true)), Val.bool(true))
	testEval(Exp.obj(Val.bottom), Val.bottom)
	testEval('(-> Int Int)', Val.tyFn(Val.tyInt, Val.tyInt))
	testEval(
		Exp.tyFn(Exp.obj(Val.tyInt), Exp.obj(Val.tyInt)),
		Val.tyFn(Val.tyInt, Val.tyInt)
	)
})

describe('evaluating a simple expression', () => {
	testEval('(+ 1 2)', Val.int(3))
	testEval('(* 1 2)', Val.int(2))
	testEval('(< 1 2)', Val.bool(true))
	testEval('{a = 10 a}', Val.int(10))
	testEval('(if true 1 false)', Val.int(1))
	testEval('(< 4 (if true 1 2))', Val.bool(false))
	testEval('(not true)', Val.bool(false))
	testEval('(even? 2)', Val.bool(true))
})

describe('evaluating anonymous function application', () => {
	testEval('((=> x:Int (* x x)) 12)', Val.int(144))
})

describe('evaluating higher-order function application', () => {
	testEval('((. inc even?) 1)', Val.bool(true))
	testEval('((. inc even?) 2)', Val.bool(false))
	testEval('((twice inc) 1)', Val.int(3))
	testEval('((. id id) 1)', Val.int(1))
})

describe('evaluating vectors', () => {
	testEval('[]', Val.vec())
	testEval('[1 true]', Val.vec(Val.int(1), Val.bool(true)))
	testEval('[(+ 1 2)]', Val.vec(Val.int(3)))
	testEval('[[[]]]', Val.vec(Val.vec(Val.vec())))
	testEval('([0 1 2 3 4 5] 2)', Val.int(2))
	testEval('([0 1 2 3 4 5] 10)', Val.bottom, true)
	testEval('([true false] 0)', Val.bool(true))
	testEval('((. [1 2 3 0] [1 2 3 0]) 1)', Val.int(3))
	testEval('(id [1])', Val.vec(Val.int(1)))
})

describe('evaluating function application with bottom arguments', () => {
	testEval('(+ 7 ())', Val.int(7))
	testEval('(* 2 ())', Val.int(2))

	testEval('(and true ())', Val.bool(true))
	testEval('(or () false)', Val.bool(false))
})

describe('inferring a type', () => {
	testInfer(Exp.int(0), Val.int(0))
	testInfer(Exp.obj(Val.bool(false)), Val.bool(false))
	testInfer(Exp.sym('Int'), Val.tyValue(Val.tyInt))
	testInfer(Exp.obj(Val.tyValue(Val.tyInt)), Val.tyValue(Val.tyInt))
	testInfer(Exp.sym('()'), Val.bottom)
	testInfer('(not true)', Val.tyBool)
})

describe('inferring vectors', () => {
	const i1 = Val.int(1)
	const i2 = Val.int(2)
	const i3 = Val.int(3)

	testInfer('[]', Val.vec())
	testInfer('[1 2 3]', Val.vec(i1, i2, i3))
	testInfer('[Int]', Val.vec(Val.tyValue(Val.tyInt)))
	testInfer('[(inc 0)]', Val.vec(Val.tyInt))
	testInfer('[(. inc even?)]', Val.vec(Val.tyFn(Val.tyInt, Val.tyBool)))
	testInfer('[...1]', Val.tyValue(Val.vecFrom([], i1)))
	testInfer('[...Int]', Val.tyValue(Val.vecFrom([], Val.tyValue(Val.tyInt))))
	testInfer('[...Bool]', Val.tyValue(Val.vecFrom([], Val.tyValue(Val.tyBool))))
	testInfer(
		'[Int Bool]',
		Val.vec(Val.tyValue(Val.tyInt), Val.tyValue(Val.tyBool))
	)
	testInfer(
		'[Int ...Bool]',
		Val.tyValue(Val.vecFrom([Val.tyValue(Val.tyInt)], Val.tyValue(Val.tyBool)))
	)
})

describe('inferring a type of function', () => {
	testInfer('(=> x:Int x)', Val.tyFn(Val.tyInt, Val.tyInt))
	testInfer('(=> x:<T> x)', Val.tyFn(T, T))
	testInfer(
		'(=> (x:<T> y:<U>) (if true x y))',
		Val.tyFn([T, U], Val.uniteTy(T, U))
	)
	testInfer(
		'(=> (f:(-> <T> <U>) x:<T>) (f x))',
		Val.tyFn([Val.tyFn(T, U), T], U)
	)
})

describe('inferring a type of polymorphic function application', () => {
	testInfer('(id 1)', Val.int(1))
	testInfer('(if true 1 2)', Val.uniteTy(Val.int(1), Val.int(2)))
	testInfer('(id (+ 1 2))', Val.tyInt)
	testInfer('(+ (id 1) (id 2))', Val.tyInt)
	testInfer('(if (id true) (id 2) (* 1 2))', Val.tyInt)
	testInfer('(id (id 1))', Val.int(1))
	testInfer('(. inc even?)', Val.tyFn(Val.tyInt, Val.tyBool))
	testInfer('((. inc even?) 1)', Val.tyBool)
	testInfer('(twice inc)', Val.tyFn(Val.tyInt, Val.tyInt))
	testInfer('(twice not)', Val.tyFn(Val.tyBool, Val.tyBool))
	testInfer('(twice (twice inc))', Val.tyFn(Val.tyInt, Val.tyInt))
	testInfer('(twice (twice not))', Val.tyFn(Val.tyBool, Val.tyBool))
	testInfer(
		'(if ((twice not) true) ((twice inc) 1) ((twice inc) 2))',
		Val.tyInt
	)
	testInfer('(twice id)', Val.tyFn(T, T))
	testInfer('(. id id)', Val.tyFn(T, T))
	testInfer('(. id inc)', Val.tyFn(Val.tyInt, Val.tyInt))
	testInfer('(. inc id)', Val.tyFn(Val.tyInt, Val.tyInt))
	testInfer('(. twice id)', Val.tyFn(Val.tyFn(T, T), Val.tyFn(T, T)))
	testInfer('(. id twice)', Val.tyFn(Val.tyFn(T, T), Val.tyFn(T, T)))
})

describe('inferring invalid expression', () => {
	testInfer('(. inc)', Val.tyFn(Val.tyInt, Val.bottom))
	testInfer('(. () inc)', Val.tyFn(Val.all, Val.tyInt))
	testInfer('(. not inc)', Val.tyFn(Val.tyBool, Val.tyInt))
	testInfer('(. inc not)', Val.tyFn(Val.tyInt, Val.tyBool))
})

function parse(input: string | Exp.Node): Exp.Node {
	if (typeof input === 'string') {
		return Parser.parse(input)
	} else {
		input.parent = GlobalScope
		return input
	}
}

function testEval(
	input: string | Exp.Node,
	expected: Val.Value,
	hasLog = false
) {
	const exp = parse(input)
	test(`${exp.print()} evaluates to ${expected.print()}`, () => {
		const {result, log} = exp.eval()
		if (!Val.isEqual(result, expected)) {
			throw new Error('Got=' + result.print() + '\n' + printLog(log))
		}
		if (!hasLog && log.length > 0) {
			throw new Error('Expected no log, but got=' + printLog(log))
		}
	})
}

function testInfer(input: string | Exp.Node, expected: Val.Value) {
	const exp = parse(input)

	test(`${exp.print()} is inferred to be ${expected.print()}`, () => {
		const inferred = exp.infer()
		const equal = inferred.isEqualTo(expected)
		if (!equal) throw new Error('Got=' + inferred.print())
	})
}

function printLog(log: Exp.Log[]) {
	return log.map(l => `[${l.level}] ${l.reason}\n`).join('')
}
