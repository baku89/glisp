import { describe, expect, it } from 'vitest'

import { graphPaperPositions, graphPaperStep } from './graphPaper'

describe('graphPaperStep', () => {
	it('goes by 1, 2 and 10, no closer on screen than can be told apart, and never far', () => {
		expect(graphPaperStep(1)).toBe(20)
		expect(graphPaperStep(2)).toBe(10)
		expect(graphPaperStep(0.1)).toBe(200)
		expect(graphPaperStep(5)).toBe(10)
		expect(graphPaperStep(8)).toBe(2)
		for (const zoom of [0.01, 0.13, 0.5, 1, 1.5, 1.6, 3.7, 40, 900]) {
			const gap = graphPaperStep(zoom) * zoom
			expect(gap).toBeGreaterThanOrEqual(16 - 1e-9)
			expect(gap).toBeLessThan(80 + 1e-9)
		}
	})

	it('leaves some out when zooming out, and those left stay where they are', () => {
		const zooms = Array.from({ length: 200 }, (_, i) => 100 * 0.95 ** i)
		const steps = zooms.map(zoom => graphPaperStep(zoom))
		for (const [i, step] of steps.entries()) {
			if (i > 0) expect(Number.isInteger(Number((step / steps[i - 1]!).toFixed(9)))).toBe(true)
		}
	})

	it('is the step it is given at full size, whatever that is', () => {
		for (const step of [1, 3, 5, 16, 20, 37, 100, 1000]) {
			expect(graphPaperStep(1, step)).toBe(step)
		}
	})

	it('comes to the same look at any step, only that much larger', () => {
		for (const zoom of [0.13, 0.5, 1.7, 8]) {
			expect(graphPaperStep(zoom, 100)).toBeCloseTo(graphPaperStep(zoom, 20) * 5, 6)
		}
	})

	it('stays as it is, if it is not adaptive', () => {
		for (const zoom of [0.1, 1, 8]) expect(graphPaperStep(zoom, 37, false)).toBe(37)
	})
})

describe('graphPaperPositions', () => {
	it('goes through the origin, wherever that is on screen', () => {
		expect(graphPaperPositions(2, 10, 100)).toEqual([10, 30, 50, 70, 90])
		expect(graphPaperPositions(2, -30, 50)).toEqual([10, 30])
		expect(graphPaperPositions(2, 1000, 50)).toEqual([0, 20, 40])
	})

	it('moves along with the view, by no more than one gap', () => {
		expect(graphPaperPositions(2, 25, 50)).toEqual([5, 25, 45])
	})

	it('is nothing, with no room', () => {
		expect(graphPaperPositions(1, 0, 0)).toEqual([])
	})

	it('goes by the step, and by nothing else if it is not adaptive', () => {
		expect(graphPaperPositions(1, 0, 100, 30)).toEqual([0, 30, 60, 90])
		expect(graphPaperPositions(2, 0, 100, 30, false)).toEqual([0, 60])
	})

	it('is nothing, rather than more than can be drawn, if it stays small far out', () => {
		expect(graphPaperPositions(0.01, 0, 1000, 20, false)).toEqual([])
		expect(graphPaperPositions(0.01, 0, 1000, 20, true).length).toBeGreaterThan(0)
	})
})
