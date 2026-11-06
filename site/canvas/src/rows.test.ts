import { buildPrelude, type Env, evaluate, type LetAST, print } from '@glisp/lang'
import { parse } from './program.testing'
import { describe, expect, it } from 'vitest'

import { withGraphics } from './graphics'
import {
	arranged,
	boundsOfRows,
	drawnRows,
	grouped,
	nameOfRow,
	pickedRows,
	rowCalled,
	rowsAbout,
	ungrouped,
	withSolid,
	viewBetween,
	viewToFit,
	withFileDropped,
} from './rows'
import { layersOf } from '@glisp/tweeq/structure'
import { sceneOf } from './scene'

const env: Env = withGraphics(buildPrelude())
const program = '[a = 1 b = 2 c = 3 d = 4]'
const order = (how: 'forward' | 'backward' | 'front' | 'back', ...names: string[]) =>
	layersOf(arranged(parse(program) as LetAST, names.map(n => `binding:${n}`), how)).join('')

describe('arranged', () => {
	it('goes one step, forward being toward the first', () => {
		expect(order('forward', 'b')).toBe('bacd')
		expect(order('backward', 'c')).toBe('abdc')
	})

	it('stays at the end', () => {
		expect(order('forward', 'a')).toBe('abcd')
		expect(order('backward', 'd')).toBe('abcd')
	})

	it('goes together, in the order they were', () => {
		expect(order('forward', 'c', 'd')).toBe('acdb')
		expect(order('backward', 'a', 'b')).toBe('cabd')
		expect(order('forward', 'b', 'd')).toBe('badc')
	})

	it('goes all the way', () => {
		expect(order('front', 'b', 'd')).toBe('bdac')
		expect(order('back', 'a', 'c')).toBe('bdac')
	})
})

describe('grouped', () => {
	it('has them in one, where the last of them was', () => {
		const result = grouped(parse(program) as LetAST, env, ['binding:a', 'binding:c'])!
		expect(print(result.ast)).toBe('{artboard = [group1 = [a = 1 c = 3] b = 2 d = 4]}')
		expect(result.row).toBe('binding:group1')
	})

	it('still draws them', () => {
		const root = parse('{a = (path.circle [0 0] 1) b = (path.circle [1 1] 1)}') as LetAST
		const { ast } = grouped(root, env, ['binding:a', 'binding:b'])!
		expect(drawnRows(ast, env)).toEqual(['binding:group1/binding:a', 'binding:group1/binding:b'])
	})

	it('keeps a name working, in and out', () => {
		const root = parse('{r = 5 a = (path.circle [0 0] r)}') as LetAST
		expect(grouped(root, env, ['binding:a'])).not.toBeNull()
	})

	it('has a path go on reaching what it did, however many levels away it is now', () => {
		const root = parse('{a = (path.circle [0 0] 1) b = (path.rect ../a/center: [1 1])}') as LetAST
		const { ast } = grouped(root, env, ['binding:b'])!
		expect(print(ast)).toBe('{artboard = [group1 = [b = (path.rect ../../a/center: [1 1])] a = (path.circle [0 0] 1)]}')
		expect(evaluate(ast, env).diagnostics).toEqual([])
	})

	it('is nothing, with nothing to group', () => {
		expect(grouped(parse(program) as LetAST, env, [])).toBeNull()
	})
})

describe('ungrouped', () => {
	it('lets them go, where it was', () => {
		const result = ungrouped(parse('{b = 2 artboard = [g = [a = 1 c = 3] d = 4]}') as LetAST, env, ['binding:g'])!
		expect(print(result.ast)).toBe('{b = 2 artboard = [a = 1 c = 3 d = 4]}')
		expect(result.rows).toEqual(['binding:a', 'binding:c'])
	})

	it('is nothing, for what is not a group', () => {
		expect(ungrouped(parse('{a = 1 g = {x = 1 x}}') as LetAST, env, ['binding:a', 'binding:g'])).toBeNull()
	})

	it('leaves a group whose names are taken', () => {
		expect(ungrouped(parse('{a = 9 g = {a = 1}}') as LetAST, env, ['binding:g'])).toBeNull()
	})
})

