import { AS_SOURCE, buildPrelude, type Env, evaluate, type LetAST, print, type TypedHostFn } from '@glisp/lang'
import { defaultFor } from '@glisp/tweeq/structure'
import { parse } from './program.testing'
import { describe, expect, it } from 'vitest'

import { type AxesValue, inkOn, withGraphics } from './graphics'
import { solidOf, graphPaperOf, isOfCanvasAt, paintedIn, rowsWithin, sceneOf, writtenAsNow } from './scene'
import { exportedRows, withAxesToggled, withGraphPaperToggled } from './rows'
import { svgOfRows } from './svg'

const env: Env = withGraphics(buildPrelude())
const of = (source: string) => solidOf(parse(source), env)

describe('a solid', () => {
	it('is a color the program says, by what it is and not by its name', () => {
		expect(of('{anything = (solid "#ff0000")}')).toBe('#ff0000')
	})

	it('is nothing, unless something says so', () => {
		expect(of('{c = (path.circle [0 0] 10)}')).toBeNull()
		expect(of('{bg = #_(solid "#ff0000")}')).toBeNull()
	})

	it('goes by the last, and can be in a group', () => {
		expect(of('{a = (solid "#ff0000") b = (solid "#00ff00")}')).toBe('#00ff00')
		expect(of('{g = {bg = (solid "#ff0000")}}')).toBe('#ff0000')
	})

	it('is white if it does not say, as there is no such thing as one with no color', () => {
		expect(of('{bg = (solid)}')).toBe('#ffffff')
	})

	it('can be worked out, and refer to what is around it', () => {
		expect(of('{c = "#0000ff" bg = (solid c)}')).toBe('#0000ff')
	})

	it('is not a shape: not drawn as one, not selected by a range, not in an SVG', () => {
		const root = parse('{bg = (solid "#ff0000") c = (path.circle [0 0] 10)}')
		const scene = sceneOf(root, env)
		expect(scene.map(({ row }) => row)).toEqual(['binding:c'])
		expect(rowsWithin(scene, [-100, -100], [100, 100])).toEqual(['binding:c'])
		expect(svgOfRows(root, env, ['binding:bg'])).toBeNull()
		expect(isOfCanvasAt(root, env, 'binding:bg')).toBe(true)
		expect(isOfCanvasAt(root, env, 'binding:c')).toBe(false)
	})
})

describe('what goes on and on', () => {
	const inFile = (source: string) => {
		const root = parse(source)
		return svgOfRows(root, env, exportedRows(root, env, []))!.split('</metadata>')[1]!
	}

	it('is in its place among the layers, and what comes first is in front', () => {
		const file = inFile('[g = (graphPaper "dots") bg = (solid "#ff0000") a = (path.circle [0 0] 1)]')
		expect(file.indexOf('id="a"')).toBeLessThan(file.indexOf('#ff0000'))
		expect(file.indexOf('#ff0000')).toBeLessThan(file.indexOf('<pattern id="g"'))
		const other = inFile('[a = (path.circle [0 0] 1) g = (graphPaper "dots") bg = (solid "#ff0000")]')
		expect(other.indexOf('#ff0000')).toBeLessThan(other.indexOf('<pattern id="g"'))
		expect(other.indexOf('<pattern id="g"')).toBeLessThan(other.indexOf('id="a"'))
	})

	it('can be there more than once, each drawn', () => {
		const file = inFile('[a = (path.circle [0 0] 1) x = (solid "#ff0000") y = (solid "#00ff00")]')
		expect(file).toContain('#ff0000')
		expect(file).toContain('#00ff00')
	})
})

describe('axes', () => {
	const a = 'a = (path.circle [0 0] 1)'
	const exported = (source: string) => {
		const root = parse(source)
		return svgOfRows(root, env, exportedRows(root, env, []))!.split('</metadata>')[1]!
	}

	it('are of the canvas, and not shapes', () => {
		const root = parse(`[${a} x = (axes)]`)
		expect(sceneOf(root, env).map(({ row }) => row)).toEqual(['binding:a'])
		expect(isOfCanvasAt(root, env, 'binding:x')).toBe(true)
	})

	it('are drawn in the end, through their origin, in their color and width', () => {
		const file = exported(`[${a} x = (axes origin: [5 7] color: "#00ff00" width: 3)]`)
		expect(file).toContain('d="M 5 -3 V 3 M -3 7 H 3" stroke="#00ff00" stroke-width="3"')
	})

	it('are in their place among the layers', () => {
		const front = exported(`[x = (axes color: "#00ff00") ${a}]`)
		expect(front.indexOf('id="a"')).toBeLessThan(front.indexOf('#00ff00'))
		const back = exported(`[${a} x = (axes color: "#00ff00")]`)
		expect(back.indexOf('#00ff00')).toBeLessThan(back.indexOf('id="a"'))
	})

	it('go out of sight and come back as they were, or come to be if there are none', () => {
		const toggled = (source: string) => print(withAxesToggled(parse(source) as LetAST, env))
		const on = '{main = [x = (axes origin: [1 2])]}'
		const off = toggled(on)
		expect(off).toBe('{main = [x = #_(axes origin: [1 2])]}')
		expect(toggled(off)).toBe(on)
		expect(toggled('[a = (path.circle [0 0] 1)]')).toContain('axes1 = (axes)')
	})

	it('say only what is not as it would be anyway', () => {
		const value = (source: string) => paintedIn(parse(source), env).find(({ draw }) => draw === 'axes')!.value as AxesValue
		expect(print(value('[x = (axes)]')[AS_SOURCE]())).toBe('(axes)')
		expect(print(value('[x = (axes origin: [1 2] width: 2)]')[AS_SOURCE]())).toBe('(axes origin: [1 2] width: 2)')
	})
})

