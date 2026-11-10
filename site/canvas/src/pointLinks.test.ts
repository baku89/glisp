import { buildPrelude, type Env, type LetAST, print } from '@glisp/lang'
import { describe, expect, it } from 'vitest'

import { type Vec, withGraphics } from './graphics'
import { parse } from './program.testing'
import { alignmentsNear, changed, cornersInOrder, drawnFrom, drawnOnto, gripAt, nearestSnap, pulledOnto, sceneOf, snappableIn, snapPointsOf, valueOfRow } from './scene'
import { withSlotCommand } from '@glisp/tweeq/rowsClipboard'

const env: Env = withGraphics(buildPrelude())

/** Two lines between the corners of a polygon, crossing, and a point written out as a point. */
const SOURCE = `{main = [
  point1 = ^point [575 -776.4]
  line2 = (style (path.line ../../polygon1/path:/points:/3 ../../polygon1/path:/points:/1) stroke: "#000000")
  line1 = (style (path.line ../../polygon1/path:/points:/0 ../../polygon1/path:/points:/2) stroke: "#000000")
  polygon1 = (style (path.polygon [441.3 -959.3] [416.4 -588.6] [696.4 -610.4] [746.7 -979.8]) fill: "#ffffff" stroke: "#000000")
]}`
const ROW = 'binding:point1'

const lineOf = (ast: ReturnType<typeof parse>) => print(ast).split('\n').find(line => line.includes('point1 ='))!

describe('a point written out, let go on what it snapped to', () => {
	const root = parse(SOURCE)
	const snaps = snapPointsOf(root, env, sceneOf(root, env))
	const handle = gripAt(root, env, ROW)!.handles.find(({ place }) => place === 'self')!

	it('goes by where two lines cross, staying a point, with each end of each line as a whole', () => {
		const crossing = snaps.find(({ label }) => label === 'intersection')!
		const next = pulledOnto(root, root, env, ROW, handle, crossing)!
		expect(next).not.toBeNull()
		expect(lineOf(next)).toContain('^point (line.intersection (line.fromPoints')
		expect(lineOf(next)).toContain('line1/path:/start:')
		const [x, y] = valueOfRow(next, env, ROW) as number[]
		expect(Math.hypot(x! - crossing.at[0], y! - crossing.at[1])).toBeLessThan(1e-6)
	})

	it('goes by a corner of something else, staying a point', () => {
		const corner = snaps.find(({ target }) => target !== null && target.includes('polygon1'))!
		const next = pulledOnto(root, root, env, ROW, handle, corner)!
		expect(lineOf(next)).toMatch(/\^point \S*polygon1/)
	})

	it('stays where it is, moved, when the polygon moves, as it refers to the crossing', () => {
		const crossing = snaps.find(({ label }) => label === 'intersection')!
		const linked = pulledOnto(root, root, env, ROW, handle, crossing)!
		const moved = parse(print(linked).replace('[441.3 -959.3]', '[341.3 -959.3]'))
		const [x] = valueOfRow(moved, env, ROW) as number[]
		expect(x).not.toBeCloseTo(crossing.at[0], 3)
	})
})

describe('a point cast as one, that refers to something by a path', () => {
	const SOURCE = `{main = [
  point1 = ^point (vec2.lerp ../../line1/path:/start: ../../line1/path:/end: 0.5)
  line1 = (style (path.line [523 -895] [747 -1292]) stroke: "#32db86" width: 11)
]}`

	it('goes a step on to where it is, the path going up from inside the cast', () => {
		const next = withSlotCommand(parse(SOURCE), env, [ROW], 'step')!
		expect(lineOf(next)).toContain('point1 = ^point [635 -1093.5]')
	})

	it('and all the way, as well', () => {
		const next = withSlotCommand(parse(SOURCE), env, [ROW], 'all')!
		expect(lineOf(next)).toContain('point1 = ^point [635 -1093.5]')
	})
})

