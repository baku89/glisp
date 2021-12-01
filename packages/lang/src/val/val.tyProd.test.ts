import {num, tyNum, tyProd} from '.'

const Vec2 = tyProd('Vec2', {x: tyNum, y: tyNum}, [num(0), num(0)])

test('default type of Vec2 to be (Vec2 0 0)', () => {
	const expected = Vec2.fn(num(0), num(0)).result
	if (!Vec2.defaultValue.isEqualTo(expected)) {
		throw new Error('Got=' + Vec2.defaultValue.print())
	}
})

test('(Vec2 10 10) equals to (Vec2 10 10)', () => {
	const a = Vec2.fn(num(10), num(10)).result
	const b = Vec2.fn(num(10), num(10)).result

	expect(a.isEqualTo(b)).toBe(true)
})

test('Vec2 is a subtype of itself', () => {
	expect(Vec2.isSubtypeOf(Vec2)).toBe(true)
})

test('(Vec2 10 10) is a subtype of Vec2', () => {
	const a = Vec2.fn(num(10), num(10)).result
	expect(a.isSubtypeOf(Vec2)).toBe(true)
})