describe('what was written before', () => {
	it('goes by the names there are now', () => {
		expect(writtenAsNow('[a = (background "#ff0000") g = (grid "lines")]')).toBe('[a = (solid "#ff0000") g = (graphPaper "lines")]')
		expect(writtenAsNow('(grid)')).toBe('(graphPaper)')
	})

	it('has what said there was nothing come to be hidden', () => {
		const now = writtenAsNow('[g = (grid "none") b = (background "none")]')
		expect(now).toBe('[g = #_(graphPaper "dots") b = #_(solid "#ffffff")]')
		expect(graphPaperOf(parse(now), env)).toBeNull()
		expect(of(now)).toBeNull()
	})

	it('leaves a function a program has of its own', () => {
		const own = '{grid = (=> [at: point]: path (path.circle at 5)) a = (grid [1 2])}'
		expect(writtenAsNow(own)).toBe(own)
	})

	it('has lines out from a center come to a group of them, each styled as the whole was', () => {
		expect(writtenAsNow('(path.radial [10 20] [[0 5 15] [90 0 10]])')).toBe('[line1 = (path.line [15 20] [25 20]) line2 = (path.line [10 20] [10 30])]')
		expect(writtenAsNow('(style (path.radial [0 0] [[0 1 2]]) stroke: "#fff" width: 3)')).toBe('[line1 = (style (path.line [1 0] [2 0]) stroke: "#fff" width: 3)]')
		const worked = '(path.radial [0 0] (map (range 0 3) f))'
		expect(writtenAsNow(worked)).toBe(worked)
	})

	it('has the stops of a Dubins path come to a place and the rest', () => {
		expect(writtenAsNow('(path.dubinsChain [[0 0 0 50] [200 100.5 -90]] 20)')).toBe('(path.dubinsChain [[[0 0] 0 50] [[200 100.5] -90]] 20)')
		const already = '(path.dubinsChain [[[0 0] 0] [[1 1] 0]] 20)'
		expect(writtenAsNow(already)).toBe(already)
	})
})

describe('what shows on a solid', () => {
	it('is dark on light, and light on dark', () => {
		expect(inkOn('#ffffff')).toBe('#000000')
		expect(inkOn('#101010')).toBe('#ffffff')
	})
})

