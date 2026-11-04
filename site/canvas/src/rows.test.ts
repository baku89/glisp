import { buildPrelude, type Env, type LetAST, parse, print } from '@glisp/lang'
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
	viewBetween,
	viewToFit,
} from './rows'

const env: Env = withGraphics(buildPrelude())
const program = '{a = 1 b = 2 c = 3 d = 4}'
const order = (how: 'forward' | 'backward' | 'front' | 'back', ...names: string[]) =>
	arranged(parse(program) as LetAST, names.map(n => `binding:${n}`), how)
		.bindings.map(([name]) => name)
		.join('')

describe('arranged', () => {
	it('goes one step', () => {
		expect(order('forward', 'b')).toBe('acbd')
		expect(order('backward', 'c')).toBe('acbd')
	})

	it('stays at the end', () => {
		expect(order('forward', 'd')).toBe('abcd')
		expect(order('backward', 'a')).toBe('abcd')
	})

	it('goes together, in the order they were', () => {
		expect(order('forward', 'a', 'b')).toBe('cabd')
		expect(order('backward', 'c', 'd')).toBe('acdb')
		expect(order('forward', 'a', 'c')).toBe('badc')
	})

	it('goes all the way', () => {
		expect(order('front', 'a', 'c')).toBe('bdac')
		expect(order('back', 'b', 'd')).toBe('bdac')
	})
})

describe('grouped', () => {
	it('has them in one, where the last of them was', () => {
		const result = grouped(parse(program) as LetAST, env, ['binding:a', 'binding:c'])!
		expect(print(result.ast)).toBe('{b = 2 group1 = {a = 1 c = 3} d = 4}')
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

	it('refuses what a path would no longer reach', () => {
		const root = parse('{a = (path.circle [0 0] 1) b = (path.rect ../a/center [1 1])}') as LetAST
		expect(grouped(root, env, ['binding:b'])).toBeNull()
	})

	it('is nothing, with nothing to group', () => {
		expect(grouped(parse(program) as LetAST, env, [])).toBeNull()
	})
})

describe('ungrouped', () => {
	it('lets them go, where it was', () => {
		const result = ungrouped(parse('{b = 2 g = {a = 1 c = 3} d = 4}') as LetAST, env, ['binding:g'])!
		expect(print(result.ast)).toBe('{b = 2 a = 1 c = 3 d = 4}')
		expect(result.rows).toEqual(['binding:a', 'binding:c'])
	})

	it('is nothing, for what is not a group', () => {
		expect(ungrouped(parse('{a = 1 g = {x = 1 x}}') as LetAST, env, ['binding:a', 'binding:g'])).toBeNull()
	})

	it('leaves a group whose names are taken', () => {
		expect(ungrouped(parse('{a = 9 g = {a = 1}}') as LetAST, env, ['binding:g'])).toBeNull()
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
