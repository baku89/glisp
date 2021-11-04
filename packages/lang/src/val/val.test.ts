import * as Val from '.'

describe('subtyping', () => {
	const square = Val.fn(
		(x: Val.Int) => Val.int(x.value ** 2),
		{x: Val.tyInt},
		Val.tyInt
	)

	const addTwo = Val.fn(
		(x: Val.Int, y: Val.Int) => Val.int(x.value + y.value),
		{x: Val.tyInt, y: Val.tyInt},
		Val.tyInt
	)

	const T = Val.tyVar()

	run(Val.int(1), Val.tyInt, true)
	run(Val.tyInt, Val.tyInt, true)
	run(Val.int(1), Val.int(1), true)
	run(Val.bool(true), Val.bool(true), true)
	run(Val.bool(false), Val.bool(false), true)
	run(Val.int(1), Val.bool(false), false)
	run(Val.int(1), Val.all, true)
	run(Val.bottom, Val.tyInt, true)
	run(Val.uniteTy(Val.int(1), Val.int(2)), Val.tyInt, true)

	run(square, square, true)
	run(square, Val.all, true)
	run(square, Val.tyFn([Val.tyInt], Val.tyInt), true)
	run(square, Val.tyFn([Val.all], Val.tyInt), false)
	run(square, Val.tyFn([Val.tyInt], Val.all), true)
	run(square, Val.tyFn([Val.tyInt, Val.tyInt], Val.tyInt), true)
	run(square, Val.tyFn([], Val.tyInt), false)

	run(square, addTwo, false)
	run(addTwo, square, false)

	run(Val.tyInt, Val.TyUnion.fromTypesUnsafe([Val.tyInt, Val.tyBool]), true)
	run(Val.int(0), Val.TyUnion.fromTypesUnsafe([Val.int(0), Val.int(1)]), true)

	run(Val.singleton(Val.tyInt), Val.tyInt, false)

	run(Val.int(1), T, true)
	run(Val.bool(false), T, true)
	run(Val.all, T, true)
	run(Val.bottom, T, true)
	run(square, Val.tyFn([T], T), true)

	function run(sub: Val.Value, sup: Val.Value, expected: boolean) {
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
				fail('Got=' + united.print())
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
