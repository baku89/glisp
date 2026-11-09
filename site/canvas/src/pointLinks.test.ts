import { buildPrelude, type Env, print } from '@glisp/lang'
import { describe, expect, it } from 'vitest'

import { withGraphics } from './graphics'
import { parse } from './program.testing'
import { gripAt, pulledOnto, sceneOf, snapPointsOf, valueOfRow } from './scene'

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
