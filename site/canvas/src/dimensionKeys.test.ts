import { describe, expect, it } from 'vitest'

import { isForElsewhere } from './dimensionKeys'

const plain = { metaKey: false, ctrlKey: false, altKey: false, shiftKey: false }
const offered = { value: '120', selectionStart: 0, selectionEnd: 3 }

describe('a key on a number just offered to type over', () => {
	it('is for a shortcut, if it is a letter', () => {
		for (const key of ['v', 'p', 'r', 'o', 'n', 'd']) {
			expect(isForElsewhere({ ...plain, key }, offered)).toBe(true)
		}
	})

	it('is typed, if a number or an expression could begin with it', () => {
		for (const key of ['1', '.', '-', '(', 'x', 'i']) {
			expect(isForElsewhere({ ...plain, key }, offered)).toBe(false)
		}
		expect(isForElsewhere({ ...plain, key: 'M', shiftKey: true }, offered)).toBe(false)
	})

	it('is typed, once someone has begun to', () => {
		const key = 'v'
		expect(isForElsewhere({ ...plain, key }, { value: '12', selectionStart: 2, selectionEnd: 2 })).toBe(false)
		expect(isForElsewhere({ ...plain, key }, { value: '120', selectionStart: 1, selectionEnd: 3 })).toBe(false)
		expect(isForElsewhere({ ...plain, key }, { value: '', selectionStart: 0, selectionEnd: 0 })).toBe(false)
	})

	it('is left alone, with anything held down', () => {
		expect(isForElsewhere({ ...plain, key: 'v', metaKey: true }, offered)).toBe(false)
		expect(isForElsewhere({ ...plain, key: 'v', ctrlKey: true }, offered)).toBe(false)
		expect(isForElsewhere({ ...plain, key: 'v', altKey: true }, offered)).toBe(false)
	})
})
