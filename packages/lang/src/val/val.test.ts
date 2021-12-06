import {parse} from '../parser'
import {PreludeScope} from '../std/prelude'
import {Writer} from '../utils/Writer'
import * as Val from '.'

describe('subtyping', () => {
	const square = Val.fn(
		(x: Val.Num) => Writer.of(Val.num(x.value ** 2)),
		{x: Val.tyNum},
		Val.tyNum
	)

	const addTwo = Val.fn(
		(x: Val.Num, y: Val.Num) => Writer.of(Val.num(x.value + y.value)),
		{x: Val.tyNum, y: Val.tyNum},
		Val.tyNum
	)

	const T = Val.tyVar('T')
	const U = Val.tyVar('U')

	run(Val.num(1), Val.num(1), true)
	run(Val.num(1), Val.tyNum, true)
	run(Val.num(1), Val.tyNum.extends(Val.num(1)), true)
	run(Val.tyNum, Val.tyNum, true)

	run(Val.str('hello'), Val.str('hello'), true)
	run(Val.str('hello'), Val.tyStr, true)
	run(Val.tyStr, Val.tyStr, true)
	run(Val.tyStr, Val.tyNum, false)
	run(Val.str('hello'), Val.tyNum, false)

	run(Val.bool(true), Val.bool(true), true)
	run(Val.bool(false), Val.tyBool, true)
	run(Val.tyBool, Val.tyBool, true)

	run(Val.num(1), Val.bool(false), false)
	run(Val.num(1), Val.all, true)
	run(Val.bottom, Val.tyNum, true)
	run(Val.uniteTy(Val.num(1), Val.num(2)), Val.tyNum, true)

	run(Val.unit, Val.tyNum, false)
	run(Val.unit, Val.tyNum, false)
	run(Val.tyNum, Val.unit, false)
	run(Val.bottom, Val.unit, true)

	run(square, square, true)
	run(square, Val.all, true)
	run(square, Val.tyFn(Val.tyNum, Val.tyNum), true)
	run(square, Val.tyFn(Val.all, Val.tyNum), false)
	run(square, Val.tyFn(Val.tyNum, Val.all), true)
	run(square, Val.tyFn([Val.tyNum, Val.tyNum], Val.tyNum), true)
	run(square, Val.tyFn([], Val.tyNum), false)

	run(square, addTwo, false)
	run(addTwo, square, false)

	run(Val.tyNum, Val.TyUnion.fromTypesUnsafe([Val.tyNum, Val.tyBool]), true)
	run(Val.num(0), Val.TyUnion.fromTypesUnsafe([Val.num(0), Val.num(1)]), true)
	run(Val.unit, Val.TyUnion.fromTypesUnsafe([Val.unit, Val.num(1)]), true)

	run(Val.tyValue(Val.tyNum), Val.tyNum, false)

	run(T, U, false)
	run(T, T, true)
	run('(-> [<T>] <T>)', '(-> [<T>] <T>)', true)
	run('(-> [<U>] <U>)', '(-> [<T>] <T>)', false)

	run(
		Val.TyUnion.fromTypesUnsafe([Val.bool(true), Val.bool(false)]),
		Val.tyBool,
		true
	)

	// Vectors
	run('[1]', '[1]', true)
	run('[1]', '[1 2]', false)
	run('[1 2]', '[1]', true)
	run('[1]', '[true]', false)
	run('[1]', '[Num]', true)
	run('[1 Num]', '[(| 1 Bool) Num]', true)
	run('[Num Num]', '[1 2]', false)
	run('[1 2]', '[Num Num]', true)
	run('[...Num]', '[...Num]', true)
	run('[...Num]', '[...Bool]', false)
	run('[Num ...Num]', '[...Num]', true)
	run('[...Num]', '[Num ...Num]', false)
	run('[...Num]', '[]', true)
	run('[Num ...Num]', '[]', true)
	run('[Num Num]', '[...Num]', true)
	run('[true false]', '(-> [Num] (| () Bool))', true)
	run('[1 2 3 4 5]', '(-> [Num] (| () Num))', true)
	run('[...Num]', '(-> [Num] (| () Num))', true)
	run('[...Bool]', '(-> [Num] (| () Num))', false)

	// Dict
	run('{}', '{}', true)
	run('{a:0}', '{a:Num}', true)
	run('{a:Num}', '{a:Num}', true)
	run('{a:Num}', '{a:Bool}', false)
	run('{a:0}', '{a:Bool}', false)
	run('{a:Num b:Num}', '{a:Num}', true)
	run('{a:0}', '{a:Num b:Num}', false)
	run('{a:Num}', '{a:Num b:Num}', false)
	run('{a:_|_}', '{a:Num}', true)

	function parseEval(input: Val.Value | string) {
		if (typeof input === 'string') {
			const exp = parse(input, PreludeScope)
			return exp.eval().result
		}
		return input
	}

	function run(
		_sub: Val.Value | string,
		_sup: Val.Value | string,
		expected: boolean
	) {
		const sub = parseEval(_sub)
		const sup = parseEval(_sup)

		const op = expected ? '<:' : '!<:'
		test(`${print(sub)} ${op} ${print(sup)}`, () => {
			expect(sub.isSubtypeOf(sup)).toBe(expected)
		})
	}

	function print(v: Val.Value) {
		if (v === square) return 'square'
		if (v === addTwo) return 'addTwo'
		return v.print()
	}
})

