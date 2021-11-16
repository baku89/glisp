import {parse} from '../parser'
import {Writer} from '../utils/Writer'
import * as Val from '.'

describe('subtyping', () => {
	const square = Val.fn(
		(x: Val.Int) => Writer.of(Val.int(x.value ** 2)),
		{x: Val.tyInt},
		Val.tyInt
	)

	const addTwo = Val.fn(
		(x: Val.Int, y: Val.Int) => Writer.of(Val.int(x.value + y.value)),
		{x: Val.tyInt, y: Val.tyInt},
		Val.tyInt
	)

	const T = Val.tyVar('T')
	const U = Val.tyVar('U')

	run(Val.int(1), Val.int(1), true)
	run(Val.int(1), Val.tyInt, true)
	run(Val.int(1), Val.tyInt.extends(Val.int(1)), true)
	run(Val.tyInt, Val.tyInt, true)

	run(Val.str('hello'), Val.str('hello'), true)
	run(Val.str('hello'), Val.tyStr, true)
	run(Val.tyStr, Val.tyStr, true)
	run(Val.tyStr, Val.tyInt, false)
	run(Val.str('hello'), Val.tyInt, false)

	run(Val.bool(true), Val.bool(true), true)
	run(Val.bool(false), Val.tyBool, true)
	run(Val.tyBool, Val.tyBool, true)

	run(Val.int(1), Val.bool(false), false)
	run(Val.int(1), Val.all, true)
	run(Val.bottom, Val.tyInt, true)
	run(Val.uniteTy(Val.int(1), Val.int(2)), Val.tyInt, true)

	run(square, square, true)
	run(square, Val.all, true)
	run(square, Val.tyFn(Val.tyInt, Val.tyInt), true)
	run(square, Val.tyFn(Val.all, Val.tyInt), false)
	run(square, Val.tyFn(Val.tyInt, Val.all), true)
	run(square, Val.tyFn([Val.tyInt, Val.tyInt], Val.tyInt), true)
	run(square, Val.tyFn([], Val.tyInt), false)

	run(square, addTwo, false)
	run(addTwo, square, false)

	run(Val.tyInt, Val.TyUnion.fromTypesUnsafe([Val.tyInt, Val.tyBool]), true)
	run(Val.int(0), Val.TyUnion.fromTypesUnsafe([Val.int(0), Val.int(1)]), true)

	run(Val.tyValue(Val.tyInt), Val.tyInt, false)

	run(T, U, false)
	run(T, T, true)
	run('(-> <T> <T>)', '(-> <T> <T>)', true)
	run('(-> <U> <U>)', '(-> <T> <T>)', false)

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
	run('[1]', '[Int]', true)
	run('[1 Int]', '[(| 1 Bool) Int]', true)
	run('[Int Int]', '[1 2]', false)
	run('[1 2]', '[Int Int]', true)
	run('[...Int]', '[...Int]', true)
	run('[...Int]', '[...Bool]', false)
	run('[Int ...Int]', '[...Int]', true)
	run('[...Int]', '[Int ...Int]', false)
	run('[...Int]', '[]', true)
	run('[Int ...Int]', '[]', true)
	run('[Int Int]', '[...Int]', true)
	run('[true false]', '(-> Int Bool)', true)
	run('[1 2 3 4 5]', '(-> Int Int)', true)
	run('[...Int]', '(-> Int Int)', true)
	run('[...Bool]', '(-> Int Int)', false)

	function parseEval(input: Val.Value | string) {
		if (typeof input === 'string') return parse(input).eval().result
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
	run([Val.int(1)], Val.int(1))
	run(
		[Val.int(1), Val.int(2)],
		Val.TyUnion.fromTypesUnsafe([Val.int(1), Val.int(2)])
	)
	run([Val.int(1), Val.tyInt], Val.tyInt)
	run([Val.tyInt, Val.int(1)], Val.tyInt)
	run(
		[Val.tyInt, Val.tyBool],
		Val.TyUnion.fromTypesUnsafe([Val.tyInt, Val.tyBool])
	)
	run([Val.tyInt, Val.all], Val.all)
	run([], Val.bottom)
	run([Val.bottom, Val.bottom], Val.bottom)
	run([Val.bottom, Val.all], Val.all)
	run([Val.bool(true), Val.bool(false)], Val.tyBool)
	run(
		[
			Val.tyBool,
			Val.TyUnion.fromTypesUnsafe([Val.tyInt, Val.tyBool]),
			Val.tyInt,
		],
		Val.TyUnion.fromTypesUnsafe([Val.tyInt, Val.tyBool])
	)

	function run(types: Val.Value[], expected: Val.Value) {
		const testStr = types.map(t => t.print()).join(' ')
		const expectedStr = expected.print()
		const united = Val.uniteTy(...types)

		test(`(| ${testStr}) to be ${expectedStr}`, () => {
			if (!united.isEqualTo(expected)) {
				throw new Error('Got=' + united.print())
			}
		})
	}
})

describe('intesecting type', () => {
	run([], Val.all)
	run([Val.int(1)], Val.int(1))
	run([Val.int(1), Val.int(2)], Val.bottom)
	run([Val.tyInt, Val.int(1), Val.int(1)], Val.int(1))
	run(
		[Val.TyUnion.fromTypesUnsafe([Val.tyInt, Val.bool(false)]), Val.tyInt],
		Val.tyInt
	)
	run(
		[
			Val.TyUnion.fromTypesUnsafe([Val.tyInt, Val.bool(false)]),
			Val.TyUnion.fromTypesUnsafe([Val.int(1), Val.int(2), Val.tyBool]),
		],
		Val.TyUnion.fromTypesUnsafe([Val.int(1), Val.int(2), Val.bool(false)])
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
	run(Val.int(1), Val.int(1))
	run(Val.all, Val.all)
	run(Val.bottom, Val.bottom)
	run(Val.bool(true), Val.bool(true))
	run(Val.tyInt, Val.tyInt)
	run(Val.uniteTy(Val.int(1), Val.int(2)), Val.uniteTy(Val.int(2), Val.int(1)))
	run(
		Val.uniteTy(Val.int(1), Val.int(2), Val.bool(true)),
		Val.uniteTy(Val.bool(true), Val.int(2), Val.int(1))
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
