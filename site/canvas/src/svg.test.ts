import { buildPrelude, type Env, evaluate, format, LetAST, print } from '@glisp/lang'
import { bound, parse } from './program.testing'
import { copiedRows, pastedArguments, pastedRows } from '@glisp/tweeq/rowsClipboard'
import { bounds } from 'pave/path/metrics'
import { describe, expect, it } from 'vitest'

import { isPath, type Path, RectValue, withGraphics } from './graphics'
import { exportedRows } from './rows'
import { sceneOf, withLayersFromOrder } from './scene'
import { bindingsOfSvg, programInFile, svgOfProgram, svgOfRows } from './svg'

const env: Env = withGraphics(buildPrelude())

describe('svgOfRows', () => {
	const root = parse('{r = 10 c = (path.circle [100 100] r) b = (path.rect [0 0] [10 20])}')

	it('has what they come to, named, and fits them', () => {
		const svg = svgOfRows(root, env, ['binding:b'])!
		expect(svg).toContain('viewBox="-2 -2 14 24"')
		expect(svg).toContain('<path id="b" d="M 0,0 L 10,0 L 10,20 L 0,20 Z"/>')
		expect(svg).not.toContain('id="c"')
	})

	it('has several, and is nothing for what is not drawn', () => {
		const svg = svgOfRows(root, env, ['binding:b', 'binding:c'])!
		expect(svg).toContain('id="b"')
		expect(svg).toContain('id="c"')
		expect(svgOfRows(root, env, ['binding:r'])).toBeNull()
	})

	it('has the code in it, written so that an SVG can have it', () => {
		const svg = svgOfRows(parse('{c = (path.d "M 0,0 L 1,1") a = (< 1 2)}'), env, ['binding:c', 'binding:a'])!
		expect(svg).toContain('c = (path.d "M 0,0 L 1,1")')
		expect(svg).toContain('a = (&lt; 1 2)')
	})

	it('says how it is drawn, if it says', () => {
		const svg = svgOfRows(parse('{c = (style (path.rect [0 0] [1 1]) "#ff0000" "#000000" 2)}'), env, ['binding:c'])!
		expect(svg).toContain('fill="#ff0000" stroke="#000000" stroke-width="2"')
	})

	it('says how its line is drawn, if it is not as an SVG takes it to be', () => {
		const svg = svgOfRows(
			parse('{c = (style (path.line [0 0] [1 1]) stroke: "#000000" cap: "round" dash: [4 2])}'),
			env,
			['binding:c']
		)!
		expect(svg).toContain('stroke-linecap="round" stroke-dasharray="4 2"')
		expect(svg).not.toContain('stroke-linejoin')
	})

	it('goes into a group', () => {
		const svg = svgOfRows(parse('{g = {c = (path.circle [0 0] 1)}}'), env, ['binding:g'])!
		expect(svg).toContain('id="c"')
	})
})

describe('a parameter on the clipboard', () => {
	const root = parse(
		'{a = (path.rect [0 0] [10 20]) b = (path.superellipse [5 5] [1 1] 2) c = (style (path.roundRect [0 0] [1 1] 2) "#ff0000") d = (path.circle [0 0] 3) e = (path.ellipse [0 0] [30 40])}'
	)

	it('is not an SVG', () => {
		expect(svgOfRows(root, env, ['binding:a/arg1'])).toBeNull()
		expect(copiedRows(root, env, ['binding:a/arg1'])).toBe('size = ^size [10 20]')
	})

	it('goes to the parameter of the same name, through what holds it', () => {
		expect(print(pastedArguments(root, env, ['binding:c'], 'size = [10 20]')!)).toContain(
			'c = (style (path.roundRect [0 0] [10 20] 2) "#ff0000")'
		)
	})

	it('goes from an ellipse to a superellipse, as both have a radius of each axis', () => {
		const text = copiedRows(root, env, ['binding:e/arg1'])
		expect(print(pastedArguments(root, env, ['binding:b'], text)!)).toContain(
			'b = (path.superellipse [5 5] [30 40] 2)'
		)
	})

	it('does not go by the type alone: a size is not a radius', () => {
		expect(pastedArguments(root, env, ['binding:b'], 'size = [10 20]')).toBeNull()
	})

	it('does not go to a radius that would not take it', () => {
		expect(pastedArguments(root, env, ['binding:b'], 'radius = 40')).toBeNull()
	})

	it('is a binding of its own where there is no place for it', () => {
		const { ast } = pastedRows(root, env, 'binding:a', 'radius = 40')!
		expect(print(ast)).toContain('radius = 40')
	})
})