describe('an edge lined up with a point that is worked out', () => {
	it('refers to it when let go of where it already was, with its own corner a reference too', () => {
		const root = parse('{main = [rect1 = (style (path.rect ../../reflect1/point: [99.4 89.1]) fill: "#ffffff") reflect1 = (vec2.reflect [-49.7 23.1] (line.vertical ../../axes1/origin:)) axes1 = (axes @[0 0])]}')
		const right = gripAt(root, env, 'binding:rect1')!.handles.find(h => h.name === 'right')!
		const points = snapPointsOf(root, env, snappableIn(root, env), new Set(['binding:rect1']))
		const snap = nearestSnap([...points, ...alignmentsNear(points, right.at!, 3)], right.at!, 3)!
		const next = pulledOnto(root, root, env, 'binding:rect1', right, snap)!
		expect(print(next)).toContain('(path.rect ../../reflect1/point: [(- (first reflect1) (first ../../../origin:)) 89.1])')
		// Symmetric across the axis: the input moved, the right edge is still its image.
		const moved = parse(print(next).replace('[-49.7 23.1]', '[-80 23.1]'))
		expect(gripAt(moved, env, 'binding:rect1')!.handles.find(h => h.name === 'right')!.at![0]).toBeCloseTo(80)
	})

	it('refers to its number as its first, as there is nothing written to go in to', () => {
		for (const q of ['^point [700 100]', '(vec2.reflect ../r/origin: (line.vertical [400 0]))']) {
			const root = parse(`{main = [r = (path.rect [100 100] [200 100]) q = ${q}]}`)
			const right = gripAt(root, env, 'binding:r')!.handles.find(h => h.name === 'right')!
			const points = snapPointsOf(root, env, snappableIn(root, env), new Set(['binding:r']))
			const snap = nearestSnap([...points, ...alignmentsNear(points, [701, 150], 3)], [701, 150], 3)!
			const dragged = changed(root, env, 'binding:r', right.to([700, 150], right.at!)).ast!
			const next = pulledOnto(dragged, root, env, 'binding:r', right, snap)!
			expect(print(next), q).toContain('r = (path.rect [100 100] [(- (first q) ../../origin:/0) 100])')
			// And it goes on being there, as the point moves: a line across from the rect's corner, further off.
			const moved = parse(print(next).replace('[400 0]', '[500 0]').replace('[700 100]', '[900 100]'))
			expect(gripAt(moved, env, 'binding:r')!.handles.find(h => h.name === 'right')!.at![0]).toBeCloseTo(900)
		}
	})
})

describe('a box drawn between a point and its image, either way', () => {
	it('goes from what is up and left, and as far as the other, whichever it starts on', () => {
		const root = parse('{main = [reflect1 = (vec2.reflect [-50 20] (line.vertical ../../axes1/origin:)) axes1 = (axes @[0 0])]}') as LetAST
		const points = snapPointsOf(root, env, snappableIn(root, env))
		const near = (at: Vec) => nearestSnap([...points, ...alignmentsNear(points, at, 3)], at, 3)!
		for (const [from, to] of [[[50, 20], [-50, 120]], [[50, 120], [-50, 20]], [[-50, 20], [50, 120]]] as [Vec, Vec][]) {
			const [start, end] = [near(from), near(to)]
			const { from: begin, to: until } = cornersInOrder({ at: start.at, snap: start }, { at: end.at, snap: end })
			const started = drawnFrom(root, env, 'rect1', 'rect', begin.snap!, until.at, false, 1)
			const ended = drawnOnto(started, env, 'binding:rect1', until.snap!, 1.5)!
			expect(print(ended), JSON.stringify([from, to])).toMatch(/rect1 = \(path\.rect \S.* \[\(- \(first reflect1\) .*\) 100\]\)/)
			// Its right goes on being the image of its left, as that moves.
			const moved = parse(print(ended).replace('[-50 20]', '[-80 20]'))
			expect(gripAt(moved, env, 'binding:rect1')!.handles.find(h => h.name === 'right')!.at![0], JSON.stringify([from, to])).toBeCloseTo(80)
		}
	})
})
