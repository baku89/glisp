import { buildPrelude, print } from '@glisp/lang'
import { describe, expect, it } from 'vitest'

import { withGraphics } from './graphics'
import { parse } from './program.testing'
import { boundsOfRows, changed, cornersOfBox, gripOfRows, sceneOf, withBoxHandles } from './scene'

const env = withGraphics(buildPrelude())
const ROWS = ['binding:a', 'binding:b']
const SOURCE = '[a = (path.ngon [0 0] 10 4 0) b = (path.circle [30 0] 5)]'

describe('a box around several things, turned', () => {
	const root = parse(SOURCE)
	const scene = sceneOf(root, env)
	const held = (turn = 0) => withBoxHandles(gripOfRows(root, env, ROWS), scene, ROWS, turn)!
	const turnersOf = (turn = 0) => held(turn).grip.handles.filter(({ outsideCorner }) => outsideCorner)

	it('is straight until it is turned', () => {
		expect(held().grip.box!.angle).toBeUndefined()
	})

	it('says how far round it is, and then goes by one scale', () => {
		const { box } = held(30).grip
		expect(box!.angle).toBe(30)
		expect(box!.even).toBe(true)
	})

	it('is straight again all the way round', () => {
		expect(held(360).grip.box!.angle).toBeUndefined()
	})

	it('has its corners along the way it is turned', () => {
		const around = boundsOfRows(scene, ROWS, 30)!
		const corners = turnersOf(30).map(({ at }) => at)
		for (const corner of cornersOfBox(around, 30)) {
			expect(corners.some(at => Math.hypot(at![0] - corner[0], at![1] - corner[1]) < 1e-9)).toBe(true)
		}
	})

	it('turns around its middle, wherever it has got to', () => {
		for (const turn of [0, 30]) {
			const [[l, t], [r, b]] = boundsOfRows(scene, ROWS, turn)!
			const radians = (turn * Math.PI) / 180
			const [x, y] = [(l + r) / 2, (t + b) / 2]
			const middle = [x * Math.cos(radians) - y * Math.sin(radians), x * Math.sin(radians) + y * Math.cos(radians)]
			const { pivot } = turnersOf(turn)[0]!
			expect(Math.hypot(pivot![0] - middle[0]!, pivot![1] - middle[1]!)).toBeLessThan(1e-9)
		}
	})

	it('says how far it has been turned, from where it was taken hold of', () => {
		const corner = turnersOf()[3]!
		expect(corner.turnOf!(corner.at!)).toBeCloseTo(0)
		const { pivot, at } = corner
		const [x, y] = [at![0] - pivot![0], at![1] - pivot![1]]
		expect(corner.turnOf!([pivot![0] - y, pivot![1] + x])).toBeCloseTo(90)
	})

	it('stays the same box as what is in it goes round', () => {
		const corner = turnersOf()[3]!
		const { pivot, at } = corner
		const [x, y] = [at![0] - pivot![0], at![1] - pivot![1]]
		const turned = corner.to([pivot![0] - y, pivot![1] + x], at!)
		const next = turned.reduce((program, change) => changed(program, env, change.row!, [change]).ast ?? program, root)
		expect(print(next)).not.toBe(print(root))
		const before = boundsOfRows(scene, ROWS, 0)!
		const after = boundsOfRows(sceneOf(next, env), ROWS, 90)!
		const size = ([[l, t], [r, b]]: typeof before) => [r - l, b - t]
		expect(size(after)[0]).toBeCloseTo(size(before)[0]!)
		expect(size(after)[1]).toBeCloseTo(size(before)[1]!)
	})
})
