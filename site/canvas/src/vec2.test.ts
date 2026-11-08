import { buildPrelude, type Env, evaluate, expandLadder, type LetAST, parse, print, solve } from '@glisp/lang'
import { describe, expect, it } from 'vitest'

import { withGraphics } from './graphics'
import { changed, gripAt, sceneOf } from './scene'

const env: Env = withGraphics(buildPrelude())
const valueOf = (source: string) => evaluate(parse(source), env).value

describe('vec2.midpoint', () => {
	it('is halfway between two points', () => {
		expect(valueOf('(vec2.midpoint [0 0] [10 20])')).toEqual([5, 10])
	})

	it('is lerp at a half, one rung down, with the points as they were written', () => {
		const [, next] = expandLadder(parse('(vec2.midpoint [0 0] (vec2.add [5 5] [5 15]))'), env)
		expect(print(next!)).toBe('(vec2.lerp [0 0] (vec2.add [5 5] [5 15]) 0.5)')
		expect(evaluate(next!, env).value).toEqual([5, 10])
	})

	it('moved, takes the second point along, or the first if the second cannot go', () => {
		const root = parse('{m = (vec2.midpoint [0 0] [10 20])}') as LetAST
		const node = root.bindings[0]![1]
		expect(print(solve(root, env, node, [10, 10]).ast!)).toBe('{m = (vec2.midpoint [0 0] [20 20])}')
		const held = parse('{m = (vec2.midpoint [0 0] @[10 20])}') as LetAST
		expect(print(solve(held, env, held.bindings[0]![1], [10, 10]).ast!)).toBe('{m = (vec2.midpoint [10 0] @[10 20])}')
	})

	it('is drawn as a point on the line between the two, which moves as one', () => {
		const root = parse('[m = (vec2.midpoint [0 0] [10 20])]') as LetAST
		const shape = sceneOf(root, env)[0]!
		expect(shape).toMatchObject({ draw: 'point', value: [5, 10] })
		const grip = gripAt(root, env, shape.row)!
		expect(grip.handles).toEqual([])
		expect(grip.guides).toHaveLength(1)
		const moved = changed(root, env, shape.row, grip.move!([1, 2])).ast!
		expect(print(moved)).toBe('[m = (vec2.midpoint [1 2] [11 22])]')
	})
})
