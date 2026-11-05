import { describe, expect, it } from 'vitest'

import { draggedHeight, draggedSplit, draggedTop } from './floatHeight'

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

describe('draggedTop', () => {
	it('moves the top, with the bottom staying where it is', () => {
		expect(draggedTop(200, 600, 0, 100, MIN)).toEqual({ y: 200, height: 400, snapped: false, reaches: false })
	})

	it('comes to as far up as it can go, near it or past it', () => {
		expect(draggedTop(5, 600, 0, 100, MIN)).toEqual({ y: 0, height: 600, snapped: false, reaches: true })
		expect(draggedTop(100, 600, 120, 100, MIN)).toEqual({ y: 120, height: 480, snapped: false, reaches: true })
	})

	it('stops at the least height', () => {
		expect(draggedTop(590, 600, 0, 300, MIN)).toEqual({ y: 536, height: MIN, snapped: false, reaches: false })
	})

	it('goes back to fitting, coming near where it does', () => {
		expect(draggedTop(302, 600, 0, 300, MIN)).toEqual({ y: 300, height: null, snapped: true, reaches: false })
	})
})

describe('draggedSplit', () => {
	it('divides what they come to, without changing it', () => {
		expect(draggedSplit(300, 800, 100, 100, MIN)).toEqual({ height: 300, other: 500, snapped: false })
	})

	it('leaves each of them the least height', () => {
		expect(draggedSplit(0, 800, 200, 200, MIN)).toEqual({ height: MIN, other: 736, snapped: false })
		expect(draggedSplit(2000, 800, 200, 200, MIN)).toEqual({ height: 736, other: MIN, snapped: false })
	})

	it('has either fit, coming near where it does', () => {
		expect(draggedSplit(205, 800, 200, 100, MIN)).toEqual({ height: null, other: 600, snapped: true })
		expect(draggedSplit(695, 800, 200, 100, MIN)).toEqual({ height: 700, other: null, snapped: true })
	})
})
