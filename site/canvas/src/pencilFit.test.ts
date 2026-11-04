import { describe, expect, it } from 'vitest'

import { fitFurther, NOTHING_SETTLED, pathOfFit, type PencilFit, samplesOf, steadied, type Steady } from './pencilFit'

type Vec = [number, number]

const TOLERANCE = 2.5
const LONGEST = 100

const wave = (n: number): Vec[] =>
	Array.from({ length: n }, (_, i) => [i * 1.5, Math.sin(i / 18) * 60])
/** The same, by a hand that shakes: the same every time, as a test has to be. */
const shaken = (n: number): Vec[] =>
	wave(n).map(([x, y], i) => [x + Math.sin(i * 12.9898) * 1.5, y + Math.sin(i * 78.233) * 1.5])

const steady = (stroke: readonly Vec[], smoothness = 2.5, ms = 8): Vec[] => {
	let state: Steady | null = null
	return stroke.map((at, i) => (state = steadied(state, at, i * ms, smoothness)).at)
}

function drawing(stroke: readonly Vec[], by = 1) {
	let state: PencilFit = NOTHING_SETTLED
	const steps = []
	for (let n = 2; n <= stroke.length; n += by) {
		const part = stroke.slice(0, n)
		state = fitFurther(state, part, TOLERANCE, LONGEST)
		steps.push({ state, vertices: pathOfFit(state, part).curves[0]!.vertices })
	}
	return steps
}

/** How much it wanders from one place to the next, whatever way it is generally going. */
const shakeOf = (points: readonly Vec[]): number => {
	let sum = 0
	for (let i = 1; i < points.length - 1; i++) {
		sum += Math.hypot(
			points[i - 1]![0] - 2 * points[i]![0] + points[i + 1]![0],
			points[i - 1]![1] - 2 * points[i]![1] + points[i + 1]![1]
		)
	}
	return sum / (points.length - 2)
}

describe('samplesOf', () => {
	const sample = (clientX: number, clientY: number, timeStamp: number, list?: unknown[]) =>
		({ clientX, clientY, timeStamp, getCoalescedEvents: list && (() => list) }) as unknown as PointerEvent

	it('takes all that a move holds, and not only where it ended, from the canvas', () => {
		const move = sample(30, 30, 3, [sample(10, 10, 1), sample(20, 25, 2), sample(30, 30, 3)])
		expect(samplesOf(move, { left: 5, top: 8 })).toEqual([
			{ at: [5, 2], time: 1 },
			{ at: [15, 17], time: 2 },
			{ at: [25, 22], time: 3 },
		])
	})

	it('goes by the move itself, where a browser holds nothing in it', () => {
		const at = [{ at: [30, 30], time: 3 }]
		expect(samplesOf(sample(30, 30, 3, []), { left: 0, top: 0 })).toEqual(at)
		expect(samplesOf(sample(30, 30, 3), { left: 0, top: 0 })).toEqual(at)
	})
})

describe('steadied', () => {
	it('takes a shake out', () => {
		const hand = shaken(800)
		expect(shakeOf(steady(hand))).toBeLessThan(shakeOf(hand) / 3)
	})

	it('takes out more for more smoothness', () => {
		const hand = shaken(800)
		expect(shakeOf(steady(hand, 10))).toBeLessThan(shakeOf(steady(hand, 2.5)))
	})

	it('hardly lags while going fast, and more while going slowly', () => {
		const lagAt = (pixelsPerStep: number) => {
			const line = Array.from({ length: 300 }, (_, i): Vec => [i * pixelsPerStep, 0])
			const end = steady(line).at(-1)!
			return line.at(-1)![0] - end[0]
		}
		// As a part of how far it goes in the time, going fast has less to catch up on.
		expect(lagAt(20) / 20).toBeLessThan(lagAt(0.2) / 0.2)
		expect(lagAt(20)).toBeLessThan(60)
	})

	it('comes to the same for the same, and starts where it starts', () => {
		const hand = shaken(100)
		expect(steady(hand)).toEqual(steady(hand))
		expect(steady(hand)[0]).toEqual(hand[0])
	})

	it('takes two at the same moment without going anywhere odd', () => {
		const first = steadied(null, [0, 0], 10, 2.5)
		const { at } = steadied(first, [5, 5], 10, 2.5)
		expect(Number.isFinite(at[0])).toBe(true)
		expect(at[0]).toBeLessThanOrEqual(5)
	})
})

