import * as Exp from '../exp'
import * as Parser from '../parser'
import {GlobalScope} from '../std/global'
import * as Val from '../val'

const T = Val.tyVar('T')
const U = Val.tyVar('U')

describe('evaluating literals', () => {
	testEval(Exp.num(0), Val.num(0))
	testEval(Exp.num(10), Val.num(10))
	testEval(Exp.obj(Val.bool(false)), Val.bool(false))
	testEval(Exp.obj(Val.bool(true)), Val.bool(true))
	testEval(Exp.obj(Val.unit), Val.unit)
	testEval(Exp.obj(Val.bottom), Val.bottom)
	testEval('(-> Num Num)', Val.tyFn(Val.tyNum, Val.tyNum))
})

describe('evaluating a simple expression', () => {
	testEval('(+ 1 2)', Val.num(3))
	testEval('(* 1 2)', Val.num(2))
	testEval('(< 1 2)', Val.bool(true))
	testEval('{a = 10 a}', Val.num(10))
	testEval('(if true 1 false)', Val.num(1))
	testEval('(< 4 (if true 1 2))', Val.bool(false))
	testEval('(not true)', Val.bool(false))
	testEval('(isEven 2)', Val.bool(true))
	testEval('(| () Num)', Val.uniteTy(Val.unit, Val.tyNum))
})

describe('evaluating anonymous function application', () => {
	testEval('((=> x:Num (* x x)) 12)', Val.num(144))
})

describe('evaluating higher-order function application', () => {
	testEval('((compose inc isEven) 1)', Val.bool(true))
	testEval('((compose inc isEven) 2)', Val.bool(false))
	testEval('((twice inc) 1)', Val.num(3))
	testEval('((compose id id) 1)', Val.num(1))
})

describe('evaluating vectors', () => {
	testEval('[]', Val.vec())
	testEval('[1 true]', Val.vec(Val.num(1), Val.bool(true)))
	testEval('[(+ 1 2)]', Val.vec(Val.num(3)))
	testEval('[[[]]]', Val.vec(Val.vec(Val.vec())))
	testEval('([0 1 2 3 4 5] 2)', Val.num(2))
	testEval('([0 1 2 3 4 5] 10)', Val.unit, true)
	testEval('([true false] 0)', Val.bool(true))
	testEval('(id [1])', Val.vec(Val.num(1)))
})

describe('evaluating function application with unit arguments', () => {
	testEval('(+ 7 ())', Val.num(7))
	testEval('(* 2 ())', Val.num(2))

	testEval('(and true ())', Val.bool(true))
	testEval('(or () false)', Val.bool(false))
})

describe('inferring a type', () => {
	testInfer(Exp.num(0), Val.num(0))
	testInfer(Exp.obj(Val.bool(false)), Val.bool(false))
	testInfer(Exp.sym('Num'), Val.tyValue(Val.tyNum))
	testInfer(Exp.obj(Val.tyValue(Val.tyNum)), Val.tyValue(Val.tyNum))
	testInfer(Exp.obj(Val.unit), Val.unit)
	testInfer('(not true)', Val.tyBool)
})

describe('inferring vectors', () => {
	const i1 = Val.num(1)
	const i2 = Val.num(2)
	const i3 = Val.num(3)

	testInfer('[]', Val.vec())
	testInfer('[1 2 3]', Val.vec(i1, i2, i3))
	testInfer('[Num]', Val.vec(Val.tyValue(Val.tyNum)))
	testInfer('[(inc 0)]', Val.vec(Val.tyNum))
	testInfer('[(compose inc isEven)]', Val.vec(Val.tyFn(Val.tyNum, Val.tyBool)))
	testInfer('[...1]', Val.tyValue(Val.vecFrom([], i1)))
	testInfer('[...Num]', Val.tyValue(Val.vecFrom([], Val.tyValue(Val.tyNum))))
	testInfer('[...Bool]', Val.tyValue(Val.vecFrom([], Val.tyValue(Val.tyBool))))
	testInfer(
		'[Num Bool]',
		Val.vec(Val.tyValue(Val.tyNum), Val.tyValue(Val.tyBool))
	)
	testInfer(
		'[Num ...Bool]',
		Val.tyValue(Val.vecFrom([Val.tyValue(Val.tyNum)], Val.tyValue(Val.tyBool)))
	)
})

describe('inferring a type of function', () => {
	testInfer('(=> x:Num x)', Val.tyFn(Val.tyNum, Val.tyNum))
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
	testInfer('(id 1)', Val.num(1))
	testInfer('(if true 1 2)', Val.uniteTy(Val.num(1), Val.num(2)))
	testInfer('(id (+ 1 2))', Val.tyNum)
	testInfer('(+ (id 1) (id 2))', Val.tyNum)
	testInfer('(if (id true) (id 2) (* 1 2))', Val.tyNum)
	testInfer('(id (id 1))', Val.num(1))
	testInfer('(compose inc isEven)', Val.tyFn(Val.tyNum, Val.tyBool))
	testInfer('((compose inc isEven) 1)', Val.tyBool)
	testInfer('(twice inc)', Val.tyFn(Val.tyNum, Val.tyNum))
	testInfer('(twice not)', Val.tyFn(Val.tyBool, Val.tyBool))
	testInfer('(twice (twice inc))', Val.tyFn(Val.tyNum, Val.tyNum))
	testInfer('(twice (twice not))', Val.tyFn(Val.tyBool, Val.tyBool))
	testInfer(
		'(if ((twice not) true) ((twice inc) 1) ((twice inc) 2))',
		Val.tyNum
	)
	testInfer('(twice id)', Val.tyFn(T, T))
	testInfer('(compose id id)', Val.tyFn(T, T))
	testInfer('(compose id inc)', Val.tyFn(Val.tyNum, Val.tyNum))
	testInfer('(compose inc id)', Val.tyFn(Val.tyNum, Val.tyNum))
	testInfer('(compose twice id)', Val.tyFn(Val.tyFn(T, T), Val.tyFn(T, T)))
	testInfer('(compose id twice)', Val.tyFn(Val.tyFn(T, T), Val.tyFn(T, T)))
})

describe('inferring invalid expression', () => {
	testInfer('(compose inc)', Val.tyFn(Val.tyNum, Val.bottom))
	testInfer('(compose () inc)', Val.tyFn(Val.all, Val.tyNum))
	testInfer('(compose not inc)', Val.tyFn(Val.tyBool, Val.tyNum))
	testInfer('(compose inc not)', Val.tyFn(Val.tyNum, Val.tyBool))
})

function parse(input: string | Exp.Node): Exp.Node {
	let exp: Exp.Node
	if (typeof input === 'string') {
		exp = Parser.parse(input)
	} else {
		exp = input
	}
	exp.parent = GlobalScope
	return exp
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
