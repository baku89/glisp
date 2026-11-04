import { buildPrelude, LetAST, parse, print, renameBinding } from '@glisp/lang'
import { combined, filtersFor, wrappedAt } from '@glisp/tweeq/filters'
import { layersOf, moveBinding, viewOf, withLayerAdded } from '@glisp/tweeq/structure'
import { pastedRows, withoutRows } from '@glisp/tweeq/rowsClipboard'
import { describe, expect, it } from 'vitest'

import { withGraphics } from './graphics'
import { allPaintedRows, arranged, grouped, ungrouped, withBackground, withGridToggled } from './rows'
import { svgOfRows } from './svg'
import { sceneOf, valueOfRow, withLayersFromOrder } from './scene'

const env = withGraphics(buildPrelude())
const P = (x: number) => `(path.circle [${x} 0] 1)`
const drawn = (source: string) => sceneOf(parse(source), env).map(({ row }) => row.replaceAll('binding:', ''))

describe('what a program draws', () => {
	it('is what its vector holds, the first in front, so drawn last', () => {
		expect(drawn(`[a = ${P(1)} b = ${P(2)}]`)).toEqual(['b', 'a'])
		expect(drawn(`[b = ${P(2)} a = ${P(1)}]`)).toEqual(['a', 'b'])
	})

	it('does not go by the order of what is bound', () => {
		const said = (first: string, second: string) => `{${first} ${second} [b a]}`
		const a = `a = ${P(1)}`
		const b = `b = ${P(2)}`
		expect(drawn(said(a, b))).toEqual(['a', 'b'])
		expect(drawn(said(b, a))).toEqual(['a', 'b'])
	})

	it('leaves out what is only named, even if it could be drawn', () => {
		expect(drawn(`{base = ${P(1)} [a = (path.offset base 2)]}`)).toEqual(['a'])
		expect(drawn(`{a = ${P(1)}}`)).toEqual([])
	})

	it('draws the same thing twice, if it is held twice', () => {
		expect(drawn(`[a = ${P(1)} b = ${P(2)} a]`)).toEqual(['a', 'b', 'a'])
	})

	it('goes into a group, keeping its order in there, and draws what has no name', () => {
		expect(drawn(`[a = ${P(1)} g = [b = ${P(2)} c = ${P(3)}]]`)).toEqual(['g/c', 'g/b', 'a'])
		expect(drawn(`{[${P(1)}]}`)).toEqual(['element:0'])
	})

	it('can be seen from outside of its vector, and sees it', () => {
		expect(drawn(`{x = (path.offset a 1) [a = ${P(1)} x]}`)).toEqual(['x', 'a'])
	})
})

describe('a program from before', () => {
	const after = (source: string) => print(withLayersFromOrder(parse(source), env))

	it('holds what draws anything, what was drawn last coming first', () => {
		expect(after(`{r = 10 a = ${P(1)} b = ${P(2)}}`)).toBe(`{r = 10 [b = ${P(2)} a = ${P(1)}]}`)
	})

	it('has its groups come to hold what they did', () => {
		expect(after(`{g = {a = ${P(1)} n = 1}}`)).toBe(`[g = {n = 1 [a = ${P(1)}]}]`)
	})

	it('has a vector, even with nothing in it, and is left alone once it has one', () => {
		expect(after('{n = 1}')).toBe('{n = 1 []}')
		const now = `{n = 1 [a = ${P(1)}]}`
		expect(after(now)).toBe(now)
	})
})

describe('editing what is drawn', () => {
	const root = (source: string) => parse(source) as LetAST
	const ABC = `[a = ${P(1)} b = ${P(2)} c = ${P(3)}]`
	// As it is listed: the first in front.
	const order = (ast: unknown) => sceneOf(ast as LetAST, env).map(({ row }) => row.replaceAll('binding:', '')).reverse()

	it('lets go of what is removed, in what holds it too', () => {
		const next = withoutRows(root(ABC), env, ['binding:b'])
		expect(order(next)).toEqual(['a', 'c'])
		expect((next as LetAST).bindings.map(([name]) => name)).toEqual(['a', 'c'])
	})

	it('follows a name, where it is held', () => {
		expect(order(renameBinding(root(ABC), 'b', 'z'))).toEqual(['a', 'z', 'c'])
	})

	it('reorders what is held, by dragging beside it', () => {
		expect(order(moveBinding(root(ABC), env, 'binding:c', 'binding:a', 'before'))).toEqual(['c', 'a', 'b'])
		expect(order(moveBinding(root(ABC), env, 'binding:a', 'binding:c', 'after'))).toEqual(['b', 'c', 'a'])
	})

	it('is no longer drawn, dragged beside what is only named, and the other way', () => {
		const source = `{n = 1 [a = ${P(1)} b = ${P(2)}]}`
		expect(order(moveBinding(root(source), env, 'binding:a', 'binding:n', 'after'))).toEqual(['b'])
		const unnamed = `{m = ${P(3)} [a = ${P(1)}]}`
		expect(order(moveBinding(root(unnamed), env, 'binding:m', 'binding:a', 'before'))).toEqual(['m', 'a'])
	})

	it('goes into a group by being dragged there', () => {
		const source = `[a = ${P(1)} g = [b = ${P(2)}]]`
		expect(order(moveBinding(root(source), env, 'binding:a', 'binding:g', 'inside'))).toEqual(['g/a', 'g/b'])
	})

	it('shows what is only named first, and then what is held, in its order', () => {
		const keys = viewOf(root(`{n = 1 [b = ${P(2)} a = ${P(1)} ${P(3)}]}`), env).slots.map(({ key }) => key)
		expect(keys).toEqual(['binding:n', 'binding:b', 'binding:a', 'element:2'])
	})

	it('goes to the front by what is held', () => {
		expect(order(arranged(root(ABC), ['binding:c'], 'front'))).toEqual(['c', 'a', 'b'])
	})

	it('groups where the frontmost of them was, and comes back the same', () => {
		const { ast } = grouped(root(ABC), env, ['binding:a', 'binding:b'])!
		expect(order(ast)).toEqual(['group1/a', 'group1/b', 'c'])
		expect(order(ungrouped(ast, env, ['binding:group1'])!.ast)).toEqual(['a', 'b', 'c'])
	})

	it('pastes beside what is held, or else in front', () => {
		const pasted = (after: string | null) => order(pastedRows(root(ABC), env, after, `d = ${P(4)}`)!.ast)
		expect(pasted('binding:a')).toEqual(['a', 'd', 'b', 'c'])
		expect(pasted(null)).toEqual(['d', 'a', 'b', 'c'])
	})
})

