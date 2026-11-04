/**
 * Tools that take more than one press, or that draw something other than one shape, after the
 * ones in pentool. A brush only says what its state comes to at each thing a pointer does, and
 * what that is as a row of the program, so what it draws stays as editable as anything else.
 * One session is one row, however many presses it took, until it is let go of.
 */

import { type Env, type LetAST, parse } from '@glisp/lang'
import { withLayerAdded } from '@glisp/tweeq/structure'

import type { Paint, Vec } from './graphics'
import { nameOfKind, type ShapeAttributes } from './scene'
import { paintOfLine, withPaintDrawn } from './toolAttributes'

/** What to draw over the canvas to go by, which is not part of what is drawn. */
export interface Guides {
	readonly points?: readonly Vec[]
	readonly lines?: ReadonlyArray<readonly [Vec, Vec]>
	/** What can be taken hold of, pointing the way it pulls, in degrees. */
	readonly arrows?: ReadonlyArray<{ readonly at: Vec; readonly angle: number }>
}

export interface Brush<S = any> {
	/** What its rows are called, before a number. */
	readonly kind: string
	/** Ends as it is let go of, rather than when it is told it is done. */
	readonly oneStroke?: boolean
	/** What it drew is left selected, as there is more to do to it than can be seen otherwise. */
	readonly selectedAfter?: boolean
	/** How what it draws takes the paint in hand: as a line, or by the colors it is given. */
	readonly painted: 'line' | 'itself'
	start(seed: number): S
	press(state: S, at: Vec, context: BrushContext): S
	drag(state: S, at: Vec): S
	move(state: S, at: Vec): S
	release(state: S, at: Vec): S
	/** What it is as source, as it is now, or in the end. Null if that is nothing yet. */
	source(state: S, context: BrushContext, final: boolean): string | null
	guides(state: S, context: BrushContext): Guides
	/** How far around the pointer it reaches, on the canvas, to show that it does. */
	reach?(context: BrushContext): number
}

export interface BrushContext {
	readonly paint: Paint
	readonly shape: ShapeAttributes
	/** How far on screen one on the canvas is. */
	readonly zoom: number
}

const rounded = (n: number): number => Math.round(n * 100) / 100
const place = ([x, y]: Vec): string => `[${rounded(x)} ${rounded(y)}]`
const places = (points: readonly Vec[]): string => `[${points.map(place).join(' ')}]`
const color = (value: string): string => JSON.stringify(value === 'none' ? '#000000' : value)
const degrees = (radians: number): number => (radians * 180) / Math.PI
const distance = (a: Vec, b: Vec): number => Math.hypot(a[0] - b[0], a[1] - b[1])

/** On a line a long way each way from something, to look like it goes on for ever. */
const FAR = 100000

// -----------------------------------------------------------------------------
// Spray: one stroke of it is one row, scattered by its seed
// -----------------------------------------------------------------------------

interface SprayState {
	readonly seed: number
	readonly points: readonly Vec[]
}

/** How far on the canvas a pointer goes between one dab and the next, at the first zoom. */
const SPRAY_STEP = 6

const adding = (state: SprayState, at: Vec): SprayState => {
	const last = state.points.at(-1)
	return last !== undefined && distance(last, at) < SPRAY_STEP ? state : { ...state, points: [...state.points, at] }
}

export const spray: Brush<SprayState> = {
	kind: 'spray',
	oneStroke: true,
	painted: 'itself',
	start: seed => ({ seed, points: [] }),
	press: adding,
	drag: adding,
	move: state => state,
	release: state => state,
	source: ({ seed, points }, { paint, shape }) =>
		points.length === 0
			? null
			: `(spray ${places(points)} ${seed} ${shape.sprayMinRadius} ${shape.sprayMaxRadius} ${shape.sprayJitter} ${color(paint.fill)} ${color(shape.fill2)})`,
	guides: () => ({}),
	reach: ({ shape }) => shape.sprayJitter + shape.sprayMaxRadius,
}

// -----------------------------------------------------------------------------
// What goes through places, with one that follows the pointer until it is put down
// -----------------------------------------------------------------------------

interface PlacesState {
	readonly places: readonly Vec[]
	/** Where the pointer is, which is the next place if it is pressed. */
	readonly at: Vec | null
}

const placing = {
	start: (): PlacesState => ({ places: [], at: null }),
	press: (state: PlacesState, at: Vec): PlacesState => ({ ...state, at }),
	drag: (state: PlacesState, at: Vec): PlacesState => ({ ...state, at }),
	move: (state: PlacesState, at: Vec): PlacesState => ({ ...state, at }),
	release: (state: PlacesState, at: Vec): PlacesState => ({ places: [...state.places, at], at }),
	guides: ({ places: put, at }: PlacesState): Guides => ({ points: at === null ? put : [...put, at] }),
}