describe('a graph paper', () => {
	const graphPaperIn = (source: string) => graphPaperOf(parse(source), env)?.kind ?? null
	const toggled = (source: string, kind: 'dots' | 'lines') =>
		print(withGraphPaperToggled(parse(source) as LetAST, env, kind))

	it('is what the last row that says so says', () => {
		expect(graphPaperIn('{a = 1}')).toBeNull()
		expect(graphPaperIn('{g = (graphPaper "dots")}')).toBe('dots')
		expect(graphPaperIn('{g = (graphPaper)}')).toBe('dots')
		expect(graphPaperIn('{g = #_(graphPaper "dots")}')).toBeNull()
		expect(graphPaperIn('{a = (graphPaper "dots") b = (graphPaper "lines")}')).toBe('lines')
	})

	it('has a color and a width, which it does without saying', () => {
		const said = graphPaperOf(parse('{g = (graphPaper "lines" color: "#ff0000" width: 3)}'), env)!
		expect([said.color, said.width]).toEqual(['#ff0000', 3])
		const plain = graphPaperOf(parse('{g = (graphPaper "lines")}'), env)!
		expect(plain.width).toBe(1)
		expect(print(plain[AS_SOURCE]())).toBe('(graphPaper "lines")')
		expect(print(said[AS_SOURCE]())).toBe('(graphPaper "lines" color: "#ff0000" width: 3)')
		expect(graphPaperOf(parse('{g = (graphPaper "lines" width: -1)}'), env)!.width).toBe(0)
	})

	it('goes from an origin, by a step, and adaptive unless it says otherwise', () => {
		const plain = graphPaperOf(parse('{g = (graphPaper "dots")}'), env)!
		expect([plain.origin, plain.step, plain.adaptive]).toEqual([[0, 0], 20, true])
		const said = graphPaperOf(parse('{g = (graphPaper "dots" origin: [5 7] step: 50 adaptive: false)}'), env)!
		expect([said.origin, said.step, said.adaptive]).toEqual([[5, 7], 50, false])
		expect(print(said[AS_SOURCE]())).toBe('(graphPaper "dots" origin: [5 7] step: 50 adaptive: false)')
		expect(print(plain[AS_SOURCE]())).toBe('(graphPaper "dots")')
	})

	it('shows the color it comes to when it does not say one, in what edits it', () => {
		for (const name of ['graphPaper', 'axes']) {
			const fn = evaluate(parse(name), env).value as TypedHostFn
			const color = fn.paramTypes[1]!
			expect(print(defaultFor(color, env))).toMatch(/^"#808080/)
		}
	})

	it('has a step that can be drawn, whatever it is told', () => {
		for (const step of [0, -5]) {
			expect(graphPaperOf(parse(`{g = (graphPaper "dots" step: ${step})}`), env)!.step).toBe(20)
		}
	})

	it('is as it is at full size in the end, adaptive or not', () => {
		for (const adaptive of ['', ' adaptive: false']) {
			const root = parse(`[a = (path.circle [0 0] 1) g = (graphPaper "lines" step: 50${adaptive})]`)
			const file = svgOfRows(root, env, exportedRows(root, env, ['binding:a']))!
			expect(file).toContain('<pattern id="g" width="50" height="50"')
		}
	})

	it('is moved by its origin in the end', () => {
		const root = parse('[a = (path.circle [0 0] 1) g = (graphPaper "dots" origin: [5 7])]')
		const file = svgOfRows(root, env, exportedRows(root, env, ['binding:a']))!
		expect(file).toContain('patternTransform="translate(-5 -3)"')
	})

	it('is drawn in its color and width in the end', () => {
		const root = parse('[a = (path.circle [0 0] 1) g = (graphPaper "dots" color: "#ff000080" width: 2)]')
		const file = svgOfRows(root, env, exportedRows(root, env, ['binding:a']))!
		expect(file).toContain('r="2" fill="#ff0000" fill-opacity="0.502"')
		const lines = parse('[a = (path.circle [0 0] 1) g = (graphPaper "lines" color: "#00ff00" width: 3)]')
		const other = svgOfRows(lines, env, exportedRows(lines, env, ['binding:a']))!
		expect(other).toContain('stroke="#00ff00" stroke-width="3"')
	})

	it('keeps its color and width through being turned off and on, and going to another kind', () => {
		const on = '{main = [g = (graphPaper "dots" color: "#ff0000" width: 2)]}'
		const off = toggled(on, 'dots')
		expect(graphPaperIn(off)).toBeNull()
		expect(toggled(off, 'dots')).toBe(on)
		expect(toggled(on, 'lines')).toBe('{main = [g = (graphPaper "lines" color: "#ff0000" width: 2)]}')
		expect(toggled(off, 'lines')).toBe('{main = [g = (graphPaper "lines" color: "#ff0000" width: 2)]}')
		expect(toggled('{c = "#ff0000" g = (graphPaper "dots" color: c)}', 'lines')).toContain('color: c')
	})

	it('is not a shape, and is not in an SVG', () => {
		const root = parse('{g = (graphPaper "dots") c = (path.circle [0 0] 10)}')
		expect(sceneOf(root, env).map(({ row }) => row)).toEqual(['binding:c'])
		expect(svgOfRows(root, env, ['binding:g'])).toBeNull()
		expect(isOfCanvasAt(root, env, 'binding:g')).toBe(true)
	})

	it('is declared behind all else in a project that has none, when it is turned on', () => {
		const next = toggled('{c = (path.circle [0 0] 1)}', 'dots')
		expect(graphPaperIn(next)).toBe('dots')
		expect(next.indexOf('graphPaper1')).toBeGreaterThan(next.indexOf('c ='))
	})

	it('is said by the row it already has, from then on', () => {
		const on = '{g = (graphPaper "dots")}'
		expect(graphPaperIn(toggled(on, 'dots'))).toBeNull()
		expect(graphPaperIn(toggled(on, 'lines'))).toBe('lines')
		expect(toggled(on, 'lines')).not.toContain('graphPaper1')
		expect(graphPaperIn(toggled('{g = #_(graphPaper "lines")}', 'dots'))).toBe('dots')
		expect(toggled('{g = #_(graphPaper "lines")}', 'dots')).not.toContain('graphPaper1')
		expect(graphPaperIn(toggled('{x = {g = (graphPaper "dots")}}', 'lines'))).toBe('lines')
	})

	it('is not looked for in what is hidden as a whole, where saying it would do nothing', () => {
		const next = toggled('{x = #_{g = (graphPaper "lines")}}', 'dots')
		expect(graphPaperIn(next)).toBe('dots')
	})
})