describe('ungrouped, of what a path is made from', () => {
	const of = (src: string, row = 'binding:c') => ungrouped(parse(src) as LetAST, env, [row])
	const R = '(path.rect [0 0] [10 10])'
	const C = '(path.circle [50 50] 5)'

	it('leaves what is made from one path as that path, by the same name', () => {
		const result = of(`[c = (path.offset ${R} 5)]`)!
		expect(print(result.ast)).toBe(`{artboard = [c = ${R}]}`)
		expect(result.rows).toEqual(['binding:c'])
	})

	it('takes off only the one', () => {
		expect(print(of(`[c = (path.roundCorners (path.offset ${R} 5) 3)]`)!.ast)).toBe(`{artboard = [c = (path.offset ${R} 5)]}`)
	})

	it('has what it was made by and what it was drawn by go on', () => {
		expect(print(of(`[c = (style (path.offset ${R} 5) fill: "#ff0000")]`)!.ast)).toBe(`{artboard = [c = (style ${R} fill: "#ff0000")]}`)
	})

	it('lets all of what is united go, where it was, each by what it is', () => {
		const result = of(`[b = (path.circle [9 9] 1) c = (path.unite ${R} ${C}) d = (path.circle [8 8] 1)]`)!
		expect(print(result.ast)).toBe(`{artboard = [b = (path.circle [9 9] 1) rect1 = ${R} circle1 = ${C} d = (path.circle [8 8] 1)]}`)
		expect(result.rows).toEqual(['binding:rect1', 'binding:circle1'])
	})

	it('has each of them drawn by what the whole was', () => {
		expect(print(of(`[c = (style (path.subtract ${R} ${C}) fill: "#ff0000")]`)!.ast)).toBe(
			`{artboard = [rect1 = (style ${R} fill: "#ff0000") circle1 = (style ${C} fill: "#ff0000")]}`
		)
	})

	it('goes for a style that is around what is in it, as that had nothing to say', () => {
		expect(print(of(`[c = (style (path.offset (style ${R} fill: "#00ff00") 5) fill: "#ff0000")]`)!.ast)).toBe(
			`{artboard = [c = (style ${R} fill: "#ff0000")]}`
		)
	})

	it('draws a row that was only referred to, and makes nothing new of it', () => {
		const result = of(`{a = ${R} b = ${C} c = (path.unite a b) [c]}`)!
		expect(print(result.ast)).toBe(`{artboard = [a = ${R} b = ${C}]}`)
		expect(result.rows).toEqual(['binding:a', 'binding:b'])
	})

	it('does not draw twice what is being drawn already', () => {
		expect(print(of(`{a = ${R} b = ${C} c = (path.unite a b) [a c]}`)!.ast)).toBe(`{artboard = [a = ${R} b = ${C}]}`)
	})

	it('takes what is referred to of one, to be what it was made from', () => {
		expect(print(of(`{a = ${R} c = (path.offset a 5) [c]}`)!.ast)).toBe(`{a = ${R} artboard = [c = a]}`)
	})

	it('goes for what has no name', () => {
		expect(print(of(`{k = 1 [(path.unite ${R} ${C})]}`, 'element:0')!.ast)).toBe(`{k = 1 artboard = [${R} ${C}]}`)
	})

	it('leaves what several refer to by a name that would be gone', () => {
		expect(of(`[c = (path.unite ${R} ${C}) d = (path.offset c 5)]`)).toBeNull()
	})

	it('is nothing, for what is made from no path', () => {
		expect(of(`[c = ${R}]`)).toBeNull()
		expect(of(`[c = (style ${R} fill: "#ff0000")]`)).toBeNull()
		expect(of('[c = (+ 1 2)]')).toBeNull()
		expect(of(`[c = (path.bounds ${R})]`)).toBeNull()
	})
})

describe('fitting', () => {
	const root = parse('{a = (path.rect [0 0] [10 10]) b = (path.rect [90 40] [10 10])}')

	it('goes around what is drawn, or what is asked', () => {
		expect(boundsOfRows(root, env)).toEqual([[0, 0], [100, 50]])
		expect(boundsOfRows(root, env, ['binding:b'])).toEqual([[90, 40], [100, 50]])
		expect(boundsOfRows(parse('{a = 1}'), env)).toBeNull()
	})

	it('is as large as it can be, in the middle of what is free', () => {
		expect(viewToFit([[0, 0], [100, 50]], [100, 0, 300, 400])).toEqual([2, 0, 0, 2, 100, 150])
	})

	it('does not go in forever', () => {
		const [zoom] = viewToFit([[0, 0], [0, 0]], [0, 0, 100, 100])
		expect(zoom).toBe(8)
	})
})

