import * as Val from '.'

describe('subtype', () => {
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

	run(Val.int(1), Val.tyInt, true)
	run(Val.tyInt, Val.tyInt, true)
	run(Val.int(1), Val.int(1), true)
	run(Val.bool(true), Val.bool(true), true)
	run(Val.bool(false), Val.bool(false), true)
	run(Val.int(1), Val.bool(false), false)
	run(Val.int(1), Val.all, true)
	run(Val.bottom, Val.tyInt, true)

	run(square, square, true)
	run(square, Val.all, true)
	run(square, Val.tyFn([Val.tyInt], Val.tyInt), true)
	run(square, Val.tyFn([Val.all], Val.tyInt), false)
	run(square, Val.tyFn([Val.tyInt], Val.all), true)
	run(square, Val.tyFn([Val.tyInt, Val.tyInt], Val.tyInt), true)
	run(square, Val.tyFn([], Val.tyInt), false)

	run(square, addTwo, false)
	run(addTwo, square, false)

	run(Val.tyInt, new Val.TyUnion([Val.tyInt, Val.tyBool]), true)
	run(Val.int(0), new Val.TyUnion([Val.int(0), Val.int(1)]), true)

	run(Val.singleton(Val.tyInt), Val.tyInt, false)

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

describe('normalizing union type', () => {
	run([Val.int(1)], Val.int(1))
	run([Val.int(1), Val.int(2)], new Val.TyUnion([Val.int(1), Val.int(2)]))
	run([Val.int(1), Val.tyInt], Val.tyInt)
	run([Val.tyInt, Val.int(1)], Val.tyInt)
	run([Val.tyInt, Val.tyBool], new Val.TyUnion([Val.tyInt, Val.tyBool]))
	run([Val.tyInt, Val.all], Val.all)
	run([], Val.bottom)
	run([Val.bottom, Val.bottom], Val.bottom)
	run([Val.bottom, Val.all], Val.all)
	run(
		[Val.tyBool, new Val.TyUnion([Val.tyInt, Val.tyBool]), Val.tyInt],
		new Val.TyUnion([Val.tyInt, Val.tyBool])
	)

	function run(types: Val.Value[], expected: Val.Value) {
		const testStr = types.map(t => t.print()).join(' ')
		const expectedStr = expected.print()
		test(`(| ${testStr}) to be ${expectedStr}`, () => {
			const united = Val.uniteTy(...types)

			if (!united.isEqualTo(expected)) {
				throw new Error(`Expected ${expectedStr}, got ${united.print()}`)
			}
		})
	}
})

describe('value equality', () => {
	run(Val.int(1), Val.int(1))
	run(new Val.All(), Val.all)
	run(new Val.Bottom(), Val.bottom)
	run(Val.bool(true), Val.bool(true))
	run(Val.tyInt, Val.tyInt)
	run(Val.uniteTy(Val.int(1), Val.int(2)), Val.uniteTy(Val.int(2), Val.int(1)))

	function run(a: Val.Value, b: Val.Value) {
		const aStr = a.print()
		const bStr = b.print()

		test(`${aStr} equals to ${bStr}`, () => {
			if (!a.isEqualTo(b)) {
				throw new Error(`${aStr} != ${bStr}`)
			}
			if (!b.isEqualTo(a)) {
				throw new Error(`${bStr} != ${aStr}`)
			}
		})
	}
})