/** Where it goes through, with where the pointer is if it is still being drawn. */
const through = ({ places: put, at }: PlacesState, final: boolean): readonly Vec[] =>
	final || at === null ? put : [...put, at]

export const arcStrip: Brush<PlacesState> = {
	kind: 'arcStrip',
	painted: 'line',
	...placing,
	source: (state, _, final) => {
		const points = through(state, final)
		return points.length < 2 ? null : `(path.arcStrip ${places(points)})`
	},
}

export const triangleStrip: Brush<PlacesState & { readonly seed: number }> = {
	kind: 'triangleStrip',
	painted: 'itself',
	...placing,
	start: seed => ({ ...placing.start(), seed }),
	press: (state, at) => ({ ...state, at }),
	drag: (state, at) => ({ ...state, at }),
	move: (state, at) => ({ ...state, at }),
	release: (state, at) => ({ ...state, places: [...state.places, at], at }),
	source: (state, { paint, shape }, final) => {
		const points = through(state, final)
		return points.length < 3
			? null
			: `(triangleStrip ${places(points)} ${state.seed} ${color(paint.fill)} ${color(shape.fill2)})`
	},
	guides: state => {
		const points = through(state, false)
		const [a, b] = [points.at(-2), points.at(-1)]
		return { points, lines: a && b ? [[a, b]] : [] }
	},
}

// -----------------------------------------------------------------------------
// Lines out from a center that the first press puts down, and a drag moves
// -----------------------------------------------------------------------------

interface RadialState {
	readonly center: Vec | null
	readonly settingCenter: boolean
	/** Which way from the center the pointer is, in degrees. */
	readonly angle: number
	readonly drawn: ReadonlyArray<readonly [angle: number, from: number, to: number]>
	readonly drawing: readonly [from: number, to: number] | null
}

const alongFrom = (center: Vec, angle: number, at: Vec): number => {
	const radians = (angle * Math.PI) / 180
	return (at[0] - center[0]) * Math.cos(radians) + (at[1] - center[1]) * Math.sin(radians)
}
const angleFrom = (center: Vec, at: Vec): number => degrees(Math.atan2(at[1] - center[1], at[0] - center[0]))

export const radial: Brush<RadialState> = {
	kind: 'radial',
	painted: 'line',
	start: () => ({ center: null, settingCenter: false, angle: 0, drawn: [], drawing: null }),
	press: (state, at) => {
		if (state.center === null) return { ...state, center: at, settingCenter: true }
		const angle = angleFrom(state.center, at)
		const along = alongFrom(state.center, angle, at)
		return { ...state, angle, drawing: [along, along] }
	},
	drag: (state, at) => {
		if (state.center === null) return state
		if (state.settingCenter) return { ...state, center: at }
		if (state.drawing === null) return state
		const along = alongFrom(state.center, state.angle, at)
		return { ...state, drawing: [Math.min(state.drawing[0], along), Math.max(state.drawing[1], along)] }
	},
	move: (state, at) =>
		state.center === null || state.drawing !== null ? state : { ...state, angle: angleFrom(state.center, at) },
	release: state => {
		if (state.drawing === null) return { ...state, settingCenter: false }
		const [from, to] = state.drawing
		return {
			...state,
			drawing: null,
			drawn: from === to ? state.drawn : [...state.drawn, [rounded(state.angle), rounded(from), rounded(to)]],
		}
	},
	source: ({ center, drawn, drawing, angle }) => {
		const all = drawing === null ? drawn : [...drawn, [rounded(angle), rounded(drawing[0]), rounded(drawing[1])]]
		return center === null || all.length === 0
			? null
			: `(path.radial ${place(center)} [${all.map(line => `[${line.join(' ')}]`).join(' ')}])`
	},
	guides: ({ center, angle }) => {
		if (center === null) return {}
		const [dx, dy] = [Math.cos((angle * Math.PI) / 180) * FAR, Math.sin((angle * Math.PI) / 180) * FAR]
		return { points: [center], lines: [[[center[0] - dx, center[1] - dy], [center[0] + dx, center[1] + dy]]] }
	},
}

// -----------------------------------------------------------------------------
// Dubins: places with a direction, joined by what can only turn so tightly
// -----------------------------------------------------------------------------