describe('the view between two', () => {
	const from = [1, 0, 0, 1, 0, 0] as const
	const to = [4, 0, 0, 4, 90, -30] as const

	it('starts at one and ends at the other', () => {
		expect(viewBetween(from, to, 0)).toEqual(from)
		expect(viewBetween(from, to, 1)).toEqual(to)
	})

	it('goes in by ratio', () => {
		expect(viewBetween(from, to, 0.5)[0]).toBeCloseTo(2)
	})

	it('has what is on screen go straight', () => {
		// At a zoom of 2, a third of the way from 1 to 4, and so a third of the way across.
		const [, , , , x, y] = viewBetween(from, to, 0.5)
		expect(x).toBeCloseTo(30)
		expect(y).toBeCloseTo(-10)
	})

	it('only moves, when how far in stays', () => {
		expect(viewBetween([2, 0, 0, 2, 0, 0], [2, 0, 0, 2, 10, 20], 0.5)).toEqual([2, 0, 0, 2, 5, 10])
	})
})

describe('the name of a row', () => {
	it('is there for a binding, however deep', () => {
		expect(nameOfRow('binding:c')).toBe('c')
		expect(nameOfRow('binding:g/binding:c')).toBe('c')
	})

	it('is not there for what is not a binding', () => {
		expect(nameOfRow('binding:c/arg:0')).toBe(null)
	})

	it('changes only the last part of the row', () => {
		expect(rowCalled('binding:g/binding:c', 'd')).toBe('binding:g/binding:d')
	})
})

describe('picking rows', () => {
	const env: Env = withGraphics(buildPrelude())
	const root = parse('{a = 1 b = 2 c = 3 d = 4 g = {x = 1 y = 2 z = 3}}')
	const [a, b, c, d] = ['binding:a', 'binding:b', 'binding:c', 'binding:d']
	const picked = (selected: readonly string[], row: string, how: 'only' | 'toggle' | 'range') =>
		pickedRows(root, env, selected, row, how)

	it('picks one alone, even of several', () => {
		expect(picked([a, b], b, 'only')).toEqual([b])
	})

	it('adds one, or leaves it out', () => {
		expect(picked([a], c, 'toggle')).toEqual([a, c])
		expect(picked([a, c], a, 'toggle')).toEqual([c])
		expect(picked([a], a, 'toggle')).toEqual([])
	})

	it('goes from the last one to this, either way, along with what is selected', () => {
		expect(picked([a], c, 'range')).toEqual([a, b, c])
		expect(picked([d], b, 'range')).toEqual([d, c, b])
		expect(new Set(picked([d, a], c, 'range'))).toEqual(new Set([d, a, b, c]))
	})

	it('goes along what is beside it, inside of a group too', () => {
		expect(picked(['binding:g/binding:x'], 'binding:g/binding:z', 'range')).toEqual([
			'binding:g/binding:x',
			'binding:g/binding:y',
			'binding:g/binding:z',
		])
	})

	it('has nothing between what is not side by side, or with nothing selected', () => {
		expect(picked([a], 'binding:g/binding:x', 'range')).toEqual([a, 'binding:g/binding:x'])
		expect(picked([], c, 'range')).toEqual([c])
	})
})

describe('rowsAbout', () => {
	const part = 'binding:l/arg0'
	it('is the row kept hold of, while only parts of it are selected', () => {
		expect(rowsAbout([part, 'binding:l/arg1'], 'binding:l')).toEqual(['binding:l'])
	})
	it('is what is selected, otherwise', () => {
		const other = [part, 'binding:m/arg0']
		expect(rowsAbout(other, 'binding:l')).toBe(other)
		expect(rowsAbout(['binding:l'], 'binding:l')).toEqual(['binding:l'])
		expect(rowsAbout(['binding:line/arg0'], 'binding:l')).toEqual(['binding:line/arg0'])
		expect(rowsAbout([part], null)).toEqual([part])
		expect(rowsAbout([], 'binding:l')).toEqual([])
	})
})

