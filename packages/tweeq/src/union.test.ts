import { buildPrelude, parse, print, Session } from '@glisp/lang'
import { describe, expect, it } from 'vitest'

import { memberChoicesOf, rowsWithAbsent, viewOf } from './structure'

const session = new Session(buildPrelude())
session.exec('Point = [number number]')
session.exec('Anchor = {at: Point in?: Point out?: Point}')
session.exec('f = (=> (xs: [...(| Point Anchor)]): number 0)')
session.exec('g = (=> (x: (| number string)): number 0)')
session.exec('h = (=> (c: (| "red" number)): number 0)')
session.exec('k = (=> (w: number d?: number): number 0)')
session.exec('v = (=> (xs: [...(| number unit)]): number 0)')

const slotsOf = (src: string) => viewOf(parse(src), session.env).slots
const elementsOf = (src: string) => {
	const vector = slotsOf(src)[0]!
	return viewOf(vector.ast, vector.env, vector.expected).slots
}
const pick = (slot: Parameters<typeof memberChoicesOf>[0], label: string): string => {
	const choice = memberChoicesOf(slot)?.choices.find(c => c.label === label)
	if (choice === undefined) throw new Error(`no ${label}`)
	return print(choice.apply())
}

describe('a slot of a union', () => {
	it('is shown as the member its value fits', () => {
		expect(viewOf(parse('"a"'), session.env, slotsOf('(g "a")')[0]!.expected).editor).toEqual({
			kind: 'string',
			value: 'a',
		})
		const [point, anchor] = elementsOf('(f [[1 2] {at: [3 4]}])')
		expect(viewOf(point!.ast, point!.env, point!.expected).slots.map(s => s.expected?.typeName)).toEqual([
			'number',
			'number',
		])
		expect(viewOf(anchor!.ast, anchor!.env, anchor!.expected).slots.map(s => s.label)).toEqual(['at'])
	})

	it('offers each member, saying which it is now', () => {
		const [point, anchor] = elementsOf('(f [[1 2] {at: [3 4]}])')
		expect(memberChoicesOf(point!)).toMatchObject({
			choices: [
				{ label: 'Point', kind: 'type' },
				{ label: 'Anchor', kind: 'type' },
			],
			current: 0,
		})
		expect(memberChoicesOf(anchor!)?.current).toBe(1)
		expect(memberChoicesOf(slotsOf('(h 3)')[0]!)).toMatchObject({
			choices: [
				{ label: 'red', kind: 'value' },
				{ label: 'number', kind: 'type' },
			],
			current: 1,
		})
		expect(memberChoicesOf(slotsOf('(h "red")')[0]!)?.current).toBe(0)
	})

	it('leaves a union of values only to its own menu', () => {
		session.exec('j = (=> (x: (| "a" "b")): number 0)')
		expect(memberChoicesOf(slotsOf('(j "a")')[0]!)).toBeNull()
	})

	it('is made another member, keeping what carries over', () => {
		const [point, anchor] = elementsOf('(f [[1 2] {at: [3 4]}])')
		expect(pick(point!, 'Anchor')).toBe('[{at: [1 2]} {at: [3 4]}]')
		expect(pick(anchor!, 'Point')).toBe('[[1 2] [3 4]]')
		expect(pick(slotsOf('(g 1)')[0]!, 'string')).toBe('(g "")')
		expect(pick(slotsOf('(h 3)')[0]!, 'red')).toBe('(h "red")')
		expect(pick(slotsOf('(h "red")')[0]!, 'number')).toBe('(h 0)')
	})
})

describe('a slot that can be left out', () => {
	it('is nothing while it is left out, and is left out by being made nothing', () => {
		const call = viewOf(parse('(k 1)'), session.env)
		const rows = rowsWithAbsent(call.slots, call.missing)
		const absent = rows.find(s => s.label === 'd')!
		expect(memberChoicesOf(absent)?.current).toBe(1)
		const given = slotsOf('(k 1 2)')[1]!
		expect(memberChoicesOf(given)?.current).toBe(0)
		expect(pick(given, 'None')).toBe('(k 1)')
	})

	it('is written as () where it cannot go, and emptied so', () => {
		const [element] = elementsOf('(v [1])')
		expect(pick(element!, 'None')).toBe('[()]')
		expect(memberChoicesOf(elementsOf('(v [()])')[0]!)?.current).toBe(1)
	})
})
