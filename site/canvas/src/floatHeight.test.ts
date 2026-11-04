import { describe, expect, it } from 'vitest'

import { draggedHeight } from './floatHeight'

const MIN = 64

describe('draggedHeight', () => {
	it('sets a height away from where it fits', () => {
		expect(draggedHeight(500, 900, 300, MIN)).toEqual({ height: 500, snapped: false })
	})

	it('goes back to fitting, coming near where it does', () => {
		expect(draggedHeight(295, 900, 300, MIN)).toEqual({ height: null, snapped: true })
	})

	it('fits at the most there is, when there is more in it than that', () => {
		expect(draggedHeight(2000, 900, 1200, MIN)).toEqual({ height: null, snapped: true })
	})

	it('stops at the least height', () => {
		expect(draggedHeight(0, 900, 300, MIN)).toEqual({ height: MIN, snapped: false })
	})

	it('can go down to what is shorter than the least height, if that fits it', () => {
		expect(draggedHeight(0, 900, 40, MIN)).toEqual({ height: null, snapped: true })
	})
})
