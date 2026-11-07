import { buildPrelude, type Env, type LetAST, parse, print } from '@glisp/lang'
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
