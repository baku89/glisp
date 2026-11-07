import { buildPrelude, type Env, type LetAST, parse, print } from '@glisp/lang'
import { viewOf } from '@glisp/tweeq/structure'
import { describe, expect, it } from 'vitest'

import { withGraphics } from './graphics'
import { changed, gripAt, sceneOf } from './scene'

const env: Env = withGraphics(buildPrelude())

describe('a point made by calling its type', () => {
	it('is a point, and goes back to what it is made of when moved', () => {
		const root = parse('[p = (point 5 0)]') as LetAST
		expect(sceneOf(root, env)).toMatchObject([{ draw: 'point', value: [5, 0] }])
		const grip = gripAt(root, env, 'binding:p')!
		const moved = changed(root, env, 'binding:p', grip.handles[0]!.to([8, 3], [5, 0]))
		expect(print(moved.ast!)).toContain('(point 8 3)')
	})
})

describe('a rect called as its type', () => {
	it('is where it is and how big, and has the handles of one', () => {
		const root = parse('[r = (rect [0 0] [10 10])]') as LetAST
		expect(sceneOf(root, env)).toMatchObject([{ draw: 'frame' }])
		expect(viewOf(parse('(rect [0 0] [10 10])'), env).slots.map(s => s.label)).toEqual(['origin', 'size'])
		const grip = gripAt(root, env, 'binding:r')!
		expect(grip.handles.length).toBeGreaterThan(0)
		const moved = changed(root, env, 'binding:r', grip.move!([5, 5]))
		expect(print(moved.ast!)).toContain('(rect [5 5] [10 10])')
	})
})
