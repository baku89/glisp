import { buildPrelude, type Env, parse } from '@glisp/lang'
import { describe, expect, it } from 'vitest'

import { inkOn, withGraphics } from './graphics'
import { backgroundOf, isBackgroundAt, rowsWithin, sceneOf } from './scene'
import { svgOfRows } from './svg'

const env: Env = withGraphics(buildPrelude())
const of = (source: string) => backgroundOf(parse(source), env)

describe('a background', () => {
	it('is a color the program says, by what it is and not by its name', () => {
		expect(of('{anything = (background "#ff0000")}')).toBe('#ff0000')
	})

	it('is nothing, unless something says so', () => {
		expect(of('{c = (path.circle [0 0] 10)}')).toBeNull()
		expect(of('{bg = (background "none")}')).toBeNull()
		expect(of('{bg = (background)}')).toBeNull()
		expect(of('{bg = #_(background "#ff0000")}')).toBeNull()
	})

	it('goes by the last, and can be in a group', () => {
		expect(of('{a = (background "#ff0000") b = (background "#00ff00")}')).toBe('#00ff00')
		expect(of('{g = {bg = (background "#ff0000")}}')).toBe('#ff0000')
	})

	it('can be worked out, and refer to what is around it', () => {
		expect(of('{c = "#0000ff" bg = (background c)}')).toBe('#0000ff')
	})

	it('is not a shape: not drawn as one, not selected by a range, not in an SVG', () => {
		const root = parse('{bg = (background "#ff0000") c = (path.circle [0 0] 10)}')
		const scene = sceneOf(root, env)
		expect(scene.map(({ row }) => row)).toEqual(['binding:c'])
		expect(rowsWithin(scene, [-100, -100], [100, 100])).toEqual(['binding:c'])
		expect(svgOfRows(root, env, ['binding:bg'])).toBeNull()
		expect(isBackgroundAt(root, env, 'binding:bg')).toBe(true)
		expect(isBackgroundAt(root, env, 'binding:c')).toBe(false)
	})
})

describe('what shows on a background', () => {
	it('is dark on light, and light on dark', () => {
		expect(inkOn('#ffffff')).toBe('#000000')
		expect(inkOn('#101010')).toBe('#ffffff')
	})
})