describe('uniting types', () => {
	const unite = Val.TyUnion.fromTypesUnsafe

	run([Val.num(1)], Val.num(1))
	run([Val.num(1), Val.num(2)], [Val.num(1), Val.num(2)])
	run([Val.num(1), Val.tyNum], Val.tyNum)
	run([Val.tyNum, Val.num(1)], Val.tyNum)
	run([Val.tyNum, Val.tyBool], [Val.tyNum, Val.tyBool])
	run([Val.tyNum, Val.all], Val.all)
	run([], Val.bottom)
	run([Val.bottom, Val.bottom], Val.bottom)
	run([Val.bottom, Val.all], Val.all)
	run([Val.bool(true), Val.bool(false)], Val.tyBool)
	run(
		[Val.tyBool, unite([Val.tyNum, Val.tyBool]), Val.tyNum],
		[Val.tyNum, Val.tyBool]
	)
	run([Val.tyNum, Val.unit], [Val.tyNum, Val.unit])

	function run(types: Val.Value[], expected: Val.Value | Val.Value[]) {
		const testStr = types.map(t => t.print()).join(' ')

		const expectedTy = Array.isArray(expected) ? unite(expected) : expected

		const expectedStr = expectedTy.print()
		const united = Val.uniteTy(...types)

		test(`(| ${testStr}) to be ${expectedStr}`, () => {
			if (!united.isEqualTo(expectedTy)) {
				throw new Error('Got=' + united.print())
			}
		})
	}
})

describe('intesecting type', () => {
	run([], Val.all)
	run([Val.num(1)], Val.num(1))
	run([Val.num(1), Val.num(2)], Val.bottom)
	run([Val.tyNum, Val.num(1), Val.num(1)], Val.num(1))
	run(
		[Val.TyUnion.fromTypesUnsafe([Val.tyNum, Val.bool(false)]), Val.tyNum],
		Val.tyNum
	)
	run(
		[
			Val.TyUnion.fromTypesUnsafe([Val.tyNum, Val.bool(false)]),
			Val.TyUnion.fromTypesUnsafe([Val.num(1), Val.num(2), Val.tyBool]),
		],
		Val.TyUnion.fromTypesUnsafe([Val.num(1), Val.num(2), Val.bool(false)])
	)

	function run(types: Val.Value[], expected: Val.Value) {
		const testStr = types.map(t => t.print()).join(' ')
		const expectedStr = expected.print()
		const result = Val.intersectTy(...types)

		test(`(& ${testStr}) to be ${expectedStr}`, () => {
			if (!result.isEqualTo(expected)) {
				throw new Error('Got=' + result.print())
			}
		})
	}
})

describe('value equality', () => {
	run(Val.num(1), Val.num(1))
	run(Val.all, Val.all)
	run(Val.bottom, Val.bottom)
	run(Val.bool(true), Val.bool(true))
	run(Val.tyNum, Val.tyNum)
	run(Val.uniteTy(Val.num(1), Val.num(2)), Val.uniteTy(Val.num(2), Val.num(1)))
	run(
		Val.uniteTy(Val.num(1), Val.num(2), Val.bool(true)),
		Val.uniteTy(Val.bool(true), Val.num(2), Val.num(1))
	)

	function run(a: Val.Value, b: Val.Value) {
		const aStr = a.print()
		const bStr = b.print()

		test(`${aStr} equals to ${bStr}`, () => {
			if (!a.isEqualTo(b)) {
				fail(`${aStr} != ${bStr}`)
			}
			if (!b.isEqualTo(a)) {
				fail(`${bStr} != ${aStr}`)
			}
		})
	}
})
