import { buildPrelude, type Env, evaluate, parse, print } from '@glisp/lang'
import { copiedRows, pastedArguments, pastedRows } from '@glisp/tweeq/rowsClipboard'
import { describe, expect, it } from 'vitest'

import { isPath, RectValue, withGraphics } from './graphics'
import { sceneOf } from './scene'
import { bindingsOfSvg, svgOfRows } from './svg'

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
			parse('{c = (style (path.line [0 0] [1 1]) stroke="#000000" cap="round" dash=[4 2])}'),
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
		expect(copiedRows(root, env, ['binding:a/arg1'])).toBe('size = [10 20]')
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
				'rect1 = (path.rect [1 2] [30 40])',
				'circle1 = (path.circle [5 6] 7)',
				'ellipse1 = (path.ellipse [1 2] [3 4])',
				'line1 = (path.line [0 0] [1 1])',
				'polyline1 = (path.polyline [0 0] [1 1] [2 0])',
				'polygon1 = (path.polygon [0 0] [1 1] [2 0])',
				'path1 = (path.d "M0 0 L10 10")',
			].join('\n')
		)
	})

	it('keeps a name that can be a name, and counts the rest', () => {
		expect(
			bindingsOfSvg(`<svg><rect id="logo" width="1" height="1"/><rect id="a b" width="1" height="1"/></svg>`)
		).toBe('logo = (path.rect [0 0] [1 1])\nrect1 = (path.rect [0 0] [1 1])')
	})

	it('has how a line is drawn, and leaves what it cannot', () => {
		expect(
			bindingsOfSvg(
				`<svg><circle r="1" stroke="black" stroke-linecap="round" stroke-linejoin="arcs" stroke-dasharray="4,2"/></svg>`
			)
		).toBe('circle1 = (style (path.circle [0 0] 1) fill="#000000" stroke="black" cap="round" dash=[4 2])')
	})

	it('has how it is drawn, either way it is said', () => {
		expect(bindingsOfSvg(`<svg><circle r="1" fill="#ff0000"/></svg>`)).toBe(
			'circle1 = (style (path.circle [0 0] 1) fill="#ff0000")'
		)
		expect(bindingsOfSvg(`<svg><circle r="1" style="fill: none; stroke: #00f; stroke-width: 3"/></svg>`)).toBe(
			'circle1 = (style (path.circle [0 0] 1) stroke="#00f" width=3)'
		)
		expect(bindingsOfSvg(`<svg><circle r="1" stroke="black"/></svg>`)).toBe(
			'circle1 = (style (path.circle [0 0] 1) fill="#000000" stroke="black")'
		)
	})

	it('leaves out what is only there to be used', () => {
		expect(
			bindingsOfSvg(`<svg><defs><clipPath id="a"><rect width="1" height="1"/></clipPath></defs><!-- <circle r="1"/> --><circle r="2"/></svg>`)
		).toBe('circle1 = (path.circle [0 0] 2)')
	})

	it('comes to shapes that can be drawn, pasted into a program', () => {
		const text = bindingsOfSvg(`<svg><path d="M0 0 C 1 0 2 0 3 3 Z"/><rect width="1" height="2"/></svg>`)!
		const { ast } = pastedRows(parse('{a = 1}'), env, null, text)!
		expect(sceneOf(ast, env).map(s => s.row)).toEqual(['binding:path1', 'binding:rect1'])
		expect(isPath(evaluate(parse('(path.d "M0 0 C 1 0 2 0 3 3 Z")'), env).value)).toBe(true)
		expect(print(ast)).toContain('rect1 = (path.rect [0 0] [1 2])')
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
		const svg = svgOf('{c = (style (path.line [0 0] [1 1]) fill="#ff000040" stroke="#00000080")}')
		expect(svg).toContain('fill="#ff0000" fill-opacity="0.251"')
		expect(svg).toContain('stroke="#000000" stroke-opacity="0.502"')
	})

	it('is that however it is written', () => {
		const svg = svgOf('{c = (style (path.line [0 0] [1 1]) fill="rgb(255 0 0 / 0.5)")}')
		expect(svg).toContain('fill="#ff0000" fill-opacity="0.5"')
	})

	it('says nothing more of one that cannot', () => {
		const svg = svgOf('{c = (style (path.line [0 0] [1 1]) fill="red" stroke="none")}')
		expect(svg).toContain('fill="red" stroke="none"')
		expect(svg).not.toContain('opacity')
	})

	it('comes back from elsewhere with its alpha in it', () => {
		expect(
			bindingsOfSvg('<svg><circle r="1" fill="#ff0000" fill-opacity="0.5" stroke="#000000" stroke-opacity="25%"/></svg>')
		).toBe('circle1 = (style (path.circle [0 0] 1) fill="#ff000080" stroke="#00000040")')
	})

	it('is the same color after going out and back', () => {
		const out = svgOf('{c = (style (path.line [0 0] [1 1]) fill="#ff000040")}').replace(/<metadata>.*<\/metadata>/, '')
		expect(bindingsOfSvg(out)).toContain('fill="#ff000040"')
	})

	it('leaves what is not a color alone', () => {
		expect(bindingsOfSvg('<svg><circle r="1" fill="url(#a)" fill-opacity="0.5"/></svg>')).toContain('fill="url(#a)"')
	})
})
