import { buildPrelude, evaluate, parse as parsed } from '@glisp/lang'
import { callOf, functionsIn } from '@glisp/tweeq/filters'
import { viewOf } from '@glisp/tweeq/structure'
import { describe, expect, it } from 'vitest'

import { withGraphics } from './graphics'
import { parse } from './program.testing'
import { drawsAt, isOfCanvasAt, paintAt, sceneOf } from './scene'

const env = withGraphics(buildPrelude())

/** What is asked of each row of a program would otherwise grow with the square of its rows. */
describe('what is asked of many rows', () => {
	const root = parse(`[
		a = (style (path.circle [0 0] 10) fill="#ff0000")
		b = (path.rect [0 0] [10 10])
		g = (grid "dots")
		h = #_(path.circle [5 5] 10)
	]`)

	it('sees a block once, for as long as it is that block', () => {
		expect(viewOf(root, env)).toBe(viewOf(root, env))
		expect(viewOf(parse('[a = 1]'), env)).not.toBe(viewOf(parse('[a = 1]'), env))
	})

	it('works out what is drawn once', () => {
		expect(sceneOf(root, env)[0]).toBe(sceneOf(root, env)[0])
	})

	it('tells each row what it is, as it does when asked of them all', () => {
		expect(paintAt(root, env, 'binding:a')?.fill).toBe('#ff0000')
		expect(paintAt(root, env, 'binding:g')).toBeNull()
		expect(isOfCanvasAt(root, env, 'binding:g')).toBe(true)
		expect(isOfCanvasAt(root, env, 'binding:a')).toBe(false)
		expect(drawsAt(root, env, 'binding:h')).toBe(true)
		expect(drawsAt(root, env, 'binding:nothing')).toBe(false)
	})
})

describe('what starts as what it would, with nothing given', () => {
	const started = (name: string) => {
		const filter = functionsIn(env).find(other => other.name === name)!
		return callOf(filter, [], env)
	}

	it('calls division, and does not refer to the program', () => {
		expect(started('/').head.kind).toBe('sym')
		expect(evaluate(started('/'), env).diagnostics).toEqual([])
	})

	it('adds up nothing, which is there to add up', () => {
		for (const name of ['sum', 'product']) expect(evaluate(started(name), env).diagnostics).toEqual([])
	})
})

describe('a path with nothing on it', () => {
	it('is an area of nothing, with numbers in it', () => {
		const { value } = evaluate(parsed('(path.bounds (path.d ""))'), env)
		expect(value).toMatchObject({ origin: [0, 0], size: [0, 0] })
	})
})