describe('what is new', () => {
	it('goes in front of all', () => {
		const next = withLayerAdded(parse(`[a = ${P(1)}]`) as LetAST, 'n', parse(P(2)))
		expect(layersOf(next)).toEqual(['n', 'a'])
	})
})

describe('the background and the grid', () => {
	const root = (source: string) => parse(source) as LetAST
	const SHAPE = `a = ${P(1)}`

	it('are behind all else, the background the furthest', () => {
		const withGrid = withGridToggled(root(`[${SHAPE}]`), env, 'dots')
		const withBoth = withBackground(withGrid, env, '#ffffff').ast
		expect(layersOf(withBoth)).toEqual(['a', 'grid1', 'background1'])
		const other = withGridToggled(withBackground(root(`[${SHAPE}]`), env, '#ffffff').ast, env, 'dots')
		expect(layersOf(other)).toEqual(['a', 'grid1', 'background1'])
	})

	it('are drawn in the end, behind what is in front of them', () => {
		const ast = root(`[${SHAPE} g = (grid "dots") bg = (background "#ff0000")]`)
		const svg = svgOfRows(ast, env, allPaintedRows(ast, env))!
		const at = (text: string) => svg.indexOf(text)
		expect(at('fill="#ff0000"')).toBeGreaterThan(0)
		expect(at('fill="#ff0000"')).toBeLessThan(at('<pattern id="g"'))
		expect(at('<pattern id="g"')).toBeLessThan(at('<path id="a"'))
	})

	it('stay out of what is asked for by name', () => {
		const ast = root(`[${SHAPE} bg = (background "#ff0000")]`)
		expect(svgOfRows(ast, env, ['binding:a'])).not.toContain('#ff0000')
	})
})

describe('what is put around what is drawn', () => {
	const filter = (values: readonly unknown[], name: string) => filtersFor(values, env).find(it => it.name === name)!
	const held = `[a = ${P(1)} b = (path.rect [0 0] [2 2]) c = ${P(3)}]`

	it('is offered for what is held, as for anything', () => {
		const root = parse(held) as LetAST
		const rows = ['binding:a', 'binding:b'] as const
		const values = rows.map(row => valueOfRow(root, env, row))
		const one = filtersFor(values.slice(0, 1), env).map(({ name }) => name)
		const two = filtersFor(values, env).map(({ name }) => name)
		expect(one).toContain('path.offset')
		expect(two).toContain('path.unite')
	})

	it('stays where it is, around one', () => {
		const root = parse(held) as LetAST
		const value = valueOfRow(root, env, 'binding:b')
		const next = wrappedAt(root, env, 'binding:b', filter([value], 'path.offset'))
		expect(next).toBeInstanceOf(LetAST)
		expect(layersOf(next as LetAST)).toEqual(['a', 'b', 'c'])
		expect(print((next as LetAST).bindings[1]![1])).toContain('path.offset')
	})

	it('comes to one, where the frontmost of them was, and does not go on holding the rest', () => {
		const root = parse(held) as LetAST
		const rows = ['b', 'c']
		const values = rows.map(name => valueOfRow(root, env, `binding:${name}`))
		const given = rows.map(name => root.bindings.find(([bound]) => bound === name)![1])
		const next = combined(root, env, rows, given, filter(values, 'path.unite'))
		expect(next).not.toBeNull()
		expect(layersOf(next!)).toEqual(['a', 'b'])
		expect(sceneOf(next!, env)).toHaveLength(2)
	})
})
