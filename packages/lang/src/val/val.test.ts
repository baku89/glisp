import * as Val from '.'

describe('subtype', () => {
	const square = Val.fn(
		(x: Val.Int) => Val.int(x.value ** 2),
		Val.tyFn([Val.tyInt], Val.tyInt)
	)

	const addTwo = Val.fn(
		(a: Val.Int, b: Val.Int) => Val.int(a.value + b.value),
		Val.tyFn([Val.tyInt, Val.tyInt], Val.tyInt)
	)

	run(Val.int(1), Val.tyInt, true)
	run(Val.tyInt, Val.tyInt, true)
	run(Val.int(1), Val.int(1), true)
	run(Val.bool(true), Val.bool(true), true)
	run(Val.bool(false), Val.bool(false), true)
	run(Val.int(1), Val.bool(false), false)
	run(Val.int(1), Val.All.i, true)
	run(Val.bottom, Val.tyInt, true)

	run(square, square, true)
	run(square, Val.All.i, true)
	run(square, Val.tyFn([Val.tyInt], Val.tyInt), true)
	run(square, Val.tyFn([Val.All.i], Val.tyInt), false)
	run(square, Val.tyFn([Val.tyInt], Val.All.i), true)
	run(square, Val.tyFn([Val.tyInt, Val.tyInt], Val.tyInt), true)
	run(square, Val.tyFn([], Val.tyInt), false)

	run(square, addTwo, false)
	run(addTwo, square, false)

	run(Val.tyInt, new Val.TyUnion([Val.tyInt, Val.tyBool]), true)
	run(Val.int(0), new Val.TyUnion([Val.int(0), Val.int(1)]), true)

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
	run([Val.int(1)], '1')
	run([Val.int(1), Val.int(2)], '(| 1 2)')
	run([Val.int(1), Val.tyInt], 'Int')
	run([Val.tyInt, Val.int(1)], 'Int')
	run([Val.tyInt, Val.tyBool], '(| Int Bool)')
	run([Val.tyInt, Val.all], 'All')
	run([], '_')
	run([Val.bottom, Val.bottom], '_')
	run([Val.bottom, Val.all], 'All')
	run(
		[Val.tyBool, new Val.TyUnion([Val.tyInt, Val.tyBool]), Val.tyInt],
		'(| Bool Int)'
	)

	function run(types: Val.Value[], expected: string) {
		test(`(| ${types.map(t => t.print()).join(' ')}) to be ${expected}`, () => {
			expect(Val.uniteTy(...types).print()).toBe(expected)
		})
	}
})
