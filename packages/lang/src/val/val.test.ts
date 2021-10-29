import * as Val from '.'

describe('subtype', () => {
	const square = new Val.Fn(
		(x: Val.Int) => new Val.Int(x.value ** 2),
		new Val.TyFn([Val.TyInt], Val.TyInt)
	)

	const addTwo = new Val.Fn(
		(a: Val.Int, b: Val.Int) => new Val.Int(a.value + b.value),
		new Val.TyFn([Val.TyInt, Val.TyInt], Val.TyInt)
	)

	run(new Val.Int(1), Val.TyInt, true)
	run(Val.TyInt, Val.TyInt, true)
	run(new Val.Int(1), new Val.Int(1), true)
	run(new Val.Bool(true), new Val.Bool(true), true)
	run(new Val.Bool(false), new Val.Bool(false), true)
	run(new Val.Int(1), new Val.Bool(false), false)
	run(new Val.Int(1), new Val.All(), true)
	run(new Val.Bottom(), Val.TyInt, true)

	run(square, square, true)
	run(square, new Val.All(), true)
	run(square, new Val.TyFn([Val.TyInt], Val.TyInt), true)
	run(square, new Val.TyFn([new Val.All()], Val.TyInt), false)
	run(square, new Val.TyFn([Val.TyInt], new Val.All()), true)
	run(square, new Val.TyFn([Val.TyInt, Val.TyInt], Val.TyInt), true)
	run(square, new Val.TyFn([], Val.TyInt), false)

	run(square, addTwo, false)
	run(addTwo, square, false)

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
