import { describe, expect, it } from 'vitest'

import { DASH_KINDS, dashKindOf, dashOf } from './dashes'

describe('a dash as a kind', () => {
	it('is in terms of the width of the line', () => {
		expect(dashOf('dashed', 1)).toEqual([3, 2])
		expect(dashOf('dashed', 4)).toEqual([12, 8])
		expect(dashOf('dotted', 2.5)).toEqual([2.5, 2.5])
		expect(dashOf('solid', 3)).toEqual([])
	})

	it('is never finer than for a line one wide, which a hairline is drawn as', () => {
		expect(dashOf('dashDot', 0.2)).toEqual([3, 1, 1, 1])
	})

	it('is known again from its lengths, at the width they were made for', () => {
		for (const kind of DASH_KINDS) {
			if (kind === 'custom') continue
			expect(dashKindOf(dashOf(kind, 2), 2)).toBe(kind)
		}
		expect(dashKindOf([12, 8], 4)).toBe('dashed')
		expect(dashKindOf([12, 8], 1)).toBe('custom')
		expect(dashKindOf([5], 1)).toBe('custom')
	})

	it('as custom keeps what is there, or starts from a dash', () => {
		expect(dashOf('custom', 1, [5, 1])).toEqual([5, 1])
		expect(dashOf('custom', 2)).toEqual([6, 4])
	})
})