describe('a curve as it is being drawn', () => {
	it('never moves what has been let go of', () => {
		const steps = drawing(steady(shaken(800)))
		expect(steps.at(-1)!.state.settled.length).toBeGreaterThan(5)
		steps.forEach((step, i) => {
			if (i === 0) return
			const was = steps[i - 1]!.state.settled
			expect(step.state.settled.slice(0, was.length)).toEqual(was)
			expect(step.vertices.slice(0, was.length)).toEqual(was)
		})
	})

	it('only ever changes the last stretch, however long it gets', () => {
		for (const { vertices, state } of drawing(steady(shaken(2000)), 7)) {
			expect(vertices.length - state.settled.length).toBeLessThanOrEqual(state.settled.length === 0 ? 2 : 1)
		}
	})

	it('comes to the same taking in several at a time as one by one', () => {
		const stroke = steady(shaken(300))
		const oneByOne = drawing(stroke).at(-1)!.state
		const atOnce = fitFurther(NOTHING_SETTLED, stroke, TOLERANCE, LONGEST)
		expect(atOnce).toEqual(oneByOne)
	})

	it('has a stretch no longer than it was told, near enough', () => {
		const stroke = steady(wave(1500))
		const { vertices } = drawing(stroke).at(-1)!
		for (let i = 1; i < vertices.length; i++) {
			const [a, b] = [vertices[i - 1]!.point, vertices[i]!.point]
			expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(LONGEST + 2)
		}
	})

	it('is smooth from each stretch to the next', () => {
		const { vertices } = drawing(steady(shaken(800))).at(-1)!
		for (let i = 2; i < vertices.length; i++) {
			const [into, out] = [vertices[i - 1]!, vertices[i]!]
			if (into.command !== 'C' || out.command !== 'C') continue
			const a: Vec = [into.point[0] - into.args[1][0], into.point[1] - into.args[1][1]]
			const b: Vec = [out.args[0][0] - into.point[0], out.args[0][1] - into.point[1]]
			expect(Math.abs(Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]))).toBeLessThan(0.01)
		}
	})

	it('keeps a corner a corner, with nothing to steady it', () => {
		const corner: Vec[] = [
			...Array.from({ length: 60 }, (_, i): Vec => [i * 3, 0]),
			...Array.from({ length: 60 }, (_, i): Vec => [177, (i + 1) * 3]),
		]
		const { vertices } = drawing(corner).at(-1)!
		const at = vertices.findIndex(({ point }) => point[0] === 177 && point[1] <= 3)
		expect(at).toBeGreaterThan(0)
		const [before, after] = [vertices[at]!, vertices[at + 1]!]
		const b = after.command === 'C' ? after.args[0] : after.point
		const a = before.command === 'C' ? before.args[1] : vertices[at - 1]!.point
		const turn = Math.atan2(
			(before.point[0] - a[0]) * (b[1] - before.point[1]) - (before.point[1] - a[1]) * (b[0] - before.point[0]),
			(before.point[0] - a[0]) * (b[0] - before.point[0]) + (before.point[1] - a[1]) * (b[1] - before.point[1])
		)
		expect(Math.abs(turn)).toBeGreaterThan(Math.PI / 4)
	})

	it('goes as far as where the pointer really is', () => {
		const stroke: Vec[] = [[0, 0], [10, 0], [20, 0]]
		const state = fitFurther(NOTHING_SETTLED, stroke, TOLERANCE, LONGEST)
		expect(pathOfFit(state, stroke, [25, 1]).curves[0]!.vertices.at(-1)!.point).toEqual([25, 1])
	})

	it('has nothing to say of nothing, and a line of two', () => {
		expect(pathOfFit(NOTHING_SETTLED, []).curves).toEqual([])
		const two: Vec[] = [[0, 0], [10, 0]]
		expect(pathOfFit(fitFurther(NOTHING_SETTLED, two, 1, LONGEST), two).curves[0]!.vertices).toHaveLength(2)
	})
})