interface DubinsStop {
	readonly at: Vec
	/** The way it is going there, in degrees. */
	readonly angle: number
	/** How tightly it can turn on the way from there. Without one, it is what the tool says. */
	readonly radius?: number
}

interface DubinsState {
	readonly stops: readonly DubinsStop[]
	/** What of a stop a drag has hold of, which is its direction unless it was only its place. */
	readonly holding: { readonly stop: number; readonly part: 'place' | 'tip' } | null
}

/** How far a press goes on the canvas, before it is more than a click. */
const DUBINS_PULLED_FROM = 4
/** How near on screen a press has to be to what is already there, to take hold of it. */
const DUBINS_REACH = 8

/** The end of the line that says which way a stop goes, and how tightly it turns. */
const tipOf = ({ at, angle, radius }: DubinsStop, { shape }: BrushContext): Vec => {
	const reach = radius ?? shape.dubinsRadius
	const radians = (angle * Math.PI) / 180
	return [at[0] + Math.cos(radians) * reach, at[1] + Math.sin(radians) * reach]
}

/** Where in `stops` the last that `is` so is, as what is on top of the others is what is meant. */
function lastWhere(stops: readonly DubinsStop[], is: (stop: DubinsStop) => boolean): number {
	for (let i = stops.length - 1; i >= 0; i--) if (is(stops[i]!)) return i
	return -1
}

export const dubinsChain: Brush<DubinsState> = {
	kind: 'dubins',
	painted: 'line',
	selectedAfter: true,
	start: () => ({ stops: [], holding: null }),
	press: (state, at, context) => {
		const reach = DUBINS_REACH / context.zoom
		const tip = lastWhere(state.stops, stop => distance(tipOf(stop, context), at) <= reach)
		if (tip !== -1) return { ...state, holding: { stop: tip, part: 'tip' } }
		const place = lastWhere(state.stops, stop => distance(stop.at, at) <= reach)
		if (place !== -1) return { ...state, holding: { stop: place, part: 'place' } }
		const before = state.stops.at(-1)
		// A click goes on the way that it comes from the last, as tightly as that did.
		const stop: DubinsStop = {
			at,
			angle: before ? angleFrom(before.at, at) : 0,
			...(before?.radius === undefined ? {} : { radius: before.radius }),
		}
		return { stops: [...state.stops, stop], holding: { stop: state.stops.length, part: 'tip' } }
	},
	// How it is pulled is which way it goes, and how far is how tightly it can turn.
	drag: (state, at) => {
		const { holding } = state
		const held = holding && state.stops[holding.stop]
		if (!holding || !held) return state
		const out = distance(held.at, at)
		if (holding.part === 'tip' && out < DUBINS_PULLED_FROM) return state
		const next: DubinsStop =
			holding.part === 'place' ? { ...held, at } : { ...held, angle: angleFrom(held.at, at), radius: rounded(out) }
		return { ...state, stops: state.stops.map((stop, i) => (i === holding.stop ? next : stop)) }
	},
	move: state => state,
	release: state => ({ ...state, holding: null }),
	source: ({ stops }, { shape }) =>
		stops.length < 2
			? null
			: `(path.dubinsChain [${stops
					.map(({ at: [x, y], angle, radius }) =>
						`[${[rounded(x), rounded(y), rounded(angle), ...(radius === undefined ? [] : [radius])].join(' ')}]`
					)
					.join(' ')}] ${shape.dubinsRadius})`,
	guides: ({ stops }, context) => ({
		points: stops.map(({ at }) => at),
		lines: stops.map((stop): readonly [Vec, Vec] => [stop.at, tipOf(stop, context)]),
		arrows: stops.map(stop => ({ at: tipOf(stop, context), angle: stop.angle })),
	}),
}

// -----------------------------------------------------------------------------

export const BRUSHES = {
	spray,
	arcStrip,
	triangleStrip,
	radial,
	dubins: dubinsChain,
} as const

export type BrushName = keyof typeof BRUSHES

export const isBrush = (tool: unknown): tool is BrushName => typeof tool === 'string' && tool in BRUSHES

/** `base`, with what `brush` has come to in a row of its own, or as it was if that is nothing. */
export function brushed<S>(
	base: LetAST,
	env: Env,
	brush: Brush<S>,
	state: S,
	context: BrushContext,
	final: boolean
): LetAST {
	const source = brush.source(state, context, final)
	if (source === null) return base
	const name = nameOfKind(base, brush.kind)
	const next = withLayerAdded(base, name, parse(source))
	if (brush.painted === 'itself') return next
	return withPaintDrawn(next, env, name, paintOfLine(context.paint, false))
}
