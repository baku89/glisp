import { buildPrelude, type Env, evaluate, type LetAST, parse, print, solve } from '@glisp/lang'
import { describe, expect, it } from 'vitest'

import { isPath, withGraphics } from './graphics'
import { handlesAt, sceneOf } from './scene'

const env: Env = withGraphics(buildPrelude())
const scene = (src: string) =>
	sceneOf(parse(src), env).map(({ row, draw }) => `${row} ${draw}`)

describe('path', () => {
	it('makes paths that a type can tell', () => {
		expect(isPath(evaluate(parse('(path.circle [0 0] 10)'), env).value)).toBe(true)
		expect(evaluate(parse('(: 1 path)'), env).value).toEqual({ curves: [] })
	})

	it('is a type that functions come with', () => {
		const { value } = evaluate(
			parse('{f = (=> (p: path): path p) (f (path.circle [0 0] 1))}'),
			env
		)
		expect(isPath(value)).toBe(true)
	})
})

describe('sceneOf', () => {
	it('has what comes to something to draw, and no more', () => {
		expect(scene('{r = 10 c = (path.circle [0 0] r) s = [1 2]}')).toEqual(['binding:c path'])
	})

	it('goes by the type, as not every vec2 is a point', () => {
		expect(scene('{a = (: [1 2] point) b = (: [1 2] vec2)}')).toEqual(['binding:a point'])
	})

	it('goes through a name, and into a vector', () => {
		expect(scene('{c = (path.circle [0 0] 1) d = c}')).toEqual(['binding:c path', 'binding:d path'])
		expect(scene('{v = [(path.circle [0 0] 1) (path.circle [1 1] 1)]}')).toEqual([
			'binding:v path',
			'binding:v path',
		])
	})

	it('goes into a group, and not past a Return', () => {
		expect(scene('{g = {c = (path.circle [0 0] 1)}}')).toEqual(['binding:g/binding:c path'])
		expect(scene('{g = {c = (path.circle [0 0] 1) d = (path.circle [1 1] 1) d}}')).toEqual([
			'binding:g path',
		])
	})

	it('leaves out what is bypassed, which can still be referred to', () => {
		expect(scene('{c = #_(path.circle [0 0] 1) d = c}')).toEqual(['binding:d path'])
	})
})

describe('handles', () => {
	const source = '{r = 10 c = (path.circle [100 100] r)}'
	const handles = (src: string) => handlesAt(parse(src), env, 'binding:c')

	it('are where the arguments say', () => {
		expect(handles(source).map(h => h.at)).toEqual([
			[100, 100],
			[110, 100],
		])
		expect(handles('{c = 1}')).toEqual([])
	})

	it('move what the arguments come from, working backward', () => {
		const root = parse(source) as LetAST
		const [center, radius] = handlesAt(root, env, 'binding:c')
		const moved = solve(root, env, center!.node, center!.wanted([5, 6])).ast!
		expect(print(moved)).toBe('{r = 10 c = (path.circle [5 6] r)}')
		const pulled = solve(root, env, radius!.node, radius!.wanted([130, 100])).ast!
		expect(print(pulled)).toBe('{r = 30 c = (path.circle [100 100] r)}')
	})

	it('stop at a pin', () => {
		const root = parse('{r = @10 c = (path.circle [100 100] r)}') as LetAST
		const [, radius] = handlesAt(root, env, 'binding:c')
		expect(solve(root, env, radius!.node, 30).ast).toBeNull()
	})
})
