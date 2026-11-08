import { buildPrelude, type Env, evaluate, type LetAST, parse, print } from '@glisp/lang'
import { describe, expect, it } from 'vitest'

import { withGraphics } from './graphics'
import { boundsOfRows } from './rows'
import { gripAt, lineOfShape, rowsWithin, sceneOf } from './scene'

const env: Env = withGraphics(buildPrelude())
const valueOf = (source: string) => evaluate(parse(source), env).value

describe('ray', () => {
	it('is where it starts and the angle it goes at, as geome has it', () => {
		expect(valueOf('(ray.at [10 20] 90)')).toEqual({ origin: [10, 20], angle: 90 })
		expect(valueOf('(ray.at [10 20] -90)')).toEqual({ origin: [10, 20], angle: 270 })
		const through = valueOf('(ray.fromPoints [0 0] [0 10])') as { angle: number }
		expect(through.angle).toBeCloseTo(90)
		// Through where it starts, it goes along x
		expect(valueOf('(ray.fromPoints [5 5] [5 5])')).toEqual({ origin: [5, 5], angle: 0 })
	})

	it('can be written as a record', () => {
		expect(valueOf('^ray {origin: [1 2] angle: 45}')).toEqual({ origin: [1, 2], angle: 45 })
	})

	it('goes along a path, the way it goes there', () => {
		const ray = valueOf('(ray.along (path.line [0 0] [0 100]) 30)') as { origin: number[]; angle: number }
		expect(ray.origin[0]).toBeCloseTo(0)
		expect(ray.origin[1]).toBeCloseTo(30)
		expect(ray.angle).toBeCloseTo(90)
	})

	it('is a guide, drawn from where it starts one way only, and has no size', () => {
		const root = parse('[r = (ray.at [0 0] 0) c = (path.circle [500 500] 10)]') as LetAST
		const shape = sceneOf(root, env).find(({ row }) => row.endsWith('r'))!
		expect(shape.draw).toBe('ray')
		const [start, end] = lineOfShape(shape)!.curves[0]!.vertices.map(({ point }) => point)
		expect(start).toEqual([0, 0])
		expect(end![0]).toBeGreaterThan(1000)
		expect(end![1]).toBeCloseTo(0)
		// Only what it starts in or goes through has it
		expect(rowsWithin(sceneOf(root, env), [100, -10], [200, 10])).toContain(shape.row)
		expect(rowsWithin(sceneOf(root, env), [-200, -10], [-100, 10])).not.toContain(shape.row)
		const [[left]] = boundsOfRows(root, env)!
		expect(left).toBeCloseTo(490)
	})

	it('has handles where it starts and for which way it goes', () => {
		const root = parse('[r = (ray.at [0 0] 0)]') as LetAST
		const row = sceneOf(root, env)[0]!.row
		const grip = gripAt(root, env, row)!
		expect(grip.handles.map(({ kind }) => kind)).toEqual(['translate', 'direction'])
		expect(grip.handles[1]).toMatchObject({ rotates: true, pointing: true })
		expect(grip.handles[0]!.to([5, 7], [0, 0])).toEqual([{ route: [0], value: [5, 7] }])
		const turn = grip.handles[1]!.to([0, 80], [0, 0])
		expect(turn).toHaveLength(1)
		expect(print(parse('(ray.at [0 0] 0)'))).toBe('(ray.at [0 0] 0)')
	})
})
