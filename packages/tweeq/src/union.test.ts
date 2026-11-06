import { buildPrelude, parse, print, Session } from '@glisp/lang'
import { describe, expect, it } from 'vitest'

import { actionsOf, viewOf } from './structure'

const session = new Session(buildPrelude())
session.exec('Point = [number number]')
session.exec('Anchor = {at: Point in?: Point out?: Point}')
session.exec('f = (=> (xs: [...(| Point Anchor)]): number 0)')
session.exec('g = (=> (x: (| number string)): number 0)')

const slotsOf = (src: string) => viewOf(parse(src), session.env).slots
const elementsOf = (src: string) => {
	const vector = slotsOf(src)[0]!
	return viewOf(vector.ast, vector.env, vector.expected).slots
}

describe('a slot of a union', () => {
	it('is shown as the member its value fits', () => {
		expect(viewOf(parse('"a"'), session.env, slotsOf('(g "a")')[0]!.expected).editor).toEqual({
			kind: 'string',
			value: 'a',
		})
		const [point, anchor] = elementsOf('(f [[1 2] {at: [3 4]}])')
		expect(point!.expected?.typeName).toBe('(| [number number] {at: [number number] in?: [number number] out?: [number number]})')
		expect(viewOf(point!.ast, point!.env, point!.expected).slots.map(s => s.expected?.typeName)).toEqual([
			'number',
			'number',
		])
		expect(viewOf(anchor!.ast, anchor!.env, anchor!.expected).slots.map(s => s.label)).toEqual(['at'])
	})

	it('can be made another member, keeping what carries over', () => {
		const [point, anchor] = elementsOf('(f [[1 2] {at: [3 4]}])')
		const toAnchor = actionsOf(point!).find(a => a.label.startsWith('As '))
		expect(toAnchor?.label).toBe('As Anchor')
		const made = toAnchor && 'apply' in toAnchor ? toAnchor.apply() : null
		expect(made && print(made)).toBe('[{at: [1 2]} {at: [3 4]}]')

		const toPoint = actionsOf(anchor!).find(a => a.label.startsWith('As '))
		expect(toPoint?.label).toBe('As Point')
		const back = toPoint && 'apply' in toPoint ? toPoint.apply() : null
		expect(back && print(back)).toBe('[[1 2] [3 4]]')
	})

	it('falls back to the default of a member nothing carries over to', () => {
		const [slot] = slotsOf('(g 1)')
		const toString = actionsOf(slot!).find(a => a.label === 'As string')
		const made = toString && 'apply' in toString ? toString.apply() : null
		expect(made && print(made)).toBe('(g "")')
	})
})