describe('bindingsOfSvg', () => {
	it('is the code, from a canvas, whatever is in it', () => {
		const root = parse('{r = 10 c = (path.circle [0 0] r) a = (< 1 2)}')
		const svg = svgOfRows(root, env, ['binding:c', 'binding:a'])!
		expect(bindingsOfSvg(svg)).toBe('c = (path.circle [0 0] r)\na = (< 1 2)')
	})

	const shapesOf = (svg: string) => {
		const reading = programInFile(svg)!
		const root = withLayersFromOrder(parse(reading.source) as LetAST, env)
		return sceneOf(root, env).filter(({ draw }) => draw === 'path')
	}

	it('draws an icon as such files have them, with its lines written as tersely as can be', () => {
		const [shape] = shapesOf(
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#1f1f1f"><path d="M5,20q-0.83,0-1.41-0.59T3,18V4Q3,3.17 3.59,2.59T5,2H19ZM7,16H8.1V10H7v4Z"/></svg>'
		)
		const [[left, top], [right, bottom]] = bounds(shape!.value as Path)
		expect(left).toBeCloseTo(3)
		expect(top).toBeCloseTo(2)
		expect(right).toBeCloseTo(19)
		expect(bottom).toBeCloseTo(20)
		expect(shape!.paint?.fill).toBe('#1f1f1f')
	})

	it('reads points as tersely as they can be written', () => {
		expect(bindingsOfSvg('<svg><polyline fill="none" points="1.5.5-2-3,1e1 4"/></svg>')).toBe(
			'polyline1 = (path.polyline [1.5 0.5] [-2 -3] [10 4])'
		)
	})

	it('rounds a rectangle, by either radius and no further than a side goes', () => {
		expect(bindingsOfSvg('<svg><rect fill="none" width="10" height="20" rx="3"/></svg>')).toBe('rect1 = (path.roundRect [0 0] [10 20] 3)')
		expect(bindingsOfSvg('<svg><rect fill="none" width="10" height="20" ry="30"/></svg>')).toBe('rect1 = (path.roundRect [0 0] [10 20] 5)')
	})

	it('keeps what it is drawn with from being hidden by what an element is called', () => {
		const svg = `<svg>
			<path id="path" fill="none" d="M0 0 L1 1"/>
			<path id="style" fill="red" d="M0 0 L1 1"/>
			<path id="true" fill="none" d="M0 0 L1 1"/>
			<path id="twin" fill="none" d="M0 0 L1 1"/>
			<path id="twin" fill="none" d="M0 0 L1 1"/>
			<path id="path5" fill="none" d="M0 0 L1 1"/>
		</svg>`
		const written = bindingsOfSvg(svg)!
		expect(written.split('\n').map(line => line.split(' = ')[0]).reverse()).toEqual(['path1', 'path2', 'path3', 'twin', 'path4', 'path5'])
		expect(shapesOf(svg)).toHaveLength(6)
	})

	it('is nothing for what is not an SVG', () => {
		expect(bindingsOfSvg('a = 1')).toBeNull()
		expect(bindingsOfSvg('<div>svg</div>')).toBeNull()
		expect(bindingsOfSvg('<svg xmlns="x"></svg>')).toBeNull()
	})

	it('has each kind of shape, as what it is', () => {
		expect(
			bindingsOfSvg(`<svg>
				<rect x="1" y="2" width="30" height="40"/>
				<circle cx="5" cy="6" r="7"/>
				<ellipse cx="1" cy="2" rx="3" ry="4"/>
				<line x1="0" y1="0" x2="1" y2="1"/>
				<polyline points="0,0 1,1 2,0"/>
				<polygon points="0 0 1 1 2 0"/>
				<path d="M0 0
					L10 10"/>
			</svg>`)
		).toBe(
			[
				'rect1 = (style (path.rect [1 2] [30 40]) fill: "#000000")',
				'circle1 = (style (path.circle [5 6] 7) fill: "#000000")',
				'ellipse1 = (style (path.ellipse [1 2] [3 4]) fill: "#000000")',
				'line1 = (style (path.line [0 0] [1 1]) fill: "#000000")',
				'polyline1 = (style (path.polyline [0 0] [1 1] [2 0]) fill: "#000000")',
				'polygon1 = (style (path.polygon [0 0] [1 1] [2 0]) fill: "#000000")',
				'path1 = (style (path.d "M0 0 L10 10") fill: "#000000")',
			].reverse().join('\n')
		)
	})

	it('keeps a name that can be a name, and counts the rest', () => {
		expect(
			bindingsOfSvg(`<svg><rect id="logo" width="1" height="1"/><rect id="a b" width="1" height="1"/></svg>`)
		).toBe('rect1 = (style (path.rect [0 0] [1 1]) fill: "#000000")\nlogo = (style (path.rect [0 0] [1 1]) fill: "#000000")')
	})

	it('has how a line is drawn, and leaves what it cannot', () => {
		expect(
			bindingsOfSvg(
				`<svg><circle r="1" stroke="black" stroke-linecap="round" stroke-linejoin="arcs" stroke-dasharray="4,2"/></svg>`
			)
		).toBe('circle1 = (style (path.circle [0 0] 1) fill: "#000000" stroke: "black" cap: "round" dash: [4 2])')
	})

	it('has how it is drawn, either way it is said', () => {
		expect(bindingsOfSvg(`<svg><circle r="1" fill="#ff0000"/></svg>`)).toBe(
			'circle1 = (style (path.circle [0 0] 1) fill: "#ff0000")'
		)
		expect(bindingsOfSvg(`<svg><circle r="1" style="fill: none; stroke: #00f; stroke-width: 3"/></svg>`)).toBe(
			'circle1 = (style (path.circle [0 0] 1) stroke: "#00f" width: 3)'
		)
		expect(bindingsOfSvg(`<svg><circle r="1" stroke="black"/></svg>`)).toBe(
			'circle1 = (style (path.circle [0 0] 1) fill: "#000000" stroke: "black")'
		)
	})

	it('leaves out what is only there to be used', () => {
		expect(
			bindingsOfSvg(`<svg><defs><clipPath id="a"><rect width="1" height="1"/></clipPath></defs><!-- <circle r="1"/> --><circle r="2"/></svg>`)
		).toBe('circle1 = (style (path.circle [0 0] 2) fill: "#000000")')
	})

	it('comes to shapes that can be drawn, pasted into a program', () => {
		const text = bindingsOfSvg(`<svg><path d="M0 0 C 1 0 2 0 3 3 Z"/><rect width="1" height="2"/></svg>`)!
		const { ast } = pastedRows(parse('{a = 1}'), env, null, text)!
		expect(sceneOf(ast, env).map(s => s.row)).toEqual(['binding:path1', 'binding:rect1'])
		expect(isPath(evaluate(parse('(path.d "M0 0 C 1 0 2 0 3 3 Z")'), env).value)).toBe(true)
		expect(print(ast)).toContain('rect1 = (style (path.rect [0 0] [1 2]) fill: "#000000")')
	})
})

