import {int, tyInt, tyProd} from '.'

const Vec2 = tyProd('Vec2', {x: tyInt, y: tyInt}, [int(0), int(0)])

test('default type of Vec2 to be (Vec2 0 0)', () => {
	const expected = Vec2.fn(int(0), int(0)).result
	if (!Vec2.defaultValue.isEqualTo(expected)) {
		throw new Error('Got=' + Vec2.defaultValue.print())
	}
})
