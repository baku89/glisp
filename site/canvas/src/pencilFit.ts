/**
 * A stroke's curve as it is being drawn, and nothing already drawn ever moves. Where the pointer
 * goes is smoothed as it arrives, by what is known so far (`steadied`). The curve is then one
 * cubic being pulled along, which is let go of as it stands once it cannot take the next point
 * (`fitFurther`), so that only that last stretch is ever still changing.
 */

import { fitSingleCubic } from 'pave/path/fitting'

import type { Path, Vec } from './graphics'

type Vertex = Path['curves'][number]['vertices'][number]

/** All that a pointer says it did since it last said anything, of which a move only shows the end. */
export function samplesOf(
	event: PointerEvent,
	{ left, top }: { readonly left: number; readonly top: number }
): ReadonlyArray<{ readonly at: Vec; readonly time: number }> {
	const said = event.getCoalescedEvents?.() ?? []
	// These can have no target to be offset from, so they are measured from what they are on.
	return (said.length > 0 ? said : [event]).map(({ clientX, clientY, timeStamp }) => ({
		at: [clientX - left, clientY - top],
		time: timeStamp,
	}))
}

// -----------------------------------------------------------------------------
// What the hand shakes by: the 1€ filter (Casiez, Roussel and Vogel, 2012)
// -----------------------------------------------------------------------------

export interface Steady {
	readonly at: Vec
	readonly velocity: Vec
	readonly time: number
}

/** How much of the way a low-pass filter at `cutoff` Hz goes, over `dt` seconds. */
const reachOf = (cutoff: number, dt: number): number => {
	const tau = 1 / (2 * Math.PI * cutoff)
	return 1 / (1 + tau / dt)
}

/** How fast the filter's own idea of the speed follows, as the filter's authors have it. */
const SPEED_CUTOFF = 1
/** How much more it lets through for every pixel a second, so that going fast does not lag. */
const LETTING_THROUGH = 0.01
/** The cutoff at a standstill, at a Smoothness of 1. */
const STANDSTILL = 7.5
const FALLBACK_DT = 1 / 120

/**
 * Where the pointer is taken to be, in pixels on screen at `time` in milliseconds: heavily
 * smoothed while it goes slowly, where a shake shows, and hardly at all while it goes fast,
 * where a lag would. It only goes by what came before, so no point changes once it is given.
 */
export function steadied(was: Steady | null, at: Vec, time: number, smoothness: number): Steady {
	if (was === null) return { at, velocity: [0, 0], time }
	const dt = time > was.time ? (time - was.time) / 1000 : FALLBACK_DT
	const speedReach = reachOf(SPEED_CUTOFF, dt)
	const velocity: Vec = [
		was.velocity[0] + (((at[0] - was.at[0]) / dt) - was.velocity[0]) * speedReach,
		was.velocity[1] + (((at[1] - was.at[1]) / dt) - was.velocity[1]) * speedReach,
	]
	const cutoff = STANDSTILL / Math.max(smoothness, 0.1) + LETTING_THROUGH * Math.hypot(...velocity)
	const reach = reachOf(cutoff, dt)
	return {
		at: [was.at[0] + (at[0] - was.at[0]) * reach, was.at[1] + (at[1] - was.at[1]) * reach],
		velocity,
		time,
	}
}

// -----------------------------------------------------------------------------
// The curve
// -----------------------------------------------------------------------------

export interface PencilFit {
	/** All that has been let go of, which stays exactly as it is. */
	readonly settled: readonly Vertex[]
	/** The place in the stroke that the cubic being pulled along starts from. */
	readonly from: number
	/** How many places in the stroke have been taken into account. */
	readonly seen: number
	/** The cubic being pulled along, if it has got anywhere. */
	readonly pulling: Vertex | null
	/** Which way it has to leave, to go on smoothly from what is settled. */
	readonly leaving: Vec | null
}

export const NOTHING_SETTLED: PencilFit = { settled: [], from: 0, seen: 0, pulling: null, leaving: null }

/** How far a stroke turns between one stretch and the next, to be a corner rather than a curve. */
const CORNER = (60 * Math.PI) / 180
/** How many places back a stroke's direction is read over, to not go by the last wobble alone. */
const DIRECTION_OVER = 6
const SAMPLES = 24

const unit = ([x, y]: Vec): Vec => {
	const length = Math.hypot(x, y)
	return length === 0 ? [1, 0] : [x / length, y / length]
}
const minus = (a: readonly number[], b: readonly number[]): Vec => [a[0]! - b[0]!, a[1]! - b[1]!]