describe('exporting an area', () => {
	const root = parse(`{
		near = (path.rect [0 0] [10 10])
		far = (path.rect [500 500] [10 10])
	}`)
	const area = new RectValue([0, 0], [100, 50])
	const rows = ['binding:near', 'binding:far']

	it('shows the area, whatever is in it', () => {
		expect(svgOfRows(root, env, rows, area)).toContain('viewBox="0 0 100 50"')
	})

	it('has only what is at all within it', () => {
		const svg = svgOfRows(root, env, rows, area)!
		expect(svg).toContain('id="near"')
		expect(svg).not.toContain('id="far"')
	})

	it('is nothing if nothing is', () => {
		expect(svgOfRows(root, env, ['binding:far'], area)).toBeNull()
	})

	it('goes by what is drawn, without one', () => {
		expect(svgOfRows(root, env, rows)).toContain('id="far"')
	})

	it('does not draw an area in itself', () => {
		const framed = parse('{page = (rect.new [0 0] [100 100]) a = (path.rect [0 0] [10 10])}')
		const svg = svgOfRows(framed, env, ['binding:page', 'binding:a'])!
		expect(svg).not.toContain('id="page"')
		expect(svg).toContain('id="a"')
	})
})

describe('a color that can be seen through', () => {
	const svgOf = (source: string) => svgOfRows(parse(source), env, ['binding:c'])!

	it('is written apart from how see-through it is', () => {
		const svg = svgOf('{c = (style (path.line [0 0] [1 1]) fill: "#ff000040" stroke: "#00000080")}')
		expect(svg).toContain('fill="#ff0000" fill-opacity="0.251"')
		expect(svg).toContain('stroke="#000000" stroke-opacity="0.502"')
	})

	it('is that however it is written', () => {
		const svg = svgOf('{c = (style (path.line [0 0] [1 1]) fill: "rgb(255 0 0 / 0.5)")}')
		expect(svg).toContain('fill="#ff0000" fill-opacity="0.5"')
	})

	it('says nothing more of one that cannot', () => {
		const svg = svgOf('{c = (style (path.line [0 0] [1 1]) fill: "red" stroke: "none")}')
		expect(svg).toContain('fill="red" stroke="none"')
		expect(svg).not.toContain('opacity')
	})

	it('comes back from elsewhere with its alpha in it', () => {
		expect(
			bindingsOfSvg('<svg><circle r="1" fill="#ff0000" fill-opacity="0.5" stroke="#000000" stroke-opacity="25%"/></svg>')
		).toBe('circle1 = (style (path.circle [0 0] 1) fill: "#ff000080" stroke: "#00000040")')
	})

	it('is the same color after going out and back', () => {
		const out = svgOf('{c = (style (path.line [0 0] [1 1]) fill: "#ff000040")}').replace(/<metadata>.*<\/metadata>/, '')
		expect(bindingsOfSvg(out)).toContain('fill: "#ff000040"')
	})

	it('leaves what is not a color out, as there is nothing to see through', () => {
		expect(bindingsOfSvg('<svg><circle r="1" fill="url(#a)" fill-opacity="0.5"/></svg>')).toBe('circle1 = (path.circle [0 0] 1)')
	})
})