describe('grouping what is referred to from the root', () => {
	const program = '{artboard = [a = [1 2] b = [[/artboard/a/1]] c = 0]}'

	it('has it go on reaching it, in the group and out of it again', () => {
		const { ast } = grouped(parse(program) as LetAST, env, ['binding:a'])!
		expect(print(ast)).toBe('{artboard = [group1 = [a = [1 2]] b = [[/artboard/group1/a/1]] c = 0]}')
		const out = ungrouped(ast, env, ['binding:group1'])!
		expect(print(out.ast)).toBe(program)
	})
})

describe('withSolid', () => {
	const given = (src: string) => {
		const { ast, row } = withSolid(parse(src) as LetAST, env, '#ffffff')
		return { source: print(ast), row }
	}

	it('adds a row at the top, if nothing says it', () => {
		expect(given('{c = 1}')).toEqual({
			source: '{c = 1 artboard = [solid1 = (solid "#ffffff")]}',
			row: 'binding:solid1',
		})
	})

	it('leaves what says it as it is, to be chosen from', () => {
		const src = '{bg = (solid "#ff0000") c = 1}'
		expect(given(src)).toEqual({ source: '{c = 1 artboard = [bg = (solid "#ff0000")]}', row: 'binding:bg' })
	})

	it('brings it out of being hidden', () => {
		expect(given('{bg = #_(solid "#ff0000")}').source).toBe('{artboard = [bg = (solid "#ff0000")]}')
	})
})

describe('a file dropped on the canvas', () => {
	const program = (src: string) => parse(src) as LetAST
	const ROOT = program('{radius = 5 [c = (path.circle [0 0] radius)]}')
	const middleOf = (root: LetAST, row: string): number[] => {
		const [[left, top], [right, bottom]] = boundsOfRows(root, env, [row])!
		return [(left + right) / 2, (top + bottom) / 2]
	}

	it('is one row in front of all else, with its middle where it was dropped', () => {
		const file = program('{[a = (path.rect [0 0] [10 20])]}')
		const { ast, row } = withFileDropped(ROOT, env, file, 'box.svg', [100, 200])!
		expect(row).toBe('binding:box1')
		expect(layersOf(ast)[0]).toBe('box1')
		expect(middleOf(ast, row)).toEqual([100, 200])
	})

	it('keeps several things together, and their names to themselves', () => {
		const file = program('{radius = 50 [c = (path.circle [0 0] radius) d = (path.rect [0 0] [1 1])]}')
		const { ast, row } = withFileDropped(ROOT, env, file, 'other.glisp.svg', [300, 300])!
		expect(layersOf(ast)).toEqual(['other1', 'c'])
		const [[left], [right]] = boundsOfRows(ast, env, ['binding:c'])!
		expect(right - left).toBeCloseTo(10)
		const [[l], [r]] = boundsOfRows(ast, env, [`${row}/binding:c`])!
		expect(r - l).toBeCloseTo(100)
		const [x, y] = middleOf(ast, row)
		expect(x).toBeCloseTo(300)
		expect(y).toBeCloseTo(300)
	})

	it('leaves behind what goes on and on', () => {
		const file = program('{[a = (path.rect [0 0] [10 20]) graphPaper1 = (graphPaper "dots") axes1 = (axes) solid1 = (solid "#fff")]}')
		const { ast, row } = withFileDropped(ROOT, env, file, 'a.svg', [0, 0])!
		expect(sceneOf(ast, env).filter(({ draw }) => draw === 'solid')).toEqual([])
		expect(print(ast)).toContain(row.replace('binding:', ''))
		expect(print(ast)).not.toContain('graphPaper')
	})

	it('has nothing to add where nothing is drawn', () => {
		expect(withFileDropped(ROOT, env, program('{[solid1 = (solid "#fff")]}'), 'a.svg', [0, 0])).toBeNull()
	})

	it('is called by the file, as far as it can be', () => {
		const file = program('{[a = (path.rect [0 0] [10 20])]}')
		const named = (name: string) => withFileDropped(ROOT, env, file, name, [0, 0])!.row
		expect(named('dataset_linked_24dp_1F1F1F_FILL0_wght400_GRAD0_opsz24.svg')).toBe('binding:dataset_linked1')
		expect(named('My Logo (2).svg')).toBe('binding:My_Logo_21')
		expect(named('123.svg')).toBe('binding:drawing1')
	})
})
