import { describe, expect, it } from 'vitest'

import { draggedHeight } from './floatHeight'

const MIN = 64

describe('draggedHeight', () => {
	it('sets a height away from where it fits', () => {
		expect(draggedHeight(500, 900, 300, MIN)).toEqual({ height: 500, snapped: false, reaches: false })
	})

	it('goes back to fitting, coming near where it does', () => {
		expect(draggedHeight(295, 900, 300, MIN)).toEqual({ height: null, snapped: true, reaches: false })
	})

	it('reaches the end of the room there is, coming near it or going past it', () => {
		expect(draggedHeight(895, 900, 300, MIN)).toEqual({ height: 900, snapped: false, reaches: true })
		expect(draggedHeight(2000, 900, 300, MIN)).toEqual({ height: 900, snapped: false, reaches: true })
	})

	it('reaches rather than fits, when there is more in it than there is room for', () => {
		expect(draggedHeight(2000, 900, 1200, MIN).reaches).toBe(true)
	})

	it('stops at the least height', () => {
		expect(draggedHeight(0, 900, 300, MIN)).toEqual({ height: MIN, snapped: false, reaches: false })
	})

	it('can go down to what is shorter than the least height, if that fits it', () => {
		expect(draggedHeight(0, 900, 40, MIN)).toEqual({ height: null, snapped: true, reaches: false })
	})
})