describe('how what comes from an SVG is drawn', () => {
	const of = (svg: string) => bindingsOfSvg(`<svg>${svg}</svg>`)
	const C = '(path.circle [0 0] 1)'

	it('is black, where nothing says, as an SVG has it', () => {
		expect(of('<circle r="1"/>')).toBe(`circle1 = (style ${C} fill: "#000000")`)
	})

	it('goes down from what it is in, however far', () => {
		expect(bindingsOfSvg(`<svg fill="none" stroke="#111" stroke-width="2"><g><circle r="1"/></g></svg>`)).toBe(
			`circle1 = (style ${C} stroke: "#111" width: 2)`
		)
		expect(of('<g fill="#f00"><g style="fill: #00f"><circle r="1"/></g><circle r="1"/></g>')).toBe(
			`circle2 = (style ${C} fill: "#f00")\ncircle1 = (style ${C} fill: "#00f")`
		)
	})

	it('stops going down once what it is in has closed', () => {
		expect(of('<g fill="#f00"><circle r="1"/></g><circle r="1"/>')).toBe(
			`circle2 = (style ${C} fill: "#000000")\ncircle1 = (style ${C} fill: "#f00")`
		)
	})

	it('is what its own says over that, and `inherit` is to go by that', () => {
		expect(of('<g fill="#f00"><circle r="1" fill="#0f0"/></g>')).toBe(`circle1 = (style ${C} fill: "#0f0")`)
		expect(of('<g fill="#f00"><circle r="1" fill="inherit"/></g>')).toBe(`circle1 = (style ${C} fill: "#f00")`)
	})

	it('goes by the rules of a stylesheet, even in defs, over attributes and under its style', () => {
		const css = '<defs><style>/* c */ .a { fill: #f00 } circle.b, .c { stroke: #00f; stroke-width: 3px } #i { fill: #0f0 }</style></defs>'
		expect(of(`${css}<circle r="1" class="a" fill="#000"/>`)).toBe(`circle1 = (style ${C} fill: "#f00")`)
		expect(of(`${css}<circle r="1" class="a b"/>`)).toBe(`circle1 = (style ${C} fill: "#f00" stroke: "#00f" width: 3)`)
		expect(of(`${css}<circle r="1" class="a" id="i"/>`)).toBe(`i = (style ${C} fill: "#0f0")`)
		expect(of(`${css}<circle r="1" class="a" style="fill: #123"/>`)).toBe(`circle1 = (style ${C} fill: "#123")`)
		expect(of(`<style><![CDATA[.a{fill:#f00}]]></style><circle r="1" class="a"/>`)).toBe(`circle1 = (style ${C} fill: "#f00")`)
	})

	it('has `currentColor` be the color that goes down to it', () => {
		expect(of('<g color="#f00"><circle r="1" fill="currentColor" stroke="currentcolor"/></g>')).toBe(
			`circle1 = (style ${C} fill: "#f00" stroke: "#f00")`
		)
		expect(of('<circle r="1" fill="currentColor"/>')).toBe(`circle1 = (style ${C} fill: "#000000")`)
	})

	it('multiplies opacity all the way down, into the alpha of both', () => {
		expect(of('<g opacity="0.5"><circle r="1" fill="#ff0000" opacity="50%"/></g>')).toBe(
			`circle1 = (style ${C} fill: "#ff000040")`
		)
		expect(of('<g opacity="0.5"><g><circle r="1" fill="#ff0000" stroke="#0000ff" stroke-opacity="0.5"/></g></g>')).toBe(
			`circle1 = (style ${C} fill: "#ff000080" stroke: "#0000ff40")`
		)
	})

	it('has the first color of a gradient, through what it refers to, or what falls back', () => {
		const defs = '<defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#00f"/></linearGradient><linearGradient id="h" xlink:href="#g"/></defs>'
		expect(of(`${defs}<circle r="1" fill="url(#g)"/>`)).toBe(`circle1 = (style ${C} fill: "#f00")`)
		expect(of(`${defs}<circle r="1" fill="url(#h)"/>`)).toBe(`circle1 = (style ${C} fill: "#f00")`)
		expect(of(`<circle r="1" fill="url(#gone) #0f0"/>`)).toBe(`circle1 = (style ${C} fill: "#0f0")`)
		expect(of(`<circle r="1" fill="url(#gone)" stroke="#000"/>`)).toBe(`circle1 = (style ${C} stroke: "#000")`)
	})

	it('leaves out what is not to be seen, and what is in it', () => {
		expect(of('<g display="none"><circle r="1"/></g><g style="display: none"><circle r="2"/></g>')).toBeNull()
		expect(of('<g visibility="hidden"><circle r="1"/><circle r="2" visibility="visible" fill="#f00"/></g>')).toBe(
			'circle1 = (style (path.circle [0 0] 2) fill: "#f00")'
		)
	})

	it('goes back as it was drawn, from what a canvas wrote without its code', () => {
		const root = parse('[a = (style (path.circle [0 0] 1) fill: "#ff0000" stroke: "#0000ff" width: 2 cap: "round")]')
		const written = svgOfRows(root, env, ['binding:a'])!.replace(/<metadata>[\s\S]*?<\/metadata>/, '')
		expect(bindingsOfSvg(written)).toMatch(/^a = \(style \(path\.d "[^"]*"\) fill: "#ff0000" stroke: "#0000ff" width: 2 cap: "round"\)$/)
	})
})


describe('a program as a file', () => {
	const opened = (text: string) => {
		const reading = programInFile(text)!
		return { ...reading, root: parse(reading.source) as LetAST }
	}

	it('is a drawing, and comes back as the program it was, with all that is not drawn', () => {
		const root = parse('{r = (* 2 5) note = "a < b & c" [c = (path.circle [0 0] r) b = (path.rect [0 0] [r r])]}') as LetAST
		const file = svgOfProgram(root, env)
		expect(file).toContain('<path id="c"')
		expect(file).toContain('<path id="b"')
		const { root: back, whole } = opened(file)
		expect(whole).toBe(true)
		expect(format(print(back))).toBe(format(print(root)))
	})

	it('is kept, as an SVG with nothing to see, if nothing is drawn', () => {
		for (const source of ['{r = 10 []}', '{r = 10 [q = r]}']) {
			const root = parse(source) as LetAST
			const file = svgOfProgram(root, env)
			expect(file).toMatch(/^<svg /)
			expect(file).not.toContain('<path')
			const { root: back, whole } = opened(file)
			expect(whole).toBe(true)
			expect(format(print(back))).toBe(format(print(root)))
		}
	})

	it('can be pasted, as any SVG from a canvas can', () => {
		const file = svgOfProgram(parse('{r = 10 [c = (path.circle [0 0] r)]}') as LetAST, env)
		const { ast, paths } = pastedRows(parse('[a = 1]'), env, null, bindingsOfSvg(file)!)!
		expect(paths).toContain('binding:c')
		expect(print(ast)).toContain('r = 10')
	})

	it('is not what some rows are, or an SVG from elsewhere, or source from before', () => {
		const rows = svgOfRows(parse('{r = 10 [c = (path.circle [0 0] r)]}'), env, ['binding:c'])!
		expect(programInFile(rows)?.whole).toBe(false)
		expect(programInFile('<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>')?.whole).toBe(false)
		expect(programInFile('{r = 10 [r]}')).toEqual({ source: '{r = 10 [r]}', whole: false })
	})

	it('draws what an SVG from elsewhere does, once it has been read', () => {
		const { root } = opened('<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/><rect width="1" height="1"/></svg>')
		const rows = sceneOf(withLayersFromOrder(root, env), env).map(({ row }) => row)
		expect(rows).toEqual(['binding:circle1', 'binding:rect1'])
	})

	it('keeps what is in front, from all of a program exported', () => {
		const root = parse('[a = (path.circle [0 0] 1) b = (path.rect [0 0] [1 1])]')
		const { root: back } = opened(svgOfRows(root, env, exportedRows(root, env, []))!)
		expect(sceneOf(back, env).map(({ row }) => row)).toEqual(sceneOf(root, env).map(({ row }) => row))
	})

	it('has the graph paper and the solid in what is exported, and fits only that', () => {
		const root = parse('[a = (path.circle [0 0] 1) b = (path.rect [100 100] [1 1]) g = (graphPaper "dots") bg = (solid "#ff0000")]')
		const file = svgOfRows(root, env, exportedRows(root, env, ['binding:a']))!
		expect(file).toContain('viewBox="-3 -3 6 6"')
		expect(file).toContain('id="a"')
		expect(file).not.toContain('id="b"')
		expect(file).toContain('fill="#ff0000"')
		expect(file).toContain('url(#g)')
		const { root: back } = opened(file)
		expect(bound(back).map(([name]) => name)).toEqual(['bg', 'g', 'a'])
	})

	it('has no graph paper or solid of its own on the clipboard, or if only those are asked for', () => {
		const root = parse('[a = (path.circle [0 0] 1) g = (graphPaper "dots") bg = (solid "#ff0000")]')
		expect(svgOfRows(root, env, ['binding:a'])).not.toContain('url(#g)')
		expect(svgOfRows(root, env, exportedRows(root, env, ['binding:g']))).toBeNull()
	})

	it('can have nothing in it at all', () => {
		const { root: back, whole } = opened(svgOfProgram(new LetAST([], null), env))
		expect(bound(back)).toEqual([])
		expect(whole).toBe(false)
	})

	it('is nothing if it is an SVG with nothing to read', () => {
		expect(programInFile('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).toBeNull()
		expect(programInFile('<svg><metadata><glisp>a = (</glisp></metadata></svg>')).toBeNull()
	})
})
