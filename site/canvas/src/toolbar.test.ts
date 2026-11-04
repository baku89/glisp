import { describe, expect, it } from 'vitest'

import { arranged, distanceFrom, isThrown, placed, slotAt, stowedAway } from './toolbar'

const FIRST = { shown: ['a', 'b', 'c'], stowed: ['x', 'y'] }

describe('an arrangement of tools', () => {
	it('is what it first is, with nothing kept', () => {
		expect(arranged(null, FIRST)).toEqual(FIRST)
		expect(arranged({}, FIRST)).toEqual(FIRST)
	})

	it('keeps what was done with the tools', () => {
		const kept = { shown: ['x', 'c', 'a'], stowed: ['b', 'y'] }
		expect(arranged(kept, FIRST)).toEqual(kept)
	})

	it('forgets a tool that has gone, and a new one goes where it first would', () => {
		const next = arranged({ shown: ['c', 'gone'], stowed: ['a', 'b', 'x'] }, FIRST)
		expect(next).toEqual({ shown: ['c'], stowed: ['a', 'b', 'x', 'y'] })
	})

	it('has each tool once, whatever was kept', () => {
		const next = arranged({ shown: ['a', 'a', 1 as unknown as string], stowed: ['a', 'b'] }, FIRST)
		expect(next).toEqual({ shown: ['a', 'c'], stowed: ['b', 'x', 'y'] })
		expect(arranged({ shown: 'a' as unknown as string[] }, FIRST)).toEqual(FIRST)
	})

	it('moves a tool along the bar', () => {
		expect(placed(FIRST, 'a', 2).shown).toEqual(['b', 'c', 'a'])
		expect(placed(FIRST, 'c', 0).shown).toEqual(['c', 'a', 'b'])
		expect(placed(FIRST, 'a', 99).shown).toEqual(['b', 'c', 'a'])
		expect(placed(FIRST, 'a', -1).shown).toEqual(['a', 'b', 'c'])
	})

	it('puts a tool away, and brings it back', () => {
		const away = stowedAway(FIRST, 'b')
		expect(away).toEqual({ shown: ['a', 'c'], stowed: ['x', 'y', 'b'] })
		expect(placed(away, 'b', 1)).toEqual({ shown: ['a', 'b', 'c'], stowed: ['x', 'y'] })
	})
})

describe('dragging a tool', () => {
	it('is over the place it is within', () => {
		expect(slotAt(100, 100, 34, 3)).toBe(0)
		expect(slotAt(133, 100, 34, 3)).toBe(0)
		expect(slotAt(134, 100, 34, 3)).toBe(1)
		expect(slotAt(0, 100, 34, 3)).toBe(0)
		expect(slotAt(999, 100, 34, 3)).toBe(2)
	})

	it('is as far from the bar as it is from its nearest side', () => {
		const box = { left: 0, top: 0, right: 10, bottom: 10 }
		expect(distanceFrom(5, 5, box)).toBe(0)
		expect(distanceFrom(5, -7, box)).toBe(7)
		expect(distanceFrom(13, 14, box)).toBe(5)
	})

	it('comes off when let go of far away, or thrown', () => {
		expect(isThrown(0, 5)).toBe(false)
		expect(isThrown(20, 0)).toBe(false)
		expect(isThrown(20, 1)).toBe(true)
		expect(isThrown(60, 0)).toBe(true)
	})
})
