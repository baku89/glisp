import { buildPrelude, type Env, parse, print } from '@glisp/lang'
import { describe, expect, it } from 'vitest'

import { withGraphics } from './graphics'
import { modulationAt, withPointInserted, withPointRemoved, withPointsClosed } from './modulate'

const env: Env = withGraphics(buildPrelude())
const row = 'binding:c'
const at = (src: string, where: [number, number]) => modulationAt(parse(src), env, row, where, 2)
const line = '{c = (path.line [0 0] [10 0])}'
const poly = '{c = (path.polyline [0 0] [10 0] [10 10])}'
const gon = '{c = (path.polygon [0 0] [10 0] [10 10])}'

describe('modulationAt', () => {
	it('adds a point on an edge', () => {
		expect(at(line, [5, 1])).toEqual({ kind: 'insert', index: 1, at: [5, 0] })
		expect(at(poly, [10, 5])).toEqual({ kind: 'insert', index: 2, at: [10, 5] })
	})

	it('adds a point on the edge that closes it', () => {
		expect(at(gon, [5, 5])).toEqual({ kind: 'insert', index: 3, at: [5, 5] })
	})

	it('takes away a point along the way', () => {
		expect(at(poly, [10, 0])).toEqual({ kind: 'remove', index: 1, at: [10, 0] })
		expect(at(gon, [0, 0])).toEqual({ kind: 'remove', index: 0, at: [0, 0] })
	})

	it('goes on from an end', () => {
		expect(at(poly, [0, 0])).toEqual({ kind: 'continue', end: 'start', at: [0, 0] })
		expect(at(poly, [10, 10])).toEqual({ kind: 'continue', end: 'end', at: [10, 10] })
	})

	it('is nothing away from it, and for what is not made of points', () => {
		expect(at(line, [5, 9])).toBeNull()
		expect(at('{c = (path.circle [0 0] 10)}', [10, 0])).toBeNull()
		expect(at('{c = (path.transform (path.line [0 0] [9 9]) [1 0 0 1 0 0])}', [5, 5])).toBeNull()
	})

	it('goes past a style', () => {
		expect(at('{c = (style (path.line [0 0] [10 0]) "#000000" "none" 0)}', [5, 0])).toMatchObject({ kind: 'insert' })
	})
})

describe('what it does', () => {
	const inserted = (src: string, index: number, where: [number, number]) => {
		const next = withPointInserted(parse(src), env, row, index, where)!
		return [print(next.ast), next.row]
	}

	it('has a line become a polyline, named for it', () => {
		expect(inserted(line, 1, [5, 5])).toEqual(['{c = (path.polyline [0 0] [5 5] [10 0])}', row])
		const next = withPointInserted(parse('{line1 = (path.line [0 0] [10 0])}'), env, 'binding:line1', 1, [5, 5])!
		expect(print(next.ast)).toBe('{polyline1 = (path.polyline [0 0] [5 5] [10 0])}')
		expect(next.row).toBe('binding:polyline1')
	})

	it('keeps a name it was given', () => {
		const next = withPointInserted(parse('{wing = (path.line [0 0] [10 0])}'), env, 'binding:wing', 1, [5, 5])!
		expect(print(next.ast)).toBe('{wing = (path.polyline [0 0] [5 5] [10 0])}')
	})

	it('has a polyline become a line, with one less', () => {
		const next = withPointRemoved(parse('{polyline1 = (path.polyline [0 0] [5 5] [9 9])}'), env, 'binding:polyline1', 1)!
		expect(print(next.ast)).toBe('{line1 = (path.line [0 0] [9 9])}')
	})

	it('has a polygon stay one until it is too few', () => {
		const square = '{c = (path.polygon [0 0] [1 0] [1 1] [0 1])}'
		expect(print(withPointRemoved(parse(square), env, row, 0)!.ast)).toBe('{c = (path.polygon [1 0] [1 1] [0 1])}')
		expect(print(withPointRemoved(parse(gon), env, row, 0)!.ast)).toBe('{c = (path.line [10 0] [10 10])}')
	})

	it('does not leave too few', () => {
		expect(withPointRemoved(parse(line), env, row, 0)).toBeNull()
	})

	it('keeps what its points are written as', () => {
		const refers = '{p = [1 1] c = (path.line p [(+ 1 1) 0])}'
		expect(print(withPointInserted(parse(refers), env, row, 1, [5, 5])!.ast)).toBe(
			'{p = [1 1] c = (path.polyline p [5 5] [(+ 1 1) 0])}'
		)
	})

	it('keeps a style', () => {
		const styled = '{c = (style (path.line [0 0] [10 0]) "#ff0000" "none" 0)}'
		expect(print(withPointInserted(parse(styled), env, row, 1, [5, 5])!.ast)).toBe(
			'{c = (style (path.polyline [0 0] [5 5] [10 0]) "#ff0000" "none" 0)}'
		)
	})

	it('goes round', () => {
		expect(print(withPointsClosed(parse(poly), env, row)!.ast)).toBe('{c = (path.polygon [0 0] [10 0] [10 10])}')
	})

	it('updates what refers to a name it has changed', () => {
		const src = '{line1 = (path.line [0 0] [10 0]) other = line1}'
		const next = withPointInserted(parse(src), env, 'binding:line1', 1, [5, 5])!
		expect(print(next.ast)).toBe('{polyline1 = (path.polyline [0 0] [5 5] [10 0]) other = polyline1}')
	})

	it('rounds as asked', () => {
		expect(print(withPointInserted(parse(line), env, row, 1, [5.123, 5.678], 0.1)!.ast)).toContain('[5.1 5.7]')
	})
})
