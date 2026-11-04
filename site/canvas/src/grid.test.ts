import { describe, expect, it } from 'vitest'

import { gridPositions, gridStep, offAxis } from './grid'

describe('gridStep', () => {
	it('goes by 1, 2 and 10, no closer on screen than can be told apart, and never far', () => {
		expect(gridStep(1)).toBe(20)
		expect(gridStep(2)).toBe(10)
		expect(gridStep(0.1)).toBe(200)
		expect(gridStep(5)).toBe(10)
		expect(gridStep(8)).toBe(2)
		for (const zoom of [0.01, 0.13, 0.5, 1, 1.5, 1.6, 3.7, 40, 900]) {
			const gap = gridStep(zoom) * zoom
			expect(gap).toBeGreaterThanOrEqual(16 - 1e-9)
			expect(gap).toBeLessThan(80 + 1e-9)
		}
	})

	it('leaves some out when zooming out, and those left stay where they are', () => {
		const zooms = Array.from({ length: 200 }, (_, i) => 100 * 0.95 ** i)
		const steps = zooms.map(gridStep)
		for (const [i, step] of steps.entries()) {
			if (i > 0) expect(Number.isInteger(Number((step / steps[i - 1]!).toFixed(9)))).toBe(true)
		}
	})
})

describe('offAxis', () => {
	it('leaves out what is on the axis, however it was added up', () => {
		expect(offAxis(gridPositions(2, 30, 100), 30)).toEqual([10, 50, 70, 90])
		const zoom = 1.37
		const offset = 312.3
		const positions = gridPositions(zoom, offset, 1200)
		expect(offAxis(positions, offset)).toHaveLength(positions.length - 1)
	})

	it('leaves all of them, with the axis out of view', () => {
		expect(offAxis([10, 30], -200)).toEqual([10, 30])
	})
})

describe('gridPositions', () => {
	it('goes through the origin, wherever that is on screen', () => {
		expect(gridPositions(2, 10, 100)).toEqual([10, 30, 50, 70, 90])
		expect(gridPositions(2, -30, 50)).toEqual([10, 30])
		expect(gridPositions(2, 1000, 50)).toEqual([0, 20, 40])
	})

	it('moves along with the view, by no more than one gap', () => {
		expect(gridPositions(2, 25, 50)).toEqual([5, 25, 45])
	})

	it('is nothing, with no room', () => {
		expect(gridPositions(1, 0, 0)).toEqual([])
	})
})
