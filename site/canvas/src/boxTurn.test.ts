import { buildPrelude, print } from '@glisp/lang'
import { describe, expect, it } from 'vitest'

import { type Handle, type Vec, withGraphics } from './graphics'
import { parse } from './program.testing'
import { boundsOfRows, changed, cornersOfBox, gripOfRows, sceneOf, withBoxHandles } from './scene'

const env = withGraphics(buildPrelude())
const ROWS = ['binding:a', 'binding:b']
const SOURCE = '[a = (path.ngon [0 0] 10 4 0) b = (path.circle [30 0] 5)]'

describe('a box around a group', () => {
	const GROUP = ['binding:g']
	const held = (source: string, rows = GROUP) => {
		const root = parse(source)
		return { root, gripped: withBoxHandles(gripOfRows(root, env, rows), sceneOf(root, env), rows)! }
	}
	const boundsAfter = (source: string, pick: (handle: Handle) => boolean, to: Vec) => {
		const { root, gripped } = held(source)
		const at = gripped.grip.handles.findIndex(pick)
		const handle = gripped.grip.handles[at]!
		const next = changed(root, env, gripped.rowOf[at]!, handle.to(to, handle.at!)).ast!
		return boundsOfRows(sceneOf(next, env), GROUP)
	}
	const RECTS = '{g = {a = (path.rect [0 0] [10 10]) b = (path.rect [20 20] [10 10])}}'
	const isBottomRight = ({ at, corner }: Handle) => corner === true && at![0] === 30 && at![1] === 30

	it('is the box several things have, with none of their own handles', () => {
		const { gripped } = held(RECTS)
		const { box, handles } = gripped.grip
		expect(box!.across).toBe(true)
		expect(handles.every(({ name, outsideCorner }) => name === 'box' || outsideCorner)).toBe(true)
		expect(new Set(gripped.rowOf)).toEqual(new Set(GROUP))
	})

	it('turns if all in it can be, and not if they cannot, as several do', () => {
		const turners = (source: string) => held(source).gripped.grip.handles.filter(({ rotates }) => rotates)
		expect(turners(RECTS)).toHaveLength(0)
		expect(turners('{g = {a = (path.ngon [0 0] 10 4 0) b = (path.circle [30 0] 5)}}')).toHaveLength(4)
	})

	it('scales all that is in it, each way apart', () => {
		expect(boundsAfter(RECTS, isBottomRight, [60, 90])).toEqual([[0, 0], [60, 90]])
		expect(held(RECTS).gripped.grip.box!.even).toBe(false)
	})

	it('goes by one scale, if something in it can only go by one', () => {
		const { box, handles } = held('{g = {a = (path.rect [0 0] [10 10]) b = (path.circle [30 30] 5)}}').gripped.grip
		expect(box!.even).toBe(true)
		expect(handles.some(({ name, corner }) => name === 'box' && !corner)).toBe(false)
	})

	it('reaches what is in a group in it', () => {
		const nested = '{g = {a = (path.rect [0 0] [10 10]) h = {b = (path.rect [20 20] [10 10])}}}'
		expect(boundsAfter(nested, isBottomRight, [60, 60])).toEqual([[0, 0], [60, 60]])
	})

	it('goes as several do, with something else selected too', () => {
		const rows = ['binding:g', 'binding:c']
		const source = '{g = {a = (path.rect [0 0] [10 10])} c = (path.rect [20 20] [10 10])}'
		const { root, gripped } = held(source, rows)
		const at = gripped.grip.handles.findIndex(isBottomRight)
		const handle = gripped.grip.handles[at]!
		const next = changed(root, env, gripped.rowOf[at]!, handle.to([60, 60], handle.at!)).ast!
		expect(boundsOfRows(sceneOf(next, env), rows)).toEqual([[0, 0], [60, 60]])
	})

	it('holds one thing as it would several', () => {
		const one = '{g = {a = (path.rect [0 0] [10 10])}}'
		expect(boundsAfter(one, ({ at, corner }) => corner === true && at![0] === 10 && at![1] === 10, [20, 40])).toEqual([[0, 0], [20, 40]])
	})

	it('is not there, if something in it has nothing to say to one', () => {
		const { gripped } = held('{g = {a = (path.rect [0 0] [10 10]) b = (path.replicate (path.rect [0 0] [10 10]) [1 0 0 1 50 0] 0 2)}}')
		expect(gripped.grip.box).toBeUndefined()
		expect(gripped.grip.handles).toHaveLength(0)
	})
})

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
