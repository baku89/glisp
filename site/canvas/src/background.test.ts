import { buildPrelude, type Env, type LetAST, print } from '@glisp/lang'
import { parse } from './program.testing'
import { describe, expect, it } from 'vitest'

import { inkOn, withGraphics } from './graphics'
import { backgroundOf, gridOf, isOfCanvasAt, rowsWithin, sceneOf } from './scene'
import { withGridToggled } from './rows'
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
		expect(isOfCanvasAt(root, env, 'binding:bg')).toBe(true)
		expect(isOfCanvasAt(root, env, 'binding:c')).toBe(false)
	})
})

describe('what shows on a background', () => {
	it('is dark on light, and light on dark', () => {
		expect(inkOn('#ffffff')).toBe('#000000')
		expect(inkOn('#101010')).toBe('#ffffff')
	})
})

describe('a grid', () => {
	const gridIn = (source: string) => gridOf(parse(source), env)
	const toggled = (source: string, kind: 'dots' | 'lines') =>
		print(withGridToggled(parse(source) as LetAST, env, kind))

	it('is what the last row that says so says', () => {
		expect(gridIn('{a = 1}')).toBe('none')
		expect(gridIn('{g = (grid "dots")}')).toBe('dots')
		expect(gridIn('{g = (grid)}')).toBe('dots')
		expect(gridIn('{g = (grid "none")}')).toBe('none')
		expect(gridIn('{g = #_(grid "dots")}')).toBe('none')
		expect(gridIn('{a = (grid "dots") b = (grid "lines")}')).toBe('lines')
	})

	it('is not a shape, and is not in an SVG', () => {
		const root = parse('{g = (grid "dots") c = (path.circle [0 0] 10)}')
		expect(sceneOf(root, env).map(({ row }) => row)).toEqual(['binding:c'])
		expect(svgOfRows(root, env, ['binding:g'])).toBeNull()
		expect(isOfCanvasAt(root, env, 'binding:g')).toBe(true)
	})

	it('is declared behind all else in a project that has none, when it is turned on', () => {
		const next = toggled('{c = (path.circle [0 0] 1)}', 'dots')
		expect(gridIn(next)).toBe('dots')
		expect(next.indexOf('grid1')).toBeGreaterThan(next.indexOf('c ='))
	})

	it('is said by the row it already has, from then on', () => {
		const on = '{g = (grid "dots")}'
		expect(gridIn(toggled('{g = (grid "none")}', 'dots'))).toBe('dots')
		expect(gridIn(toggled(on, 'dots'))).toBe('none')
		expect(gridIn(toggled(on, 'lines'))).toBe('lines')
		expect(toggled(on, 'lines')).not.toContain('grid1')
		expect(gridIn(toggled('{g = #_(grid "lines")}', 'dots'))).toBe('dots')
		expect(toggled('{g = #_(grid "lines")}', 'dots')).not.toContain('grid1')
		expect(gridIn(toggled('{x = {g = (grid "dots")}}', 'lines'))).toBe('lines')
	})

	it('is not looked for in what is hidden as a whole, where saying it would do nothing', () => {
		const next = toggled('{x = #_{g = (grid "lines")}}', 'dots')
		expect(gridIn(next)).toBe('dots')
	})
})