const startDirection = (run: readonly Vec[]): Vec =>
	unit(minus(run[Math.min(DIRECTION_OVER, run.length - 1)]!, run[0]!))
const endDirection = (run: readonly Vec[]): Vec =>
	unit(minus(run[Math.max(run.length - 1 - DIRECTION_OVER, 0)]!, run.at(-1)!))

const lengthOf = (run: readonly Vec[]): number =>
	run.reduce((sum, at, i) => (i === 0 ? 0 : sum + Math.hypot(at[0] - run[i - 1]![0], at[1] - run[i - 1]![1])), 0)

/** How far from `[a, b]` the point `p` is. */
function toSegment(p: Vec, a: Vec, b: Vec): number {
	const [dx, dy] = minus(b, a)
	const span = dx * dx + dy * dy
	const t = span === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / span))
	return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t)
}

/** As far as any of `run` is from the cubic that goes from `start` with these controls to `end`. */
function furthestFrom(run: readonly Vec[], start: Vec, c1: Vec, c2: Vec, end: Vec): number {
	const on: Vec[] = Array.from({ length: SAMPLES + 1 }, (_, i) => {
		const t = i / SAMPLES
		const s = 1 - t
		const [a, b, c, d] = [s * s * s, 3 * s * s * t, 3 * s * t * t, t * t * t]
		return [
			a * start[0] + b * c1[0] + c * c2[0] + d * end[0],
			a * start[1] + b * c1[1] + c * c2[1] + d * end[1],
		]
	})
	let furthest = 0
	for (const p of run) {
		let nearest = Infinity
		for (let i = 0; i < SAMPLES; i++) nearest = Math.min(nearest, toSegment(p, on[i]!, on[i + 1]!))
		furthest = Math.max(furthest, nearest)
	}
	return furthest
}

/** `run` as one segment, if that is near enough to it. */
function segmentThrough(run: readonly Vec[], leaving: Vec | null, tolerance: number): Vertex | null {
	const end = run.at(-1)!
	if (run.length === 2) return { point: end, command: 'L' }
	const [c1, c2] = fitSingleCubic(
		run as [number, number][],
		leaving ?? startDirection(run),
		endDirection(run)
	) as [Vec, Vec]
	return furthestFrom(run, run[0]!, c1, c2, end) <= tolerance ? { point: end, command: 'C', args: [c1, c2] } : null
}

/** Which way a curve is going as it comes in along `vertex`, from `before`. */
const headingOf = (vertex: Vertex, before: readonly number[]): Vec =>
	unit(vertex.command === 'C' ? minus(vertex.point, vertex.args[1]) : minus(vertex.point, before))

const turnBetween = (a: Vec, b: Vec): number =>
	Math.abs(Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]))

/** `was`, having taken in the rest of `stroke`, within `tolerance` and no longer than `longest`. */
export function fitFurther(was: PencilFit, stroke: readonly Vec[], tolerance: number, longest: number): PencilFit {
	let { settled, from, pulling, leaving } = was
	for (let seen = Math.max(was.seen, 1); seen < stroke.length; seen++) {
		const run = stroke.slice(from, seen + 1)
		const next = lengthOf(run) > longest && pulling !== null ? null : segmentThrough(run, leaving, tolerance)
		if (next !== null) {
			pulling = next
			continue
		}
		if (pulling === null) {
			// It cannot be helped, with only this to go on.
			pulling = { point: stroke[seen]!, command: 'L' }
			continue
		}
		// Let go of it as it stands, and go on from where it ended.
		const start = stroke[from]!
		settled = [...(settled.length === 0 ? [{ point: start, command: 'L' } as Vertex] : settled), pulling]
		const heading = headingOf(pulling, start)
		from = seen - 1
		const onward = unit(minus(stroke[seen]!, stroke[from]!))
		leaving = turnBetween(heading, onward) > CORNER ? null : heading
		pulling = { point: stroke[seen]!, command: 'L' }
	}
	return { settled, from, seen: stroke.length, pulling, leaving }
}

/** The curve as it stands, as far as `tip`, where the pointer really is, if that is further. */
export function pathOfFit({ settled, pulling }: PencilFit, stroke: readonly Vec[], tip?: Vec): Path {
	const start = stroke[0]
	if (start === undefined) return { curves: [] }
	const vertices: Vertex[] = [
		...(settled.length === 0 ? [{ point: start, command: 'L' } as Vertex] : settled),
		...(pulling === null ? [] : [pulling]),
		...(tip === undefined ? [] : [{ point: tip, command: 'L' } as Vertex]),
	]
	return { curves: [{ vertices, closed: false }] }
}
