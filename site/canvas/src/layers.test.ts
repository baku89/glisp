import { type AST, buildPrelude, check, evaluate, infer, LetAST, parse as expression, print, typeFits, type TypeValue } from '@glisp/lang'
import { combined, filtersFor, nameMadeBy, wrappedAt } from '@glisp/tweeq/filters'
import { layersOf, moveBinding, renameBindingAt, viewOf, withLayerAdded, withOpenRow } from '@glisp/tweeq/structure'
import { pastedRows, reach, withoutRows } from '@glisp/tweeq/rowsClipboard'
import { keptReferences } from '@glisp/tweeq/keptReferences'
import { bound, parse } from './program.testing'
import { describe, expect, it } from 'vitest'

import { withGraphics } from './graphics'
import { allPaintedRows, arranged, crumbsOf, grouped, ungrouped, withSolid, withGraphPaperToggled } from './rows'
import { svgOfRows } from './svg'
import { canIsolate, changed, diveAt, diveIntoRow, hasRow, gripAt, isGroupRow, isOutside, labelOfRow, paintAt, rowsListedIn, rowInGroup, rowsPaintedBy, rowsToTake, rowTakenAt, sceneOf, valueOfRow, paintedRow, withLayersFromOrder, withPaint, withPaintOfRows } from './scene'
import { bounds } from 'pave/path/metrics'
import type { Path } from './graphics'

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
		expect(drawn(`{a = ${P(1)} main = []}`)).toEqual([])
	})

	it('draws the same thing twice, if it is held twice', () => {
		expect(drawn(`[a = ${P(1)} b = ${P(2)} a]`)).toEqual(['element:2', 'b', 'a'])
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
		expect(after(`{r = 10 a = ${P(1)} b = ${P(2)}}`)).toBe(`{r = 10 main = [b = ${P(2)} a = ${P(1)}]}`)
	})

	it('has its groups come to hold what they did', () => {
		expect(after(`{g = {a = ${P(1)} n = 1}}`)).toBe(`{main = [g = {n = 1 [a = ${P(1)}]}]}`)
	})

	it('has a vector, even with nothing in it, and is left alone once it has one', () => {
		expect(after('{n = 1}')).toBe('{n = 1 main = []}')
		const now = `{n = 1 main = [a = ${P(1)}]}`
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
		expect(bound((next as LetAST)).map(([name]) => name)).toEqual(['c', 'a'])
	})

	it('follows a name, where it is held', () => {
		expect(order(renameBindingAt(root(ABC), env, 'binding:b', 'z'))).toEqual(['a', 'z', 'c'])
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

describe('a solid and a graph paper', () => {
	const root = (source: string) => parse(source) as LetAST
	const SHAPE = `a = ${P(1)}`

	it('come in at the back, the solid the furthest', () => {
		const withGraphPaper = withGraphPaperToggled(root(`[${SHAPE}]`), env, 'dots')
		const withBoth = withSolid(withGraphPaper, env, '#ffffff').ast
		expect(layersOf(withBoth)).toEqual(['a', 'graphPaper1', 'solid1'])
		const other = withGraphPaperToggled(withSolid(root(`[${SHAPE}]`), env, '#ffffff').ast, env, 'dots')
		expect(layersOf(other)).toEqual(['a', 'graphPaper1', 'solid1'])
	})

	it('are drawn in the end, in their place among the layers', () => {
		const ast = root(`[${SHAPE} g = (graphPaper "dots") bg = (solid "#ff0000")]`)
		const svg = svgOfRows(ast, env, allPaintedRows(ast, env))!
		const at = (text: string) => svg.indexOf(text)
		expect(at('fill="#ff0000"')).toBeGreaterThan(0)
		expect(at('fill="#ff0000"')).toBeLessThan(at('<pattern id="g"'))
		expect(at('<pattern id="g"')).toBeLessThan(at('<path id="a"'))
	})

	it('stay out of what is asked for by name', () => {
		const ast = root(`[${SHAPE} bg = (solid "#ff0000")]`)
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
		expect(print(bound((next as LetAST))[1]![1])).toContain('path.offset')
	})

	it('comes to one, where the frontmost of them was, and does not go on holding the rest', () => {
		const root = parse(held) as LetAST
		const rows = ['b', 'c']
		const values = rows.map(name => valueOfRow(root, env, `binding:${name}`))
		const given = rows.map(name => bound(root).find(([bound]) => bound === name)![1])
		const next = combined(root, env, rows, given, filter(values, 'path.unite'))
		expect(next).not.toBeNull()
		expect(layersOf(next!)).toEqual(['a', 'b'])
		expect(sceneOf(next!, env)).toHaveLength(2)
	})

	it('is called what makes it, each in it going on being called what it was', () => {
		const root = parse(held) as LetAST
		const rows = ['b', 'c']
		const values = rows.map(name => valueOfRow(root, env, `binding:${name}`))
		const given = rows.map(name => bound(root).find(([bound]) => bound === name)![1])
		const unite = filter(values, 'path.unite')
		expect(nameMadeBy(root, unite)).toBe('unite1')
		const next = combined(root, env, rows, given, unite, call => call, nameMadeBy(root, unite))!
		expect(layersOf(next)).toEqual(['a', 'unite1'])
		expect(print(next)).toMatch(/unite1 = \(path\.unite b = [\s\S]* c = /)
		expect(nameMadeBy(next, unite)).toBe('unite2')
	})

	it('has a path through what is named again follow it', () => {
		const root = parse('{c = (path.mirror c = (path.circle [0 0] 5) (line.fromPoints [0 0] [0 1])) d = (path.circle /c/c/center: 1)}')
		const next = renameBindingAt(root, env, 'binding:c', 'mirror1')!
		expect(print(next)).toContain('d = (path.circle /main/mirror1/c/center: 1)')
		expect(print(next)).toContain('mirror1 = (path.mirror c = ')
	})

	describe('of which one goes by a path to another', () => {
		const NGON = '(path.ngon [0 0] 100 3 @-30)'
		const on = (source: string) => {
			const root = parse(source) as LetAST
			return (...names: string[]) => {
				const rows = names.map(name => `binding:${name}`)
				const given = rows.map(row => reach(root, env, paintedRow(root, env, row))!.chain.at(-1)!.ast)
				const values = rows.map(row => valueOfRow(root, env, row))
				const by = (name: string) => filter(values, name)
				return (name: string) =>
					combined(root, env, names, given, by(name), call => withPaintOfRows(root, env, rows, call))
			}
		}
		const problems = (ast: AST) => evaluate(ast, env).diagnostics.map(({ message }) => message)
		const styled = `[
			ngon = (style ${NGON} fill: "#000000")
			dots = (style (path.unite (path.circle /ngon/path:/center: 10) (path.circle [/ngon/path:/radius: 0] 10)) fill: "#000000")
			other = (path.circle /dots/path:/a:/center: 1)
		]`

		it('goes on going there, whichever is the subject', () => {
			for (const [names, center] of [
				[['ngon', 'dots'], '/main/ngon/path:/ngon/center:'],
				[['dots', 'ngon'], '/main/dots/path:/ngon/center:'],
			] as const) {
				const next = on(styled)(...names)('path.subtract')
				expect(next).not.toBeNull()
				expect(print(next!)).toContain(`(path.circle ${center} 10)`)
				expect(problems(next!)).toEqual([])
			}
		})

		it('has what referred to one from elsewhere follow it', () => {
			const next = on(styled)('ngon', 'dots')('path.subtract')!
			expect(print(next)).toContain('other = (path.circle /main/ngon/path:/dots/a:/center: 1)')
			expect(problems(next)).toEqual([])
		})

		it('goes by the name it had, which it keeps in there', () => {
			const next = on(`[a = ${NGON} b = ${NGON} c = ${NGON} d = (path.circle /c/center: 1)]`)('a', 'b', 'c')('path.unite')!
			expect(print(next)).toContain('d = (path.circle /main/a/c/center: 1)')
			expect(problems(next)).toEqual([])
		})

		it('is nothing if a path climbs out of what is given', () => {
			const climbing = `[a = ${NGON} b = (path.circle ../a/center: 1)]`
			expect(on(climbing)('a', 'b')('path.subtract')).toBeNull()
		})
	})
})

describe('taking hold of what is drawn in a group', () => {
	const source = `[a = ${P(1)} g = [b = ${P(2)} h = [c = ${P(3)} e = ${P(5)}]]]`
	const root = parse(source)
	const [G, H, B, C, E] = [
		'binding:g',
		'binding:g/binding:h',
		'binding:g/binding:b',
		'binding:g/binding:h/binding:c',
		'binding:g/binding:h/binding:e',
	]
	const at = (row: string, selected: string[] = []) => rowTakenAt(root, env, row, selected)

	it('takes hold of the outermost group', () => {
		expect(at(C!)).toBe(G)
		expect(at(C!, [G!])).toBe(G)
		expect(at('binding:a', [C!])).toBe('binding:a')
	})

	it('stays in a group that has been gone into, as far as it has', () => {
		expect(at(C!, [B!])).toBe(H)
		expect(at(B!, [H!])).toBe(B)
		expect(at(C!, [E!])).toBe(C)
	})

	it('goes one row further in, by what is drawn there', () => {
		expect(rowInGroup(G!, C!)).toBe(H)
		expect(rowInGroup(H!, C!)).toBe(C)
	})

	it('moves all that is drawn in it, and it goes on being a group', () => {
		const rows = rowsPaintedBy(root, env, G!)
		const next = rows.reduce<AST>((program, row) => {
			const { move } = gripAt(root, env, row)!
			return changed(program, env, row, move!([10, 20])).ast!
		}, root)
		const places = (program: AST) =>
			Object.fromEntries(
				sceneOf(program, env).map(({ row, value }) => [row, bounds(value as Path)[0]])
			)
		const [before, after] = [places(root), places(next)]
		expect(after['binding:a']).toEqual(before['binding:a'])
		for (const row of rows) {
			expect(after[row]).toEqual([before[row]![0] + 10, before[row]![1] + 20])
		}
		expect(isGroupRow(next, env, G!)).toBe(true)
	})
})

describe('how a group is drawn', () => {
	const source = `{n = 1 [a = ${P(1)} g = [b = ${P(2)} h = [c = ${P(3)}] d = #_${P(4)} x = 1]]}`

	it('is how what is drawn in it is, however deep, hidden or not', () => {
		expect(rowsPaintedBy(parse(source), env, 'binding:g').sort()).toEqual([
			'binding:g/binding:b',
			'binding:g/binding:d',
			'binding:g/binding:h/binding:c',
		])
	})

	it('leaves a row that is not a group as it is', () => {
		expect(rowsPaintedBy(parse(source), env, 'binding:a')).toEqual(['binding:a'])
	})

	it('goes on being a group, once what is in it has a line', () => {
		const root = parse(source)
		const next = rowsPaintedBy(root, env, 'binding:g').reduce<AST>(
			(program, row) => withPaint(program, env, row, { stroke: '#000000' }),
			root
		)
		expect(isGroupRow(next, env, 'binding:g')).toBe(true)
		expect(paintAt(next, env, 'binding:g/binding:b')?.stroke).toBe('#000000')
	})
})

describe('going into something, as a double click does', () => {
	const source = `[a = ${P(1)} g = [b = ${P(2)} h = [c = ${P(3)}]] m = (style (path.offset (path.offset ${P(4)} 1) 2) fill: "#000000")]`
	const root = parse(source)
	const [G, H, B, C] = ['binding:g', 'binding:g/binding:h', 'binding:g/binding:b', 'binding:g/binding:h/binding:c']
	const M = 'binding:m/arg0'

	it('isolates a group, by what is drawn there, and so on further in', () => {
		expect(diveAt(root, env, G!, B!, [])).toEqual({ rows: [B], isolated: G })
		expect(diveAt(root, env, G!, C!, [])).toEqual({ rows: [H], isolated: G })
		expect(diveAt(root, env, H!, C!, [])).toEqual({ rows: [C], isolated: H })
	})

	it('isolates what a path is made from, past its style, and so on further in', () => {
		expect(diveAt(root, env, 'binding:m', undefined, [])).toEqual({ rows: [`${M}/arg0`], isolated: M })
		expect(diveAt(root, env, `${M}/arg0`, undefined, [])).toEqual({ rows: [`${M}/arg0/arg0`], isolated: `${M}/arg0` })
	})

	it('has nothing to go into in a path made from nothing', () => {
		expect(diveAt(root, env, B!, B!, [])).toBeNull()
		expect(canIsolate(root, env, B!)).toBe(false)
		expect(canIsolate(root, env, G!)).toBe(true)
		expect(canIsolate(root, env, M)).toBe(true)
	})

	it('takes what is in it, no further out and no further in than the next', () => {
		expect(rowTakenAt(root, env, C!, [], G!)).toBe(H)
		expect(rowTakenAt(root, env, B!, [], G!)).toBe(B)
		expect(rowTakenAt(root, env, C!, [], H!)).toBe(C)
	})

	it('has what is outside of it be so, and not what it is part of', () => {
		expect(isOutside('binding:a', [G!])).toBe(true)
		expect(isOutside(B!, [G!])).toBe(false)
		expect(isOutside(B!, [G!, H!])).toBe(true)
		expect(isOutside('binding:m', [M])).toBe(false)
		expect(isOutside('binding:a', [])).toBe(false)
	})

	it('selects all of it, from where it is', () => {
		expect(rowsToTake(root, env, null).sort()).toEqual(['binding:a', G, 'binding:m'].sort())
		expect(rowsToTake(root, env, G!).sort()).toEqual([B, H].sort())
		expect(rowsToTake(root, env, M)).toEqual([`${M}/arg0`])
	})
})

describe('a vector of what is drawn, with no names, as a spray comes to', () => {
	const circle = (x: number) => `(style (path.d "M ${x + 1} 0 A 1 1 0 0 1 ${x - 1} 0 A 1 1 0 0 1 ${x + 1} 0 Z") fill: "#000000")`
	const source = `[o = ${P(100)} s = [${circle(0)} ${circle(10)} ${circle(20)}] n = [1 2] v = [[1 2] [3 4]]]`
	const root = parse(source)
	const [S, FIRST] = ['binding:s', 'binding:s/0']

	it('has each be a row of its own, the first in front', () => {
		expect(sceneOf(root, env).map(({ row }) => row).filter(row => row.startsWith(S))).toEqual([
			'binding:s/2',
			'binding:s/1',
			FIRST,
		])
	})

	it('leaves numbers and places as what they are', () => {
		expect(canIsolate(root, env, 'binding:n')).toBe(false)
		expect(canIsolate(root, env, 'binding:v')).toBe(false)
		expect(rowsPaintedBy(root, env, 'binding:v')).toEqual(['binding:v'])
	})

	it('is gone into, and taken hold of, as a group is', () => {
		expect(rowTakenAt(root, env, FIRST, [])).toBe(S)
		expect(diveAt(root, env, S, FIRST, [])).toEqual({ rows: [FIRST], isolated: S })
		expect(rowTakenAt(root, env, FIRST, [], S)).toBe(FIRST)
		expect(rowsToTake(root, env, S)).toHaveLength(3)
	})

	it('moves as one', () => {
		const rows = rowsPaintedBy(root, env, S)
		expect(rows).toHaveLength(3)
		const next = rows.reduce<AST>((program, row) => {
			const { move } = gripAt(root, env, row)!
			expect(move).toBeDefined()
			return changed(program, env, row, move!([10, 20])).ast!
		}, root)
		const places = (program: AST) =>
			Object.fromEntries(sceneOf(program, env).map(({ row, value }) => [row, bounds(value as Path)[0]]))
		const [before, after] = [places(root), places(next)]
		for (const row of rows) {
			expect(after[row]![0]).toBeCloseTo(before[row]![0] + 10)
			expect(after[row]![1]).toBeCloseTo(before[row]![1] + 20)
		}
		expect(after['binding:o']).toEqual(before['binding:o'])
	})

	it('is let go of as a group is, each going where it was held', () => {
		const result = ungrouped(root as LetAST, env, [S])!
		expect(result.rows).toEqual(['element:1', 'element:2', 'element:3'])
		expect(sceneOf(result.ast, env).map(({ row }) => row).filter(row => row.startsWith('element:'))).toEqual([
			'element:3',
			'element:2',
			'element:1',
		])
	})

	it('is left as it is, if it is not held, so that nothing goes', () => {
		const unheld = parse(`{s = [${circle(0)} ${circle(10)}] [o = ${P(1)}]}`) as LetAST
		expect(ungrouped(unheld, env, [S])).toBeNull()
	})

	it('is left as it is, if something still refers to it', () => {
		const used = parse(`[s = [${circle(0)} ${circle(10)}] t = s]`) as LetAST
		const result = ungrouped(used, env, [S])
		expect(result).toBeNull()
	})
})

describe('going into what goes by a name', () => {
	const C = '(path.circle [0 0] 10)'
	const root = parse(`{r = (path.offset ${C} 1) [m = (style r fill: "#000000") n = r o = (path.offset r 2) p = ${P(9)}]}`)
	const [R, M, N, O] = ['binding:r', 'binding:m', 'binding:n', 'binding:o']

	it('goes to where it is written, past a style', () => {
		expect(canIsolate(root, env, M!)).toBe(true)
		expect(diveAt(root, env, M!, undefined, [])).toEqual({ rows: [`${R}/arg0`], isolated: R })
	})

	it('goes the same way from a row that is only the name', () => {
		expect(diveAt(root, env, N!, undefined, [])).toEqual({ rows: [`${R}/arg0`], isolated: R })
	})

	it('goes on through a name it comes to, once it is in', () => {
		expect(diveAt(root, env, O!, undefined, [])).toEqual({ rows: [`${O}/arg0`], isolated: O })
		expect(diveAt(root, env, `${O}/arg0`, undefined, [])).toEqual({ rows: [`${R}/arg0`], isolated: R })
	})

	it('keeps what it went through in sight, and not what merely uses it too', () => {
		expect(isOutside(M!, [M!, R!])).toBe(false)
		expect(isOutside(N!, [M!, R!])).toBe(true)
		expect(isOutside('binding:p', [M!, R!])).toBe(true)
	})

	it('has nothing to go into in what is made from nothing, however it is named', () => {
		const plain = parse(`{r = ${C} [m = (style r fill: "#000000")]}`)
		expect(canIsolate(plain, env, 'binding:m')).toBe(false)
	})
})

describe('what is listed in a row that is not a group', () => {
	const root = parse(`{r = ${P(0)} [
		u = (style (path.unite ${P(1)} ${P(2)} ${P(3)}) fill: "#000000")
		h = (path.convexHull ${P(4)})
		n = (path.offset (path.offset ${P(5)} 1) 2)
		o = (path.offset r 2)
		c = (style r fill: "#000000")
		p = ${P(6)}
		s = [(style ${P(7)} fill: "#000000") ${P(8)}]
		v = [1 2]
	]}`)
	const listed = (row: string) => rowsListedIn(root, env, `binding:${row}`).map(it => it.replace(`binding:${row}/`, ''))

	it('is what it is made from, past its style, all of it', () => {
		expect(listed('u')).toEqual(['arg0/arg0', 'arg0/arg1', 'arg0/arg2'])
		expect(listed('h')).toEqual(['arg0'])
	})

	it('goes one at a time', () => {
		expect(listed('n')).toEqual(['arg0'])
		expect(rowsListedIn(root, env, 'binding:n/arg0')).toEqual(['binding:n/arg0/arg0'])
	})

	it('is the name, where it is only that, and what it is written as only where that is', () => {
		expect(listed('o')).toEqual(['arg0'])
		expect(rowsListedIn(root, env, 'binding:o/arg0')).toEqual([])
		expect(listed('c')).toEqual([])
	})

	it('is nothing in a path made from nothing, or what is not drawn', () => {
		expect(listed('p')).toEqual([])
		expect(listed('v')).toEqual([])
	})

	it('is what a vector holds, each being drawn', () => {
		expect(listed('s')).toEqual(['0', '1'])
	})

	it('is called what makes it, past its style, or what it refers to', () => {
		expect(labelOfRow(root, env, 'binding:u/arg0/arg0')).toBe('Circle')
		expect(labelOfRow(root, env, 'binding:s/0')).toBe('Circle')
		expect(labelOfRow(root, env, 'binding:n/arg0')).toBe('Offset')
		expect(labelOfRow(root, env, 'binding:o/arg0')).toBe('r')
	})

	it('is what is on an artboard, each where it is written, and the artboard is called so', () => {
		const boards = parse(`[
			b = (artboard (rect [0 0] [10 10]) [a = ${P(1)} c = [d = ${P(2)}]] fill: "#ffffff")
			t = [(artboard (rect [0 0] [10 10]) [])]
		]`)
		expect(rowsListedIn(boards, env, 'binding:b')).toEqual(['binding:b/arg1/binding:a', 'binding:b/arg1/binding:c'])
		expect(rowsListedIn(boards, env, 'binding:b/arg1/binding:c')).toEqual(['binding:b/arg1/binding:c/binding:d'])
		expect(labelOfRow(boards, env, 'binding:t/0')).toBe('Artboard')
	})
})

describe('a sketch', () => {
	const Sketch = evaluate(expression('Sketch'), env).value as TypeValue
	const fits = (source: string) => typeFits(infer(expression(source), env)!, Sketch)

	it('is a vector of what is drawn, of sketches among them, however deep', () => {
		expect(fits('[]')).toBe(true)
		expect(fits(`[${P(1)} (style ${P(2)} fill: "#000000") [1 2] (artboard (rect [0 0] [1 1]) [])]`)).toBe(true)
		expect(fits(`[[${P(1)} [${P(2)}]]]`)).toBe(true)
	})

	it('is not a vector of anything else', () => {
		expect(fits('[1 2]')).toBe(false)
		expect(fits(`[${P(1)} "a"]`)).toBe(false)
	})

	it('is what an artboard holds', () => {
		expect(check(expression(`(artboard (rect [0 0] [1 1]) [${P(1)}])`), env)).toEqual([])
		expect(check(expression('(artboard (rect [0 0] [1 1]) ["a"])'), env)).not.toEqual([])
	})
})

describe('the levels gone into', () => {
	const root = parse(`{r = (path.offset ${P(0)} 1) [
		g = [h = [a = ${P(1)}]]
		n = (style (path.offset (path.offset ${P(2)} 1) 2) fill: "#000000")
		m = (style r fill: "#000000")
		o = (path.offset r 2)
	]}`)
	const crumbs = (gone: string[]) => crumbsOf(root, env, gone).map(({ label }) => label)

	it('is nothing, having gone into nothing', () => {
		expect(crumbs([])).toEqual([])
	})

	it('goes by the names of groups', () => {
		expect(crumbs(['binding:g', 'binding:g/binding:h'])).toEqual(['g', 'h'])
	})

	it('has a row and what it is styled be one level', () => {
		expect(crumbs(['binding:n', 'binding:n/arg0'])).toEqual(['n'])
		expect(crumbs(['binding:n', 'binding:n/arg0', 'binding:n/arg0/arg0'])).toEqual(['n', 'Offset'])
	})

	it('has a row and what it refers to be one level', () => {
		expect(crumbs(['binding:m', 'binding:r'])).toEqual(['m'])
		expect(crumbs(['binding:o', 'binding:o/arg0', 'binding:r'])).toEqual(['o', 'r'])
	})

	it('goes back to all that it had gone through', () => {
		const [first] = crumbsOf(root, env, ['binding:n', 'binding:n/arg0', 'binding:n/arg0/arg0'])
		expect(first!.through).toEqual(['binding:n', 'binding:n/arg0'])
	})
})

describe('grouping inside of a group', () => {
	const [X, Y, Z] = [P(1), P(2), P(3)]
	const root = parse(`[o = [g = [a = ${X} b = ${Y}] d = ${Z}] c = ${P(4)}]`) as LetAST

	it('lets go of a group where it is', () => {
		const result = ungrouped(root, env, ['binding:o/binding:g'])!
		expect(print(result.ast)).toBe(`{main = [o = [a = ${X} b = ${Y} d = ${Z}] c = ${P(4)}]}`)
		expect(result.rows).toEqual(['binding:o/binding:a', 'binding:o/binding:b'])
	})

	it('groups where they are', () => {
		const result = grouped(root, env, ['binding:o/binding:g', 'binding:o/binding:d'])!
		expect(result.row).toBe('binding:o/binding:group1')
		expect(print(result.ast)).toBe(`{main = [o = [group1 = [g = [a = ${X} b = ${Y}] d = ${Z}]] c = ${P(4)}]}`)
	})

	it('does not group across blocks', () => {
		expect(grouped(root, env, ['binding:o/binding:d', 'binding:c'])).toBeNull()
	})

	it('lets go of one in each of two blocks, at once', () => {
		const two = parse(`[o = [g = [a = ${X}]] h = [b = ${Y}]]`) as LetAST
		const result = ungrouped(two, env, ['binding:o/binding:g', 'binding:h'])!
		expect(print(result.ast)).toBe(`{main = [o = [a = ${X}] b = ${Y}]}`)
	})
})

describe('what is taken away, that something was drawn by', () => {
	it('leaves that drawn where it was, at what it came to', () => {
		const before = parse('[r = (path.rect [0 0] [100 40]) c = (path.circle [(lerp /main/r/origin:/0 (+ /main/r/origin:/0 /main/r/size:/0) 0.2) /main/r/origin:/1] 10)]')
		const { ast, rows } = keptReferences(before, withoutRows(before, env, ['binding:r']), env)
		expect(print(ast)).toBe('{main = [c = (path.circle [20 0] 10)]}')
		expect(rows).toEqual(['binding:c/arg0'])
	})
})

describe('rows that are open', () => {
	const SOURCE =
		'{main = [a = (path.circle [0 0] 10) g = {b = (path.rect [0 0] [5 5]) [b]} m = ^mat2d [1 0 0 1 0 0] t = (path.transform (path.circle [0 0] 3) (mat2d.trs [5 0]))]}'
	const ROWS = ['binding:a', 'binding:a/arg0', 'binding:g', 'binding:g/binding:b', 'binding:m', 'binding:m/arg0', 'binding:t', 'binding:t/arg1']
	const opened = (root: AST, path: string): AST => {
		const chain = reach(root, env, path)!.chain
		let next = chain.at(-1)!.replace(withOpenRow(chain.at(-1)!.ast, true))
		for (let i = chain.length - 2; i >= 0; i--) next = chain[i]!.replace(next)
		return next
	}

	it('are drawn, listed and held as they were, all of them open', () => {
		const root = parse(SOURCE)
		const open = ROWS.reduce(opened, root)
		const drawn = (ast: AST) => sceneOf(ast, env).map(({ row, draw }) => `${row}:${draw}`)
		expect(print(open)).toContain('a = ^{open: true} (path.circle ^{open: true} [0 0] 10)')
		expect(drawn(open)).toEqual(drawn(root))
		expect(layersOf(open as LetAST)).toEqual(layersOf(root as LetAST))
		for (const row of ROWS) expect(reach(open, env, row), row).not.toBeNull()
		const handles = (ast: AST) => gripAt(ast, env, 'binding:t')!.handles.map(({ kind, at }) => [kind, at])
		expect(handles(open)).toEqual(handles(root))
	})
})

describe('a double click on a row in a list', () => {
	const root = parse(
		'{main = [r = (path.rect [0 0] [10 10]) g = {a = (path.circle [0 0] 5) [a]} t = (path.transform (path.circle [0 0] 3) (mat2d.trs [5 0]))]}'
	)
	const dive = (row: string, isolation: readonly string[] = []) => diveIntoRow(root, env, row, isolation, [])

	it('goes into what a row is made of, as on what it draws', () => {
		expect(dive('binding:t')).toEqual({ rows: ['binding:t/arg0'], isolation: ['binding:t'] })
	})

	it('goes into the row itself, where it has no inside, as a point it is given', () => {
		expect(dive('binding:r')).toEqual({ rows: ['binding:r'], isolation: ['binding:r'] })
		expect(dive('binding:r/arg0', ['binding:r'])).toEqual({ rows: ['binding:r/arg0'], isolation: ['binding:r', 'binding:r/arg0'] })
	})

	it('stays in a part it went into while that is there, as a point given to a rect', () => {
		expect(canIsolate(root, env, 'binding:r/arg0')).toBe(false)
		expect(hasRow(root, env, 'binding:r/arg0')).toBe(true)
		expect(hasRow(root, env, 'binding:r/arg9')).toBe(false)
	})

	it('is called what the inspector calls it, for a part of something', () => {
		expect(crumbsOf(root, env, ['binding:r/arg0']).map(({ label }) => label)).toEqual(['Origin'])
	})

	it('goes nowhere it is already, or that is not there', () => {
		expect(dive('binding:r', ['binding:r'])).toBeNull()
		expect(dive('binding:nothing')).toBeNull()
	})
})
