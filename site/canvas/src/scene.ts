/**
 * What is on a canvas, from a program: no drawing in here. A shape's address is the
 * row it comes from, and where it is in that row's value. What moves it goes back
 * from there with `solve`.
 */

import { Ray } from 'geome'
import {
	type AST,
	CallAST,
	coerceTo,
	enterNode,
	type Env,
	evaluate,
	infer,
	isHidden,
	isTypedHostFn,
	LetAST,
	lit,
	lookupBareName,
	MetaAST,
	named,
	nameOf,
	parse,
	pathTarget,
	pushLetFrame,
	print,
	readByName,
	solve,
	SymAST,
	LitAST,
	toAst,
	type TypedHostFn,
	type TypeValue,
	UNSET,
	unwrapLazy,
	VecAST,
	callParameters,
	withoutCall,
	withPathsInto,
	withPathsMoved,
} from '@glisp/lang'
import { reach, withParent } from '@glisp/tweeq/rowsClipboard'
import {
	MAIN,
	elementOptionsOf,
	isGroup,
	layersVectorOf,
	referenceTargetOf,
	layersOf,
	withLayerAdded,
	isProportional,
	layerLabelOf,
	listedSlots,
	keepingRatio,
	type NumberOptions,
	numberOptionsAt,
	referenceAt,
	type Slot,
	textOf,
	titleOf,
	viewOf,
} from '@glisp/tweeq/structure'

import { mat2d, vec2 } from 'linearly'
import { fit } from 'pave/path/fitting'
import { toD } from 'pave/path/svg'
import { bounds } from 'pave/path/metrics'
import { rectangle } from 'pave/path/primitives'
import { contains, intersections } from 'pave/path/queries'
import { transform } from 'pave/path/modifiers'

import type { GraphPaperValue } from './graphics'
import { between, less, partsIn, partsOf, type Place, placeOf, pointAt, simplified, solvedFor, substituted, valuesOfParts, whereIs, writtenAt } from './place'
import { isGuideOfPoints } from './graphics'
import type { GraphPaperKind } from './graphPaper'

import {
	type Change,
	type DimensionSide,
	type Grip,
	type Handle,
	type HandleDrag,
	gripOf,
	type BoxAnswer,
	gripOfPoint,
	isPath,
	isStyled,
	type Mat,
	NO_GRIP,
	NO_PAINT,
	PAINT_KEYS,
	type Paint,
	lineGuide,
	rayGuide,
	type Path,
	type StraightLine,
	styleOf,
	under,
	type Vec,
	withinArg,
	isArtboard,
	makesArtboard,
	ARTBOARD_LAYERS,
	type ArtboardValue,
	isRect,
	outlineOf,
	otherControl,
	SHOWN_WHOLE,
} from './graphics'

export interface Shape {
	/** The row it comes from. */
	readonly row: string
	readonly draw: string
	readonly value: unknown
	/** How it is drawn, if it says. */
	readonly paint?: Paint
	/** What it is cut off by, on the canvas, as what is on an artboard is by its edge. */
	readonly clip?: Path
}

/**
 * Whether taking hold of a shape can be anywhere inside of it, which is where it is filled.
 * What is only a line, or has no paint of its own, is taken hold of by its line, for what is
 * seen through it to be reached: an open path would be closed from its end back to its start.
 */
export const hasInside = ({ paint }: Shape): boolean => paint !== undefined && paint.fill !== 'none'

/** How wide the line of a shape is, in what is drawn, if it has one that is painted. */
export const widthOfLine = ({ paint }: Shape): number =>
	paint === undefined || paint.stroke === 'none' ? 0 : paint.width

/** The rows of what is at all within the corners `a` and `b`, once each. */
/** It has an outline, as a path, and not only a place. A frame is drawn differently. */
export const isOutlined = (draw: string): boolean => draw === 'path' || draw === 'frame' || draw === 'artboard'

/** What can be seen of a shape as a line, if it is not only a place. */
export const lineOfShape = ({ draw, value }: Pick<Shape, 'draw' | 'value'>): Path | null => {
	if (isOutlined(draw)) return value as Path
	if (draw === 'ray') return rayGuide(value as Ray)
	if (draw !== 'line') return null
	const [through, direction] = value as StraightLine
	return lineGuide(through, direction)
}

export function rowsWithin(scene: readonly Shape[], a: Vec, b: Vec): string[] {
	const [left, right] = a[0] < b[0] ? [a[0], b[0]] : [b[0], a[0]]
	const [top, bottom] = a[1] < b[1] ? [a[1], b[1]] : [b[1], a[1]]
	const inBox = ([x, y]: Vec): boolean => x >= left && x <= right && y >= top && y <= bottom
	const box = rectangle([left, top], [right, bottom])
	const rows = scene.flatMap(shape => {
		const { row, draw, value } = shape
		// A line goes on for ever, so what counts is whether it goes through.
		if (draw === 'line') {
			const [[x, y], [dx, dy]] = value as StraightLine
			const sides = [[left, top], [right, top], [left, bottom], [right, bottom]].map(
				([cx, cy]) => Math.sign((cx! - x) * dy - (cy! - y) * dx)
			)
			return Math.min(...sides) <= 0 && Math.max(...sides) >= 0 ? [row] : []
		}
		// A ray goes on for ever one way, so it is in what it starts in or goes through.
		if (draw === 'ray') {
			const ray = value as Ray
			return inBox(ray.origin as Vec) || intersections(rayGuide(ray), box).length > 0 ? [row] : []
		}
		const [[l, t], [r, d]] =
			isOutlined(draw) ? bounds(value as Path) : [value as Vec, value as Vec]
		if (!(l <= right && r >= left && t <= bottom && d >= top)) return []
		if (!isOutlined(draw)) return [row]
		// What is around the box without touching it is not in it, unless it is filled, where the box is.
		const path = value as Path
		const touches =
			path.curves.some(curve => curve.vertices.some(({ point }) => inBox(point as Vec))) ||
			intersections(path, box).length > 0 ||
			(hasInside(shape) && contains(path, [left, top]))
		return touches ? [row] : []
	})
	return [...new Set(rows)]
}

export type ShapeTool =
	| 'rect'
	| 'ellipse'
	| 'ngon'
	| 'star'
	| 'roundRect'
	| 'superellipse'
	| 'capsule'
	| 'fan'
	| 'spiral'
	| 'clothoid'

/** How far apart the directions are that a shape is drawn toward, if it is drawn evenly. */
const DRAWN_ANGLE_STEP = 45

/** Whether a shape from `tool` faces the way it is drawn, and so goes by even angles. */
export const facesWhenDrawn = (tool: ShapeTool): boolean =>
	tool === 'ngon' || tool === 'star' || tool === 'capsule' || tool === 'fan' || tool === 'clothoid'

/** As far from `from` as `to` is, at the nearest of the angles that a shape is evenly drawn at. */
export function evenlyFrom(from: Vec, to: Vec): Vec {
	const [dx, dy] = [to[0] - from[0], to[1] - from[1]]
	const angle = Math.round(Math.atan2(dy, dx) / ((DRAWN_ANGLE_STEP * Math.PI) / 180))
	const radians = angle * ((DRAWN_ANGLE_STEP * Math.PI) / 180)
	const reach = Math.hypot(dx, dy)
	return [from[0] + Math.cos(radians) * reach, from[1] + Math.sin(radians) * reach]
}
/** What a shape starts as, that its drag does not say, in proportion to what it does. */
/** How a circle is drawn: within a box, through two points at either end of it, or through three. */
export const ELLIPSE_MODES = ['box', 'diameter', 'threePoints'] as const
export type EllipseMode = (typeof ELLIPSE_MODES)[number]

export const SHAPE_ATTRIBUTES = {
	/** How many sides a polygon or a star has. */
	sides: 5,
	starInner: 0.45,
	corner: 0.2,
	capsuleRadius: 0.25,
	fanInner: 0.5,
	fanSpread: 45,
	spiralTurns: 3,
	/** It comes to have turned this far, in radians, at the end. */
	clothoidTurn: 3,
	exponent: 2,
	/** How far from where a pencil went its curve can be, on screen, to be simpler for it. */
	smoothness: 2.5,
	/** Whether what a pencil draws is filled, as well as being a line. */
	pencilFill: false,
	dubinsRadius: 20,
	sprayMinRadius: 5,
	sprayMaxRadius: 20,
	sprayJitter: 40,
	/** The other color of what is mixed from two, of which the first is the fill. */
	fill2: '#f9faf9',
	/** How a circle is drawn: within a box, through two points at either end of it, or through three. */
	ellipseMode: 'box' as EllipseMode,
	/** The size an artboard is put down at by a click, by the name of what it is for. */
	artboardPreset: 'desktop',
	/** Whether that is the wider way around. */
	artboardLandscape: true,
}
export type ShapeAttributes = typeof SHAPE_ATTRIBUTES

/**
 * As finely as a pointer can say anything, at this zoom and on this screen: a power of
 * ten, so that it reads well, no coarser than one pixel of it.
 */
export function dragStep(zoom: number, pixelRatio: number): number {
	return 10 ** Math.floor(Math.log10(1 / (zoom * pixelRatio)))
}

const FINEST = 0.01

export function roundedTo(n: number, step: number): number {
	if (step >= 1) return Math.round(n / step) * step
	return Number(n.toFixed(Math.round(-Math.log10(step))))
}

/** `value`, with every number in it no finer than `step`, in the data of a path as well. */
function roundedValue(value: unknown, step: number): unknown {
	if (typeof value === 'number') return roundedTo(value, step)
	if (Array.isArray(value)) return value.map(element => roundedValue(element, step))
	if (typeof value === 'string') {
		return value.replace(/-?\d+\.\d+(?:e-?\d+)?/g, n => String(roundedTo(Number(n), step)))
	}
	return value
}

/** What is to change, no finer than `step`. */
export const roundedChanges = (changes: readonly Change[], step: number): Change[] =>
	changes.map(change => ({ ...change, value: roundedValue(change.value, step) }))

const STYLE = 'style'

const isStyle = (ast: AST): ast is CallAST =>
	ast.kind === 'call' && print(ast.head) === STYLE

/** What a style says of `key`, however it is said. */
const saidIn = (style: CallAST, key: keyof Paint): AST | undefined =>
	style.kwargs?.get(key) ?? style.args[PAINT_KEYS.indexOf(key) + 1]

/**
 * `path`, drawn as the bindings at `rows` are put together: each part of how as the one in
 * front has it, or else the next one behind that says anything of it. What is only as it would
 * be anyway says nothing, so a fill in front goes with a line behind it.
 */
export function withPaintOfRows(root: LetAST, env: Env, rows: readonly string[], path: AST): AST {
	const styles = layersOf(root)
		.filter(name => rows.includes(`binding:${name}`))
		.map(name => rowAt(root, env, `binding:${name}`)?.node)
		.flatMap(node => (node && isStyle(bare(node)) ? [bare(node) as CallAST] : []))
	const said = (key: keyof Paint): AST | undefined => {
		const nothing = print(toAst(NO_PAINT[key], null))
		return styles.map(style => saidIn(style, key)).find(ast => ast && print(ast) !== nothing)
	}
	const styled = styleOf(path, Object.fromEntries(PAINT_KEYS.map(key => [key, said(key)])))
	return styled.kwargs ? styled : path
}

/** How the row at `row` is drawn, if it draws anything, or would if it were not hidden. */
export function paintAt(root: AST, env: Env, row: string): Paint | null {
	const atRow = (s: Shape): boolean => s.row === row
	const shape =
		shapesAtRow(drawnIn(root, env)).get(row)?.find(({ draw }) => !NOT_SHAPES.has(draw)) ??
		hiddenShapesOf(root, env, [row]).find(atRow)
	return shape === undefined ? null : (shape.paint ?? NO_PAINT)
}

/**
 * The rows that what is said of how `row` is drawn goes to: itself, or for a group, which is
 * not drawn as anything of its own, what is drawn in it, hidden or not.
 */
export function rowsPaintedBy(root: AST, env: Env, row: string): string[] {
	if (!holdsRows(root, env, row)) return [row]
	const inside = [...sceneOf(root, env), ...hiddenShapesOf(root, env, [row])]
	return [...new Set(inside.map(shape => shape.row).filter(other => other.startsWith(`${row}/`)))]
}

/** The row to inspect for what the row at `row` is, past the style it is only given. */
export function paintedRow(root: AST, env: Env, row: string): string {
	const node = rowAt(root, env, row)?.node
	return node && isStyle(bare(node)) ? `${row}/arg0` : row
}

/**
 * `root`, with the row at `row` drawn differently, being wrapped in a style if it is not
 * in one, and let out of it once there is nothing to it.
 */
export function withPaint(root: AST, env: Env, row: string, part: Partial<Paint>): AST {
	const reached = reach(root, env, row)
	const last = reached?.chain.at(-1)
	if (!reached || !last) return root
	const node = bare(last.ast)
	const styled = isStyle(node)
	const path = styled ? node.args[0]! : node
	const old = paintAt(root, env, row) ?? NO_PAINT
	const arg = (key: keyof Paint): AST | undefined =>
		part[key] !== undefined ? toAst(part[key], null) : styled ? saidIn(node, key) : undefined
	const nothing = { ...old, ...part }
	if (nothing.fill === 'none' && nothing.stroke === 'none') {
		return styled ? (withoutCall(root, env, node) ?? root) : root
	}
	const next = styleOf(path, Object.fromEntries(PAINT_KEYS.map(key => [key, arg(key)])))
	const kept = last.ast.kind === 'meta' ? new MetaAST(last.ast.metadata, next) : next
	const edited = withParent(reached.chain, last.replace(kept))
	// What is in a style already stays where it is, with or without being said more of.
	return styled ? edited : withPathsInto(edited, env, next)
}

/**
 * The rows of what comes out differently in `after`, whatever it is that does it: what
 * refers to what changed goes with it, so that where it was is no longer anywhere.
 */
export function rowsChanged(before: AST, after: AST, env: Env): Set<string> {
	const drawnBy = (root: AST): Map<string, string> => {
		const drawn = new Map<string, string>()
		for (const { row, value } of sceneOf(root, env)) {
			drawn.set(row, (drawn.get(row) ?? '') + JSON.stringify(value))
		}
		return drawn
	}
	const was = drawnBy(before)
	return new Set([...drawnBy(after)].flatMap(([row, now]) => (was.get(row) === now ? [] : [row])))
}

/** A place on a canvas to snap to, and the row that says where it is, if one does. */
export interface SnapPoint {
	readonly at: Vec
	readonly target: string | null
	/** What it is on what it is on, to say so, if it is called anything. */
	readonly label: string
	/** How it is worked out from the program, if no one row says where it is. */
	readonly code?: Place
	/** It is a line, from `at` to here, that snaps anywhere along it. */
	readonly to?: Vec
	/** What was snapped to along, with `at` being where on it. */
	readonly line?: readonly [Vec, Vec]
	/** It is where that line would go, if it went on. */
	readonly beyond?: boolean
	/** The two ends of a line, as places, for a place on it to be worked out from them. */
	readonly ends?: { readonly from: Place; readonly to: Place }
}

/** How far apart two places on what is drawn can be, and be taken for the same place. */
const SAME_END = 1e-6

/** Where `snap` is, as code: the row that it is, or how it is worked out. */
export const placeOfSnap = (snap: SnapPoint): Place | null =>
	snap.code ?? (snap.target === null ? null : pointAt(snap.target))

/** Whether `snap` is a place on the row at `row`, by what it is worked out from. */
export const isPlaceOf = (snap: SnapPoint, row: string): boolean => {
	const paths = snap.target !== null ? [snap.target] : [...(snap.code?.parts.values() ?? [])]
	return paths.some(path => path === row || path.startsWith(`${row}/`))
}

/** Everywhere on what is drawn that something can snap to. */
export function snapPointsOf(
	root: AST,
	env: Env,
	shapes: readonly Shape[],
	except: ReadonlySet<string> = new Set()
): SnapPoint[] {
	return [...new Set(shapes.map(({ row }) => row))].flatMap(row => {
		if (except.has(row)) return []
		const grip = gripAt(root, env, row)
		// In the coordinates of what is drawn, as a row inside a matrix is not.
		if (grip === null || grip.transform.join() !== IDENTITY.join()) return []
		const inside = grip.within === undefined ? row : `${row}/${grip.within}`
		// What is there only to turn or count by is no place on what is drawn.
		const handles: SnapPoint[] = grip.handles.flatMap(({ at, place, name, code }) =>
			at === undefined || (place === undefined && code === undefined && name === undefined)
				? []
				: [
						{
							at,
							...(code === undefined ? {} : { code: placeOf(code, inside) }),
							label: name ?? '',
							target:
								place === 'self'
									? inside
									: place === undefined
										? null
										: `${inside}/arg${place}`,
						},
					]
		)
		const points: SnapPoint[] = [
			...handles,
			...(grip.snaps?.points ?? []).map(({ at, name, code }) => ({
				at,
				...(code === undefined ? {} : { code: placeOf(code, inside) }),
				label: name,
				target: null,
			})),
		]
		// The ends of a line are places on it already, if they are anything that can be referred to.
		const endAt = (at: Vec): Place | null => {
			for (const point of points) {
				if (Math.hypot(point.at[0] - at[0], point.at[1] - at[1]) > SAME_END) continue
				const place = placeOfSnap(point)
				if (place !== null) return place
			}
			return null
		}
		return [
			...points,
			...(grip.snaps?.lines ?? []).map(({ from, to, name }) => {
				const [start, end] = [endAt(from), endAt(to)]
				return {
					at: from,
					to,
					label: name,
					target: null,
					...(start === null || end === null ? {} : { ends: { from: start, to: end } }),
				}
			}),
		]
	})
}

/**
 * What `at` can line up by, with a place: straight across from it, and straight down. Each goes
 * as far as `at` does, to be shown going from that place to where it has got.
 */
export const axesThrough = (place: Vec, at: Vec): SnapPoint[] => [
	{ at: place, to: [at[0], place[1]], label: 'horizontal', target: null },
	{ at: place, to: [place[0], at[1]], label: 'vertical', target: null },
]

/** The nearest place to `at` along a line, from `from` to `to`. */
function along(from: Vec, to: Vec, at: Vec): { at: Vec; beyond: boolean; t: number } {
	const [dx, dy] = [to[0] - from[0], to[1] - from[1]]
	const length = dx * dx + dy * dy
	const t = length === 0 ? 0 : ((at[0] - from[0]) * dx + (at[1] - from[1]) * dy) / length
	return { at: [from[0] + dx * t, from[1] + dy * t], beyond: length !== 0 && (t < 0 || t > 1), t }
}

/**
 * The nearest of `points` to `at`, within `tolerance`, one with a row before one without. Where a
 * line would go if it went on counts only with `beyond`, as that is most often not meant.
 */
export function nearestSnap(
	points: readonly SnapPoint[],
	at: Vec,
	tolerance: number,
	beyond = false
): SnapPoint | null {
	let best: SnapPoint | null = null
	let bestDistance = tolerance
	for (const point of points) {
		if (point.to !== undefined) continue
		const distance = Math.hypot(point.at[0] - at[0], point.at[1] - at[1])
		if (distance < bestDistance || (distance === bestDistance && best?.target === null)) {
			best = point
			bestDistance = distance
		}
	}
	if (best !== null) return best
	// Only with no place in reach, as a place is more of a place than a line is, and a
	// line more than where it would go if it went on.
	for (const onward of beyond ? [false, true] : [false]) {
		for (const point of points) {
			if (point.to === undefined) continue
			const on = alongSnapped({ ...point, line: [point.at, point.to] }, at, tolerance)!
			if ((on.beyond ?? false) !== onward) continue
			const distance = Math.hypot(on.at[0] - at[0], on.at[1] - at[1])
			if (distance < bestDistance) {
				best = on
				bestDistance = distance
			}
		}
		if (best !== null) return best
	}
	return null
}

/**
 * What was snapped to along a line, somewhere else along it, nearest `at`: as it is for what can
 * only go one way, which can get to the line, and only where its way meets it.
 */
export function alongSnapped(snap: SnapPoint, at: Vec, tolerance: number): SnapPoint | null {
	if (snap.line === undefined) return null
	const [from, to] = snap.line
	const { at: on, beyond, t } = along(from, to, at)
	const { label, line, ends } = snap
	const extra = beyond ? { beyond } : {}
	if (ends === undefined) return { at: on, target: null, label, line, ...extra }
	// Where a level or upright line would go on, it is only lined up with: one of where it is.
	const level = from[1] === to[1] && from[0] !== to[0]
	const upright = from[0] === to[0] && from[1] !== to[1]
	const placed =
		beyond && (level || upright)
			? inLineWith(ends[t > 1 ? 'to' : 'from'], level ? 1 : 0, on, tolerance)
			: onLineBetween(ends, from, to, t, tolerance)
	return placed === null ? { at: on, target: null, label, line, ...extra } : { ...placed, label, line, ends, ...extra }
}

/**
 * `on`, lined up with `end` along `axis`, 1 being across: referring to it for that, and only being
 * as far along as it is for the other, rounded no more than `tolerance` across.
 */
function inLineWith(end: Place, axis: 0 | 1, on: Vec, tolerance: number): { at: Vec; target: null; code: Place } | null {
	const parts = partsOf(end)
	if (parts === null) return null
	const free = axis === 1 ? 0 : 1
	const digits = Math.max(0, Math.min(6, Math.ceil(-Math.log10(tolerance / 10))))
	const along = Number(on[free].toFixed(digits))
	const at: Vec = axis === 1 ? [along, on[1]] : [on[0], along]
	const lined = parts[axis]
	const written = new LitAST(along)
	return { at, target: null, code: { ast: new VecAST(axis === 1 ? [written, lined] : [lined, written]), parts: end.parts } }
}

/**
 * The place `t` of the way along a line whose ends can be referred to, which goes on being
 * that much of the way along it as they move. It is rounded no more than `tolerance` across.
 */
function onLineBetween(
	ends: NonNullable<SnapPoint['ends']>,
	from: Vec,
	to: Vec,
	t: number,
	tolerance: number
): { at: Vec; target: null; code: Place } | null {
	const [a, b] = [partsOf(ends.from), partsOf(ends.to)]
	if (a === null || b === null) return null
	const length = Math.hypot(to[0] - from[0], to[1] - from[1])
	const digits = length === 0 ? 0 : Math.min(6, Math.max(2, Math.ceil(-Math.log10(tolerance / 10 / length))))
	const share = Number(t.toFixed(digits))
	// As `lerp` works it out, for it to come to exactly where it is said to be.
	const at: Vec = [from[0] + (to[0] - from[0]) * share, from[1] + (to[1] - from[1]) * share]
	// The same part is the same code, for it to be seen to be, as both ends of a level edge are.
	const code = joined(ends.from, ends.to, (x, y) => new VecAST([between(x[0], y[0], share), between(x[1], y[1], share)]))
	return code === null ? null : { at, target: null, code }
}

/**
 * Two places as one, by `make` of what each is across and down, each part that both go by being
 * one name, as both ends of a level edge go by the same top.
 */
function joined(a: Place, b: Place, make: (a: readonly [AST, AST], b: readonly [AST, AST]) => AST): Place | null {
	const byPath = new Map<string, string>()
	const parts = new Map<string, string>()
	const renamed = (place: Place): AST => {
		const to = new Map<string, AST>()
		for (const [name, path] of place.parts) {
			const known = byPath.get(path) ?? name
			byPath.set(path, known)
			parts.set(known, path)
			to.set(name, new SymAST(known))
		}
		return substituted(place.ast, to)
	}
	const [x, y] = [partsOf({ ast: renamed(a), parts }), partsOf({ ast: renamed(b), parts })]
	return x === null || y === null ? null : { ast: make(x, y), parts }
}

/**
 * Of the places on what is being moved, those that it was taken by: for it lines up by a
 * place that was taken hold of, and anywhere else on it means nothing in particular.
 */
export const placesTakenBy = (
	own: readonly SnapPoint[],
	[x, y]: Vec,
	tolerance: number
): SnapPoint[] => own.filter(({ at }) => Math.hypot(at[0] - x, at[1] - y) <= tolerance)

/** Where `snap` is, `by` short of it, by referring to it. */
function offsetFrom(snap: SnapPoint, by: Vec, step: number): Place | null {
	const place = placeOfSnap(snap)
	const parts = place && partsOf(place)
	if (place === null || parts === null) return null
	const short = (part: AST, i: number): AST => less(part, new LitAST(roundedTo(by[i]!, step)))
	return { ast: new VecAST([short(parts[0], 0), short(parts[1], 1)]), parts: place.parts }
}

/**
 * `drawn`, with where it starts referring to what it snapped to, which is then its origin,
 * or its center. An ellipse goes out from there. A rect's origin is its top left, and its
 * size is never less than nothing, so one drawn up or left of there is as far from that as it is big.
 */
export function drawnFrom(
	root: LetAST,
	env: Env,
	name: string,
	tool: ShapeTool,
	snap: SnapPoint,
	to: Vec,
	even: boolean,
	step = FINEST,
	fromCenter = false,
	shape: ShapeAttributes = SHAPE_ATTRIBUTES
): LetAST {
	const [dx, dy] = [to[0] - snap.at[0], to[1] - snap.at[1]]
	const fromCorner = tool === 'rect' || tool === 'roundRect'
	// What is drawn out both ways does not start at what it snapped to, if it has an end.
	const elsewhere = fromCenter && (fromCorner || tool === 'capsule')
	const anchored = canRefer(snap) && !elsewhere && !(fromCorner && (dx < 0 || dy < 0))
	const next = drawn(root, name, tool, snap.at, to, even, step, anchored, fromCenter, shape)
	const source = `binding:${name}/arg0`
	if (!anchored) {
		// Its origin is not what it snapped to, but it is as far from that as it is big.
		if (!canRefer(snap) || !fromCorner) return next
		const reached = rowAt(next, env, `binding:${name}`)
		const call = reached && bare(reached.node)
		if (call?.kind !== 'call' || call.args[0] === undefined) return next
		const origin = evaluate(call.args[0], reached!.env).value as Vec
		const code = offsetFrom(snap, [snap.at[0] - origin[0], snap.at[1] - origin[1]], step)
		const offset = code && referred(next, env, source, { ...snap, target: null, code })
		return offset?.kind === 'let' ? offset : next
	}
	const result = referred(next, env, source, snap)
	return result?.kind === 'let' ? result : drawn(root, name, tool, snap.at, to, even, step, false, fromCenter, shape)
}

/** How much of the program cannot be worked out, row by row. */
const errorsIn = (root: AST, env: Env): number =>
	viewOf(root, env).slots.reduce(
		(count, { ast, env: rowEnv }) =>
			count +
			evaluate(readByName(ast), rowEnv).diagnostics.filter(({ level }) => level === 'error').length,
		0
	)

/** Whether it can be referred to, by anything that is somewhere it can be seen from. */
export const canRefer = (snap: SnapPoint): boolean => snap.target !== null || snap.code !== undefined

/** `root`, with what is at `source` referring to what `snap` is, one way or the other. */
function referred(root: AST, env: Env, source: string, snap: SnapPoint): AST | null {
	if (snap.target !== null) return referenceAt(root, env, source, snap.target)
	return snap.code === undefined ? null : writtenAt(root, env, source, snap.code.ast, snap.code.parts)
}

/** How far apart two places can be, and be the same one but for arithmetic. */
const SAME_PLACE = 1e-9

/**
 * `root`, with the argument at `place` of the row at `row` referring to what `snap` is
 * the place of. Null if it cannot, or if that would not come to where it is: something
 * that itself refers to this row, for one.
 */
export function linked(
	root: AST,
	env: Env,
	row: string,
	place: number,
	snap: SnapPoint
): AST | null {
	const within = gripAt(root, env, row)?.within
	const inside = within === undefined ? row : `${row}/${within}`
	const next = referred(root, env, `${inside}/arg${place}`, snap)
	if (next === null) return null
	// Going round in a circle comes to the default, which can be just where it was.
	if (errorsIn(next, env) > errorsIn(root, env)) return null
	const reached = gripAt(next, env, row)?.handles.find(handle => handle.place === place)?.at
	// As near as arithmetic comes: what goes round by a circle is not exact at its top.
	return reached !== undefined && Math.hypot(reached[0] - snap.at[0], reached[1] - snap.at[1]) < SAME_PLACE ? next : null
}

/**
 * Where in the row at `row` its call is, and what moving it changes: the one argument that says
 * where it is, or else each of those that it goes through, as a circle through three places does.
 */
function callOfRow(
	root: AST,
	env: Env,
	row: string
): { inside: string; anchor: string | null; moving: readonly string[] } | null {
	const grip = gripAt(root, env, row)
	if (grip === null) return null
	const inside = grip.within === undefined ? row : `${row}/${grip.within}`
	const depth = grip.within === undefined ? 0 : grip.within.split('/').length
	const routes = (grip.move?.([1, 0]) ?? []).map(change => change.route.slice(depth))
	const moving = routes.every(route => route.length === 1) ? routes.map(route => `arg${route[0]}`) : []
	return { inside, anchor: moving.length === 1 ? moving[0]! : null, moving }
}

/**
 * `root`, with each of the places at `moving` in the call at `inside` as far from where `snap` is
 * as it is from `own`, so that all of it goes with that, as it is: what has no one place that says
 * where it is, as a circle through three has not, is moved by all of them together.
 */
function carriedOnto(root: AST, env: Env, inside: string, moving: readonly string[], own: Place, snap: SnapPoint): AST | null {
	const target = placeOfSnap(snap)
	const targetParts = target && partsOf(target)
	const at = rowAt(root, env, inside)?.env ?? env
	const from = whereIs(root, env, own, at)
	const numbers = numbersGiven(root, env, inside)
	if (target === null || targetParts === null || from === null) return null
	const offset = (part: AST, by: number): AST => {
		const rounded = Number(by.toPrecision(12))
		return by < 0 ? less(part, new LitAST(-rounded)) : simplified(new CallAST(new SymAST('+'), [part, new LitAST(rounded)]))
	}
	let next: AST | null = root
	for (const arg of moving) {
		const point = [0, 1].map(i => numbers.get(`${arg}/${i}`))
		if (point.some(n => n === undefined)) return null
		const ast = new VecAST(targetParts.map((part, i) => offset(part, point[i]! - from[i]!)))
		next = next && writtenAt(next, env, `${inside}/${arg}`, ast, target.parts)
	}
	if (next === null || next === root || errorsIn(next, env) > errorsIn(root, env)) return null
	const now = whereIs(next, env, own, at)
	return now !== null && Math.hypot(now[0] - snap.at[0], now[1] - snap.at[1]) < SAME_END ? next : null
}

/**
 * `root`, with `own`, a place on the call at `inside`, being where `snap` is, and going on being
 * there: each part of it, across and down, by the one of what it is worked out from that `pick`
 * chooses, which is then what `snap` is there less the rest of it, over how much it counts.
 *
 * This is what putting a place on another is, however that comes about: what is moved, pulled or
 * drawn only says which of what it is made of can change for it. Null if none can, a part cannot
 * be said so, as one that goes round by an angle cannot, or it does not come to where it is.
 */
export function attached(
	root: AST,
	env: Env,
	inside: string,
	own: Place,
	snap: SnapPoint,
	pick: (paths: readonly string[]) => string | undefined
): AST | null {
	const target = placeOfSnap(snap)
	const ownParts = partsOf(own)
	const targetParts = target && partsOf(target)
	if (ownParts === null || target === null || targetParts === null) return null
	const relative = (path: string): string | null => (path.startsWith(`${inside}/`) ? path.slice(inside.length + 1) : null)
	const nameOf = new Map([...own.parts].flatMap(([name, path]) => (relative(path) === null ? [] : [[relative(path)!, name] as const])))
	const at = rowAt(root, env, inside)?.env ?? env

	// What each part is to be, by the part of the call it goes by.
	const writes: { by: string; ast: AST }[] = []
	for (const axis of [0, 1] as const) {
		const expr = ownParts[axis]
		const paths = partsIn(expr, own.parts).flatMap(name => relative(own.parts.get(name)!) ?? [])
		const by = pick(paths)
		if (by === undefined) continue
		const values = valuesOfParts(root, env, own.parts)
		if (values === null) return null
		const solved = solvedFor(expr, nameOf.get(by)!, targetParts[axis], values, at)
		if (solved === null) return null
		writes.push({ by, ast: solved })
	}
	if (writes.length === 0) return null

	const parts = new Map([...own.parts, ...target.parts])
	let next: AST | null = root
	// The parts of a vector that is not written out, as one that is a reference, are written out with it.
	const whole = (by: string): string | null => {
		const element = /^(.*)\/(\d+)$/.exec(by)
		return element !== null && reach(root, env, `${inside}/${by}`) === null ? element[1]! : null
	}
	const ofWhole = new Map<string, Map<number, AST>>()
	for (const { by, ast } of writes) {
		const vector = whole(by)
		if (vector === null) {
			next = next && writtenAt(next, env, `${inside}/${by}`, ast, parts)
			continue
		}
		const elements = ofWhole.get(vector) ?? new Map<number, AST>()
		elements.set(Number(by.slice(vector.length + 1)), ast)
		ofWhole.set(vector, elements)
	}
	for (const [vector, elements] of ofWhole) {
		const as = [0, 1].map(i => {
			if (elements.has(i)) return elements.get(i)!
			const name = `__kept${i}`
			parts.set(name, `${inside}/${vector}/${i}`)
			return new SymAST(name)
		})
		next = next && writtenAt(next, env, `${inside}/${vector}`, new VecAST(as), parts)
	}
	if (next === null || next === root || errorsIn(next, env) > errorsIn(root, env)) return null
	const now = whereIs(next, env, own, at)
	return now !== null && Math.hypot(now[0] - snap.at[0], now[1] - snap.at[1]) < SAME_END ? next : null
}

/**
 * Where `taken` is on the row at `row` as code: what it says, or else the place of the same name
 * there, as a handle that is only a handle is where a place is, as a radius is at the right of a
 * circle. It is found where it was taken, or where it has been put, as `root` may be moved already.
 */
function placeTaken(root: AST, env: Env, row: string, taken: SnapPoint, at: readonly Vec[]): Place | null {
	const own = placeOfSnap(taken)
	if (own !== null) return own
	const found = snapPointsOf(root, env, sceneOf(root, env).filter(shape => shape.row === row)).find(
		point =>
			point.code !== undefined &&
			point.label === taken.label &&
			at.some(place => Math.hypot(point.at[0] - place[0], point.at[1] - place[1]) < SAME_END)
	)
	return found?.code ?? null
}

/**
 * `root`, in which the row at `row` has been moved for its place `taken` to be on what `snap` is
 * the place of, with what says where it is going by that, so that it stays on it: a place on what
 * is moved can be put on another, as much as another can be put on it. What says where it is is
 * what moving it changes.
 */
export function movedOnto(root: AST, env: Env, row: string, taken: SnapPoint, snap: SnapPoint): AST | null {
	if (!canRefer(snap)) return null
	const call = callOfRow(root, env, row)
	const own = placeTaken(root, env, row, taken, [taken.at, snap.at])
	if (call === null || own === null) return null
	const { inside, anchor, moving } = call
	if (anchor === null) return moving.length > 1 ? carriedOnto(root, env, inside, moving, own, snap) : null
	return attached(root, env, inside, own, snap, paths => paths.find(path => path === anchor || path.startsWith(`${anchor}/`)))
}

/** The numbers of what a call is given, by the paths that a place's code goes by: `arg1/0`, or `arg2`. */
function numbersGiven(root: AST, env: Env, inside: string): Map<string, number> {
	const numbers = new Map<string, number>()
	const found = rowAt(root, env, inside)
	const call = found && bare(found.node)
	if (call?.kind !== 'call') return numbers
	argsOf(call, found!.env).args.forEach((value, i) => {
		if (typeof value === 'number') numbers.set(`arg${i}`, value)
		else if (Array.isArray(value)) value.forEach((part, j) => typeof part === 'number' && numbers.set(`arg${i}/${j}`, part))
	})
	return numbers
}

/**
 * `root`, in which `handle` of the row at `row` has been pulled, from where it was in `before`,
 * for it to be on what `snap` is the place of: with what it changed going by that, so that it
 * stays on it. A corner of a box, pulled onto another, has its size go by where that is.
 */
export function pulledOnto(root: AST, before: AST, env: Env, row: string, handle: Handle, snap: SnapPoint): AST | null {
	if (!canRefer(snap)) return null
	const call = callOfRow(root, env, row)
	if (call === null) return null
	const { inside } = call
	const own =
		handle.code !== undefined
			? placeOf(handle.code, inside)
			: handle.at === undefined
				? null
				: placeTaken(before, env, row, { at: handle.at, label: handle.name ?? '', target: null }, [handle.at])
	if (own === null) return null
	const was = numbersGiven(before, env, inside)
	const now = numbersGiven(root, env, inside)
	const moved = [...now].flatMap(([path, value]) => (was.get(path) === value ? [] : [path]))
	return attached(root, env, inside, own, snap, paths => paths.find(path => moved.includes(path)))
}

/**
 * `root`, in which the row at `row` has just been drawn with its end at what `snap` is the place
 * of, with the place of it that is there going by that: as its start does, so that what is drawn
 * from one thing to another goes on being so. A box drawn from corner to corner has its size go by
 * the corner it was drawn to. A place there that is an argument of its own is that; one that is
 * worked out goes by what is written as a number, other than what says where it is, if it can.
 */
export function drawnOnto(root: AST, env: Env, row: string, snap: SnapPoint): AST | null {
	if (!canRefer(snap)) return null
	const call = callOfRow(root, env, row)
	if (call === null) return null
	const { inside, anchor } = call
	const written = (path: string): boolean => {
		const node = reach(root, env, `${inside}/${path}`)?.chain.at(-1)?.ast
		return node !== undefined && bare(node).kind === 'lit'
	}
	const places = snapPointsOf(root, env, sceneOf(root, env).filter(shape => shape.row === row)).filter(
		point => canRefer(point) && Math.hypot(point.at[0] - snap.at[0], point.at[1] - snap.at[1]) < SAME_END
	)
	for (const place of places) {
		const own = place.target?.startsWith(`${inside}/arg`) ? /^arg(\d+)$/.exec(place.target.slice(inside.length + 1))?.[1] : undefined
		const next =
			own !== undefined
				? linked(root, env, row, Number(own), snap)
				: place.code !== undefined
					? attached(root, env, inside, place.code, snap, paths => {
							const free = paths.filter(written)
							return free.find(path => anchor === null || !path.startsWith(anchor)) ?? free.at(-1)
						})
					: null
		if (next !== null) return next
	}
	return null
}

/**
 * What the rows at `rows` are put on, and what that is put on in turn, among what is drawn: to be
 * moved along with them, so that moving them is only moving them, and nothing they go by has to
 * change shape for them to go where they are taken. A shape drawn from the corner of another to
 * the corner of a third goes with both.
 *
 * It is what, moved by itself, has them come out somewhere else as they are written: what refers
 * to them instead would have to be changed to move, and is left to follow them as it does.
 */
export function rowsHeldBy(root: AST, env: Env, rows: ReadonlySet<string>): string[] {
	const written = (ast: AST, row: string): string | null => {
		const found = rowAt(ast, env, row)
		return found === null ? null : print(found.node)
	}
	const before = new Map([...rows].map(row => [row, written(root, row)]))
	const held: string[] = []
	for (const row of new Set(sceneOf(root, env).map(shape => shape.row))) {
		if (rows.has(row)) continue
		// What is on an artboard that is moved goes with it already, being measured from it, and
		// what is moved on an artboard is only on it, and does not take it along.
		if ([...rows].some(own => row.startsWith(`${own}/`) || own.startsWith(`${row}/`))) continue
		const changes = gripAt(root, env, row)?.move?.([1.37, 2.11])
		if (changes === undefined || changes.length === 0) continue
		const { ast } = changed(root, env, row, changes)
		if (ast === null) continue
		const moved = rowsChanged(root, ast, env)
		if ([...rows].some(own => moved.has(own) && written(ast, own) === before.get(own))) held.push(row)
	}
	return held
}

/** A place a circle is drawn through, and what it was put on, if it was put on anything. */
export interface PlaceDrawn {
	readonly at: Vec
	readonly snap?: SnapPoint | null
}

/**
 * `root` with a circle drawn through `places`, under `name`: with two, at either end of a line
 * through its center, and with three, through all of them. Each that was put on what can be
 * referred to refers to it, so that the circle goes on going through it.
 */
export function drawnThrough(
	root: LetAST,
	env: Env,
	name: string,
	places: readonly PlaceDrawn[],
	step = FINEST
): LetAST {
	const written = ([x, y]: Vec): string => `[${roundedTo(x, step)} ${roundedTo(y, step)}]`
	const fn = places.length === 2 ? 'path.circleFromDiameter' : 'path.circleThrough'
	let next: AST = withLayerAdded(root, name, parse(`(${fn} ${places.map(({ at }) => written(at)).join(' ')})`))
	for (const [i, { snap }] of places.entries()) {
		if (!snap || !canRefer(snap)) continue
		next = linked(next, env, `binding:${name}`, i, snap) ?? next
	}
	return next as LetAST
}

/** The name a shape drawn with `tool` gets for what it is, that `root` does not have yet. */
export function nameFor(root: LetAST, tool: ShapeTool, even: boolean): string {
	return nameOfKind(root, !even ? tool : tool === 'ellipse' ? 'circle' : tool === 'rect' ? 'square' : tool)
}

/**
 * `root` with a shape drawn from corner to corner, under `name`. As even as it can
 * be, it is what that is called: a square is a rect, and an even ellipse a circle.
 */
export function drawn(
	root: LetAST,
	name: string,
	tool: ShapeTool,
	from: Vec,
	to: Vec,
	even: boolean,
	step = FINEST,
	anchored = false,
	/** It goes out both ways from `from`, which is then its middle. */
	fromCenter = false,
	shape: ShapeAttributes = SHAPE_ATTRIBUTES
): LetAST {
	const rounded = (n: number) => roundedTo(n, step)
	const written = ([x, y]: Vec): string => `[${rounded(x)} ${rounded(y)}]`
	const [dx, dy] = [to[0] - from[0], to[1] - from[1]]
	const side = Math.max(Math.abs(dx), Math.abs(dy))
	const end: Vec = even
		? [from[0] + Math.sign(dx || 1) * side, from[1] + Math.sign(dy || 1) * side]
		: to
	const mirrored = ([x, y]: Vec): Vec => [from[0] * 2 - x, from[1] * 2 - y]
	const begin = fromCenter ? mirrored(end) : from
	const center: Vec = [(begin[0] + end[0]) / 2, (begin[1] + end[1]) / 2]
	const corner: Vec = [Math.min(begin[0], end[0]), Math.min(begin[1], end[1])]
	const size: Vec = [Math.abs(end[0] - begin[0]), Math.abs(end[1] - begin[1])]
	const size2: Vec = [end[0] - begin[0], end[1] - begin[1]]
	const capsuleEnd = even ? evenlyFrom(from, to) : to
	const out = Math.max(Math.abs(dx), Math.abs(dy))
	const reach = Math.hypot(dx, dy)
	const toward = (Math.atan2(dy, dx) * 180) / Math.PI
	const heading = even ? Math.round(toward / DRAWN_ANGLE_STEP) * DRAWN_ANGLE_STEP : toward
	// Toward +X is what they are anyway, and needs no saying.
	const turned = rounded(heading) === 0 ? '' : ` ${rounded(heading)}`
	const source =
		tool === 'ngon'
			? `(path.ngon ${written(from)} ${rounded(reach)} ${shape.sides}${turned})`
			: tool === 'star'
			? `(path.star ${written(from)} ${rounded(reach)} ${rounded(reach * shape.starInner)} ${shape.sides}${turned})`
			: tool === 'capsule'
			? `(path.capsule ${written(fromCenter ? mirrored(capsuleEnd) : from)} ${written(capsuleEnd)} ${rounded(reach * shape.capsuleRadius)})`
			: tool === 'fan'
			? `(path.fan ${written(from)} ${rounded(reach * shape.fanInner)} ${rounded(reach)} ${rounded(heading - shape.fanSpread)} ${rounded(heading + shape.fanSpread)})`
			: tool === 'spiral'
			? `(path.spiral ${written(from)} 0 ${rounded(reach)} ${shape.spiralTurns})`
			: tool === 'clothoid'
			? `(path.clothoid ${written(from)} ${rounded(heading)} ${rounded(reach)} 0 ${reach === 0 ? 0 : Number(((2 * shape.clothoidTurn) / reach).toPrecision(3))})`
			: tool === 'roundRect'
			? `(path.roundRect ${written(anchored ? from : corner)} ${written(anchored ? size2 : size)} ${rounded(Math.min(size[0], size[1]) * shape.corner)})`
			: tool === 'superellipse'
			? `(path.superellipse ${written(anchored ? from : center)} ${written(anchored ? [Math.abs(end[0] - from[0]), Math.abs(end[1] - from[1])] : [size[0] / 2, size[1] / 2])} ${shape.exponent})`
			: anchored && tool === 'rect' && even
			? `(path.square ${written(from)} ${rounded(size2[0])})`
			: tool === 'rect' && even
			? `(path.square ${written(corner)} ${rounded(size[0])})`
			: anchored && tool === 'rect'
			? `(path.rect ${written(from)} ${written(size2)})`
			: anchored && even
			? `(path.circle ${written(from)} ${rounded(out)})`
			: anchored
			? `(path.ellipse ${written(from)} ${written([Math.abs(dx), Math.abs(dy)])})`
			: tool === 'rect'
			? `(path.rect ${written(corner)} ${written(size)})`
			: even
				? `(path.circle ${written(center)} ${rounded(size[0] / 2)})`
				: `(path.ellipse ${written(center)} ${written([size[0] / 2, size[1] / 2])})`
	return withLayerAdded(root, name, parse(source))
}

/** A place a pen has been, and where it was pulled to, if it was. */
export interface Anchor {
	readonly at: Vec
	readonly out?: Vec
	/** How it is come into, if that has been said, rather than being the other way from `out`. */
	readonly into?: Vec
	/** What it was put down on, to refer to if it can. */
	readonly snap?: SnapPoint
}

/** What a curve comes into `anchor` by: the other way from what it goes out by. */
const inOf = ({ at, out, into }: Anchor): Vec | undefined =>
	into ?? (out && [at[0] * 2 - out[0], at[1] * 2 - out[1]])

/**
 * `anchors`, with the curve as `path` now has it, its controls having been taken hold of
 * in the middle of drawing it. Something else altogether leaves them as they are.
 */
export function anchorsAlong(
	anchors: readonly Anchor[],
	path: Path,
	how?: HandleDrag
): readonly Anchor[] {
	const vertices = (path as unknown as { curves: readonly { vertices: readonly { command: string; args?: readonly Vec[] }[] }[] }).curves[0]?.vertices
	if (vertices?.length !== anchors.length) return anchors
	const controls = (i: number): readonly Vec[] | null => {
		const vertex = vertices[i]
		return vertex?.command === 'C' && vertex.args?.length === 2 ? vertex.args : null
	}
	return anchors.map((was, i) => {
		const { out: last, into: _into, ...anchor } = was
		const into = controls(i)?.[1]
		// The last has nothing to come out to yet, so it goes on from how it is come into.
		const before = inOf(was)
		const out =
			i !== anchors.length - 1
				? controls(i + 1)?.[0]
				: last === undefined || into === undefined || before === undefined
					? last
					: otherControl(was.at, into, last, before, how)
		return { ...anchor, ...(out === undefined ? {} : { out }), ...(into === undefined ? {} : { into }) }
	})
}

/** Where a pen would go next, lined up with what it has drawn, and what that lines up by. */
export interface PenGuided {
	readonly at: Vec
	readonly lines: readonly (readonly [Vec, Vec])[]
}

/**
 * Where a pen at `to` goes, having been to `anchors`, if something says so. Held `even`, it
 * goes from the last of them by even angles, as far as where that crosses in line with
 * another. Otherwise, it is in line across or down with any within `tolerance` of it.
 */
export function penGuided(
	anchors: readonly Anchor[],
	to: Vec,
	tolerance: number,
	even: boolean,
	step = FINEST
): PenGuided | null {
	const last = anchors.at(-1)?.at
	if (last === undefined) return null
	const rounded = ([x, y]: Vec): Vec => [roundedTo(x, step), roundedTo(y, step)]
	// The nearest first, for what was last drawn to be what it goes by, of those alike.
	const others = anchors.slice(0, -1).reverse().map(({ at }) => at)
	if (even) {
		const free = evenlyFrom(last, to)
		const reach = Math.hypot(free[0] - last[0], free[1] - last[1])
		if (reach === 0) return null
		const way: Vec = [(free[0] - last[0]) / reach, (free[1] - last[1]) / reach]
		let best: { at: Vec; by: Vec } | null = null
		let away = tolerance
		for (const other of others) {
			for (const axis of [0, 1] as const) {
				if (Math.abs(way[axis]) < 1e-9) continue
				const along = (other[axis] - last[axis]) / way[axis]
				if (along <= 0) continue
				const at: Vec = [last[0] + way[0] * along, last[1] + way[1] * along]
				const distance = Math.hypot(at[0] - free[0], at[1] - free[1])
				if (distance < away) [best, away] = [{ at, by: other }, distance]
			}
		}
		const at = rounded(best?.at ?? free)
		return { at, lines: [[last, at], ...(best === null ? [] : [[best.by, at] as const])] }
	}
	const inLine = (axis: 0 | 1): Vec | null => {
		let best: Vec | null = null
		let away = tolerance
		for (const other of [last, ...others]) {
			const distance = Math.abs(other[axis] - to[axis])
			if (distance < away) [best, away] = [other, distance]
		}
		return best
	}
	const [across, down] = [inLine(0), inLine(1)]
	if (across === null && down === null) return null
	const at: Vec = [across?.[0] ?? to[0], down?.[1] ?? to[1]]
	const lines = [across, down].flatMap(by =>
		by === null || (by[0] === at[0] && by[1] === at[1]) ? [] : [[by, at] as const]
	)
	return { at, lines }
}

/**
 * The first of what a pen drew, as it comes to be pulled in closing, by a pointer going on
 * the way the path does. As anywhere a pen is pulled, it goes through the same both ways,
 * unless that is `broken`, and only how it comes back changes, or `uneven`, and how it
 * leaves stays as long as it was.
 */
export function closingPulled(
	first: Anchor,
	pointer: Vec,
	how?: { readonly broken?: boolean; readonly uneven?: boolean; readonly even?: boolean }
): Anchor {
	const { at } = first
	const going = how?.even ? evenlyFrom(at, pointer) : pointer
	const into: Vec = [at[0] * 2 - going[0], at[1] * 2 - going[1]]
	if (how?.broken) return { ...first, into }
	if (!how?.uneven || first.out === undefined) return { ...first, out: going, into }
	return { ...first, out: otherControl(at, into, first.out, inOf(first)!, { smooth: true }), into }
}

const place = ([x, y]: Vec): string => `${roundedTo(x, FINEST)},${roundedTo(y, FINEST)}`

/** An SVG path's data, through `anchors` in turn. */
export function dOfAnchors(anchors: readonly Anchor[], closed: boolean): string {
	const [first] = anchors
	if (first === undefined) return ''
	const stops = closed ? [...anchors.slice(1), first] : anchors.slice(1)
	let from = first
	const parts = [`M ${place(first.at)}`]
	for (const to of stops) {
		const into = inOf(to)
		parts.push(
			from.out === undefined && into === undefined
				? `L ${place(to.at)}`
				: `C ${place(from.out ?? from.at)} ${place(into ?? to.at)} ${place(to.at)}`
		)
		from = to
	}
	if (closed) parts.push('Z')
	return parts.join(' ')
}

/**
 * What a pen has drawn comes to, as the most it can be said to be: the fewer things
 * were done, the more it is one of the shapes that has a name.
 */
export type PenKind = 'line' | 'polyline' | 'polygon' | 'cubic' | 'path'

export function penKind(anchors: readonly Anchor[], closed: boolean): PenKind {
	const curved = anchors.some(anchor => anchor.out !== undefined || anchor.into !== undefined)
	if (curved) return anchors.length === 2 && !closed ? 'cubic' : 'path'
	if (closed) return anchors.length >= 3 ? 'polygon' : 'path'
	if (anchors.length === 2) return 'line'
	return anchors.length > 2 ? 'polyline' : 'path'
}

/** `kind` with the first number that `root` has not got yet. */
export function nameOfKind(root: LetAST, kind: string): string {
	const taken = new Set([...root.bindings.map(([name]) => name), ...layersOf(root)])
	let n = 1
	while (taken.has(`${kind}${n}`)) n++
	return `${kind}${n}`
}

const asPoint = ([x, y]: Vec): string => `[${roundedTo(x, FINEST)} ${roundedTo(y, FINEST)}]`

/** The code for what a pen has drawn, and which argument each place on it is, if any. */
function penSource(anchors: readonly Anchor[], closed: boolean, kind: PenKind): string {
	const points = anchors.map(({ at }) => asPoint(at))
	switch (kind) {
		case 'line':
		case 'polyline':
		case 'polygon':
			return `(path.${kind} ${points.join(' ')})`
		case 'cubic': {
			const [from, to] = anchors as [Anchor, Anchor]
			const out = asPoint(from.out ?? from.at)
			const into = asPoint(inOf(to) ?? to.at)
			return `(path.cubic ${points[0]} ${out} ${into} ${points[1]})`
		}
		case 'path': {
			// A place by itself goes straight through, and one with handles curves toward them.
			// What an open path's ends would curve toward beyond them is nothing to it.
			const written = anchors.map((anchor, i) => {
				const into = !closed && i === 0 ? undefined : inOf(anchor)
				const out = !closed && i === anchors.length - 1 ? undefined : anchor.out
				if (into === undefined && out === undefined) return asPoint(anchor.at)
				const handles = [
					...(into === undefined ? [] : [`in: ${asPoint(into)}`]),
					...(out === undefined ? [] : [`out: ${asPoint(out)}`]),
				]
				return `{at: ${asPoint(anchor.at)} ${handles.join(' ')}}`
			})
			return `(path.anchors [${written.join(' ')}]${closed ? ' closed: true' : ''})`
		}
	}
}

/** Which argument of what a pen has drawn the anchor at `index` is, if it is one. */
function argOfAnchor(kind: PenKind, index: number): number | null {
	if (kind === 'path') return null
	return kind === 'cubic' ? index * 3 : index
}

/**
 * `root` with what a pen has drawn through `anchors`, as what it comes to, and each place
 * that snapped to something referring to that, where it is an argument.
 */
/** How many times as long as what it closes over a stroke has to be, to be taken as closing. */
const PENCIL_CLOSES_OVER = 4

/**
 * `root` with a stroke of a pencil through `points`, as a curve of no more than `tolerance`
 * from them, closed if it ends within `closesWithin` of where it began. Null if it went nowhere.
 */
export function pencilled(
	root: LetAST,
	points: readonly Vec[],
	tolerance: number,
	closesWithin: number
): { ast: LetAST; name: string } | null {
	const [first] = points
	if (first === undefined || points.at(-1) === undefined || lengthOf(points) === 0) return null
	const closed = pencilCloses(points, closesWithin)
	const through = (closed ? points.slice(0, -1) : points) as [number, number][]
	return pencilledAs(root, fit(through, { tolerance, closed }))
}

const lengthOf = (points: readonly Vec[]): number =>
	points.reduce(
		(sum, at, i) => (i === 0 ? 0 : sum + Math.hypot(at[0] - points[i - 1]![0], at[1] - points[i - 1]![1])),
		0
	)

/** Whether a stroke through `points` ends where it began, having gone somewhere in between. */
export function pencilCloses(points: readonly Vec[], closesWithin: number): boolean {
	const [first] = points
	const last = points.at(-1)
	if (first === undefined || last === undefined) return false
	return (
		Math.hypot(last[0] - first[0], last[1] - first[1]) <= closesWithin &&
		lengthOf(points) > closesWithin * PENCIL_CLOSES_OVER
	)
}

/** `root`, with a stroke of a pencil that has come to be the curve `path`. */
export function pencilledAs(root: LetAST, path: Path): { ast: LetAST; name: string } {
	const d = toD(path).replace(/-?\d+\.\d+(?:e-?\d+)?/g, n => String(roundedTo(Number(n), FINEST)))
	const name = nameOfKind(root, 'pencil')
	return { ast: withLayerAdded(root, name, parse(`(path.d "${d}")`)), name }
}

export function penned(
	root: LetAST,
	env: Env,
	anchors: readonly Anchor[],
	closed: boolean
): { ast: LetAST; name: string } {
	const kind = penKind(anchors, closed)
	const name = nameOfKind(root, kind)
	let ast: AST = withLayerAdded(root, name, parse(penSource(anchors, closed, kind)))
	anchors.forEach(({ snap }, i) => {
		const arg = argOfAnchor(kind, i)
		if (snap === undefined || arg === null) return
		ast = referred(ast, env, `binding:${name}/arg${arg}`, snap) ?? ast
	})
	return { ast: ast as LetAST, name }
}

const IDENTITY: Mat = [1, 0, 0, 1, 0, 0]

const bare = (ast: AST): AST => (ast.kind === 'meta' ? ast.expr : ast)

export const drawOf = (type: TypeValue | null): string | null =>
	textOf(type?.meta?.get('draw'))

/** What in `value` is to be drawn, by what `type` says of it and what it holds. */
function shapesIn(type: TypeValue | null, value: unknown, row: string): Shape[] {
	const draw = drawOf(type)
	// What is drawn of a path is what is in it, which only a canvas needs to know.
	if (draw !== null) {
		return [
			isStyled(value)
				? { row, draw, value: value.path.path, paint: value.paint }
				: isPath(value)
					? { row, draw, value: value.path }
					: isRect(value)
						? { row, draw, value: outlineOf(value) }
						: { row, draw, value },
		]
	}
	if (type === null || !Array.isArray(value)) return []
	const { shape } = unwrapLazy(type)
	const elementType = (i: number): TypeValue | null =>
		shape.kind === 'vector'
			? shape.element
			: shape.kind === 'tuple'
				? (shape.elements[i] ?? shape.rest ?? null)
				: null
	// What comes first in a vector is in front, so it is drawn last.
	return [...value.entries()].reverse().flatMap(([i, element]) => shapesIn(elementType(i), element, row))
}

/** Turned by `angle` in degrees, around where everything is measured from. */
const turnedBy = ([x, y]: Vec, angle: number): Vec => {
	const [cos, sin] = [Math.cos((angle * Math.PI) / 180), Math.sin((angle * Math.PI) / 180)]
	return [x * cos - y * sin, x * sin + y * cos]
}

/**
 * The box around all of what is at `rows` or in them, along axes turned by `angle`, in those
 * axes. Null if there is nothing there with a size to go around.
 */
export function boundsOfRows(
	shapes: readonly Shape[],
	rows: readonly string[],
	angle = 0
): readonly [Vec, Vec] | null {
	const [cos, sin] = [Math.cos((angle * Math.PI) / 180), Math.sin((angle * Math.PI) / 180)]
	const intoBox: Mat = [cos, -sin, sin, cos, 0, 0]
	let box: [Vec, Vec] | null = null
	for (const { row, draw, value } of shapes) {
		if (!isOutlined(draw) && draw !== 'point') continue
		if (!rows.some(of => row === of || row.startsWith(`${of}/`))) continue
		const [[left, top], [right, bottom]] =
			draw === 'point'
				? [turnedBy(value as Vec, -angle), turnedBy(value as Vec, -angle)]
				: bounds(angle === 0 ? (value as Path) : transform(value as Path, intoBox))
		if (!Number.isFinite(left) || !Number.isFinite(top)) continue
		box =
			box === null
				? [[left, top], [right, bottom]]
				: [
						[Math.min(box[0][0], left), Math.min(box[0][1], top)],
						[Math.max(box[1][0], right), Math.max(box[1][1], bottom)],
					]
	}
	// One place alone has nothing around it.
	return box !== null && box[0][0] === box[1][0] && box[0][1] === box[1][1] ? null : box
}

/** The corners of a box along axes turned by `angle`, on the canvas. */
export const cornersOfBox = ([[left, top], [right, bottom]]: readonly [Vec, Vec], angle = 0): Vec[] =>
	([[left, top], [right, top], [right, bottom], [left, bottom]] as Vec[]).map(at => turnedBy(at, angle))

/** As small as a box can be scaled, as what has gone to nothing has no way back. */
const LEAST_SCALE = 1e-3
/** What an angle goes by, with SHIFT. */
const TURN_STEP = 45
const WAYS = [-1, 0, 1] as const

/**
 * What turns something by the corners of the box around it. A corner goes to where it is pulled,
 * so that taking hold of one does not by itself turn anything, however it stands to what it turns around.
 */
export function cornerTurners(
	[[left, top], [right, bottom]]: readonly [Vec, Vec],
	angle: number,
	turning: Handle
): Handle[] {
	const pivot = turning.pivot!
	const facing = turning.angle ?? 0
	const fromCorner = (to: Vec, by: number): Vec => {
		const [x, y] = turnedBy([to[0] - pivot[0], to[1] - pivot[1]], by)
		return [pivot[0] + x, pivot[1] + y]
	}
	return WAYS.flatMap(wx =>
		WAYS.flatMap((wy): Handle[] => {
			if (wx === 0 || wy === 0) return []
			const at = turnedBy([wx < 0 ? left : right, wy < 0 ? top : bottom], angle)
			const by = facing - (Math.atan2(at[1] - pivot[1], at[0] - pivot[0]) * 180) / Math.PI
			return [
				{
					...turning,
					heldOn: undefined,
					outsideCorner: true,
					at,
					angle: (Math.atan2(wy, wx) * 180) / Math.PI + angle,
					...(turning.turnOf === undefined
						? {}
						: { turnOf: (to: Vec, how?: HandleDrag) => turning.turnOf!(fromCorner(to, by), how) }),
					to(to, from, how) {
						return turning.to(fromCorner(to, by), from, how)
					},
				},
			]
		})
	)
}

/**
 * The handles of the box around something, which is the same for everything, with what is on the
 * sides only for what can go by a different scale each way, as `box` has said.
 */
export function boxHandlesOf([[left, top], [right, bottom]]: readonly [Vec, Vec], box: BoxAnswer): Handle[] {
	const angle = box.angle ?? 0
	const middle: Vec = [(left + right) / 2, (top + bottom) / 2]
	const placeOf = (way: -1 | 0 | 1, low: number, mid: number, high: number): number =>
		way < 0 ? low : way > 0 ? high : mid
	return WAYS.flatMap(wx =>
		WAYS.flatMap((wy): Handle[] => {
			if ((wx === 0 && wy === 0) || (box.even && (wx === 0 || wy === 0))) return []
			const at: Vec = [placeOf(wx, left, middle[0], right), placeOf(wy, top, middle[1], bottom)]
			const opposite: Vec = [placeOf(wx, right, middle[0], left), placeOf(wy, bottom, middle[1], top)]
			const isCorner = wx !== 0 && wy !== 0
			return [
				{
					kind: isCorner ? 'point' : 'arrow',
					name: 'box',
					corner: isCorner,
					grip: !isCorner,
					at: turnedBy(at, angle),
					angle: (Math.atan2(wy, wx) * 180) / Math.PI + angle,
					to(toOnCanvas, _, how) {
						const to = turnedBy(toOnCanvas, -angle)
						const about = how?.symmetric ? middle : opposite
						const along = (i: 0 | 1, way: number): number => {
							const across = at[i] - about[i]
							return way === 0 || across === 0
								? 1
								: Math.max((to[i] - about[i]) / across, LEAST_SCALE)
						}
						const [x, y] = [along(0, wx), along(1, wy)]
						const even = isCorner && (box.even || how?.even)
						const most = Math.max(x, y)
						return box.scaled(even ? most : x, even ? most : y, turnedBy(about, angle))
					},
				},
			]
		})
	)
}

/** What turns all of what is in a box around its middle, by as far as it is pulled round. */
function turningAll([[left, top], [right, bottom]]: readonly [Vec, Vec], box: BoxAnswer): Handle | null {
	const { turned } = box
	if (turned === undefined) return null
	const pivot = turnedBy([(left + right) / 2, (top + bottom) / 2], box.angle ?? 0)
	const turnOf = (to: Vec, how?: HandleDrag): number => {
		const by = (Math.atan2(to[1] - pivot[1], to[0] - pivot[0]) * 180) / Math.PI
		return how?.even ? Math.round(by / TURN_STEP) * TURN_STEP : by
	}
	return {
		kind: 'direction',
		rotates: true,
		across: true,
		// Places that go round come to more than a pointer says, and what lines up should stay so.
		fine: true,
		pivot,
		angle: 0,
		turnOf,
		to: (to, _, how) => turned(turnOf(to, how), pivot),
	}
}

/** The same grip, with the box around what is selected that it has for it, under what is its own. */
export function withBoxHandles<G extends { grip: Grip & { readonly transform: Mat }; rowOf: readonly string[] }>(
	held: G | null,
	shapes: readonly Shape[],
	rows: readonly string[],
	/** How far round what is selected has been turned, where nothing written says that. */
	turn = 0
): G | null {
	const [row] = rows
	const said = held?.grip.box
	if (held === null || row === undefined || said === undefined) return held
	if (held.grip.transform.join() !== IDENTITY.join()) return held
	const several = said.across === true
	const hasItsOwn = !several && held.grip.handles.some(({ rotates, pivot }) => rotates && pivot !== undefined)
	// Along axes that are turned, one scale each way would not be what it looks like.
	const answer: BoxAnswer =
		said.angle === undefined && !hasItsOwn && turn % 360 !== 0 ? { ...said, angle: turn, even: true } : said
	const around = boundsOfRows(shapes, rows, answer.angle ?? 0)
	if (around === null) return held
	const own = held.grip.handles.flatMap(({ at }) => (at === undefined ? [] : [at]))
	// Where it has one of its own already, that says more than a box can.
	const handles = boxHandlesOf(around, answer)
		.map(handle => (several ? { ...handle, across: true } : handle))
		.filter(({ at }) => !own.some(place => Math.hypot(place[0] - at![0], place[1] - at![1]) < SAME_PLACE))
	// What turns it goes to the corners of the box, and what it was held out on goes with it.
	const turning = several
		? (turningAll(around, answer) ?? undefined)
		: (held.grip.handles.find(({ rotates, pivot }) => rotates && pivot !== undefined) ??
			(answer.round ? undefined : (turningAll(around, answer) ?? undefined)))
	const turners = turning ? cornerTurners(around, answer.angle ?? 0, turning) : []
	const kept = held.grip.handles.map(handle => handle !== turning)
	return {
		...held,
		grip: {
			...held.grip,
			box: answer,
			handles: [...handles, ...turners, ...held.grip.handles.filter((_, i) => kept[i])],
			guides: held.grip.guides.filter(guide => guide !== turning?.heldOn),
		},
		rowOf: [...handles.map(() => row), ...turners.map(() => row), ...held.rowOf.filter((_, i) => kept[i])],
	}
}

/** What goes on and on, so is not found by where it is: it is drawn in its place among the layers, and taken from their list. */
const NOT_SHAPES: ReadonlySet<string> = new Set(['solid', 'graphPaper', 'axes'])

export const sceneOf = (root: AST, env: Env): Shape[] =>
	drawnIn(root, env).filter(({ draw }) => !NOT_SHAPES.has(draw))

/**
 * What is hidden of the rows at `rows`, and of what they hold. It is not drawn, but what is
 * selected still has to be seen, to be taken hold of.
 */
export const hiddenShapesOf = (root: AST, env: Env, rows: readonly string[]): Shape[] =>
	rows.length === 0
		? []
		: drawnIn(root, env, true).filter(
				({ row, draw }) =>
					!NOT_SHAPES.has(draw) && rows.some(path => row === path || row.startsWith(`${path}/`))
			)

/**
 * The color of the solid in front of all others, which is what the window goes by and what
 * things are marked on the canvas to be seen on. Null if there is none.
 */
export function solidOf(root: AST, env: Env): string | null {
	const color = drawnIn(root, env)
		.filter(({ draw }) => draw === 'solid')
		.at(-1)?.value
	return typeof color === 'string' ? color : null
}

/** Whether the row at `row` is said of the canvas, so has no fill or line to give it. */
export const isOfCanvasAt = (root: AST, env: Env, row: string): boolean =>
	shapesAtRow(drawnIn(root, env)).get(row)?.some(({ draw }) => NOT_SHAPES.has(draw)) ?? false

export const solidRowsIn = (root: AST, env: Env, hidden: boolean): Shape[] =>
	drawnIn(root, env, hidden).filter(({ draw }) => draw === 'solid')

/** A row of a program that fills the canvas with a color. */
export const solidCall = (color: string): AST => parse(`(solid ${JSON.stringify(color)})`)

export const graphPaperRowsIn = (root: AST, env: Env, hidden: boolean): Shape[] =>
	drawnIn(root, env, hidden).filter(({ draw }) => draw === 'graphPaper')

/** The graph paper the canvas shows, by the last that says so. Null if nothing does. */
export const graphPaperOf = (root: AST, env: Env): GraphPaperValue | null =>
	(graphPaperRowsIn(root, env, false).at(-1)?.value as GraphPaperValue | undefined) ?? null

/** A row of a program that says what of a graph paper to show. */
export const graphPaperCall = (kind: GraphPaperKind): AST => parse(`(graphPaper ${JSON.stringify(kind)})`)

export const axesRowsIn = (root: AST, env: Env, hidden: boolean): Shape[] =>
	drawnIn(root, env, hidden).filter(({ draw }) => draw === 'axes')

/** A row of a program that draws the axes. */
export const axesCall = (): AST => parse('(axes)')

const drawnMemo = [new WeakMap<AST, WeakMap<object, readonly Shape[]>>(), new WeakMap<AST, WeakMap<object, readonly Shape[]>>()] as const
const atRowMemo = new WeakMap<readonly Shape[], ReadonlyMap<string, readonly Shape[]>>()

/** What is drawn in `shapes` by each row, as much is asked of each of a great many rows. */
function shapesAtRow(shapes: readonly Shape[]): ReadonlyMap<string, readonly Shape[]> {
	const known = atRowMemo.get(shapes)
	if (known !== undefined) return known
	const atRow = new Map<string, Shape[]>()
	for (const shape of shapes) {
		const others = atRow.get(shape.row)
		if (others === undefined) atRow.set(shape.row, [shape])
		else others.push(shape)
	}
	atRowMemo.set(shapes, atRow)
	return atRow
}

/**
 * What the program draws, or else what it would if nothing were hidden, of what is. A program
 * is never changed, only replaced, so that this is worked out once for each that is asked about.
 */
function drawnIn(root: AST, env: Env, hidden = false): readonly Shape[] {
	if (env === null) return workedOutDrawn(root, env, hidden)
	const memo = drawnMemo[hidden ? 1 : 0]
	let ofRoot = memo.get(root)
	if (ofRoot === undefined) memo.set(root, (ofRoot = new WeakMap()))
	let shapes = ofRoot.get(env)
	if (shapes === undefined) ofRoot.set(env, (shapes = workedOutDrawn(root, env, hidden)))
	return shapes
}

function workedOutDrawn(root: AST, env: Env, hidden: boolean): readonly Shape[] {
	const visit = (block: AST, blockEnv: Env, parent: string, inHidden: boolean): Shape[] => {
		const node = bare(block)
		// What is drawn is what a block's vector holds, however it is bound. What comes first is
		// in front, as it is on top in a list of layers, so it is drawn last.
		const elements =
			node.kind === 'vec' ? node.elements : node.kind === 'let' ? (layersVectorOf(node)?.vector.elements ?? null) : null
		if (elements === null) return []
		const slots = new Map(viewOf(node, blockEnv).slots.map(slot => [slot.key, slot]))
		return [...elements.entries()].reverse().flatMap(([i, element]) => {
			const name = nameOf(element)
			const key = name !== null ? `binding:${name}` : node.kind === 'vec' ? `${i}` : `element:${i}`
			const slot = slots.get(key)
			if (slot === undefined) return []
			const isOut = inHidden || isHidden(slot.ast)
			if (isOut && !hidden) return []
			const row = parent === '' ? slot.key : `${parent}/${slot.key}`
			if (isGroup(slot.ast) || isVecOfDrawn(slot.ast, slot.env)) return visit(slot.ast, slot.env, row, isOut)
			const board = artboardAt(slot.ast, slot.env)
			if (board !== null) {
				const own: Shape[] = isOut !== hidden ? [] : [artboardShape(row, board.value)]
				const on = viewOf(board.call, slot.env).slots.find(({ key }) => key === `arg${ARTBOARD_LAYERS}`)
				if (on === undefined) return own
				const m = artboardMatrixOf(board.value)
				const clip = board.value.clip ? outlineOfArtboard(board.value) : undefined
				const inner = visit(on.ast, on.env, `${row}/${on.key}`, isOut).map(shape => movedBy(shape, m))
				return [...own, ...(clip === undefined ? inner : inner.map(shape => clippedBy(shape, clip)))]
			}
			if (isOut !== hidden) return []
			const value = evaluate(readByName(slot.ast), slot.env).value
			return shapesIn(infer(readByName(slot.ast), slot.env), value, row)
		})
	}
	const kind = bare(root).kind
	return kind === 'let' || kind === 'vec' ? visit(root, env, '', false) : []
}

/** The call of an artboard that `ast` is, and what it comes to, if it is one. */
function artboardAt(ast: AST, env: Env): { readonly call: CallAST; readonly value: ArtboardValue } | null {
	const node = bare(ast)
	if (node.kind !== 'call') return null
	const head = evaluate(node.head, enterNode(node, env)).value
	if (!makesArtboard(head)) return null
	const { value } = evaluate(readByName(ast), env)
	return isArtboard(value) ? { call: node, value } : null
}

/** Whether the row at `row` is an artboard. */
export const isArtboardRow = (root: AST, env: Env, row: string): boolean => {
	const found = rowAt(root, env, row)
	return found !== null && artboardAt(found.node, found.env) !== null
}

/** The artboard at `row`, as it is, if it is one. */
export function artboardOfRow(root: AST, env: Env, row: string): ArtboardValue | null {
	const found = rowAt(root, env, row)
	if (found === null) return null
	const board = artboardAt(found.node, found.env)
	if (board === null) return null
	// What it is measured in is what is around it, an artboard on an artboard being on that.
	return found.transform.join() === IDENTITY.join() ? board.value : null
}

const artboardMatrixOf = ({ area }: ArtboardValue): Mat => [1, 0, 0, 1, area.origin[0], area.origin[1]]

const outlineOfArtboard = ({ area }: ArtboardValue): Path =>
	rectangle(area.origin, [area.origin[0] + area.size[0], area.origin[1] + area.size[1]])

/** What is drawn of an artboard itself: its area, filled. */
const artboardShape = (row: string, board: ArtboardValue): Shape => ({
	row,
	draw: 'artboard',
	value: outlineOfArtboard(board),
	paint: { ...NO_PAINT, fill: board.fill, stroke: 'none' },
})

/** `shape`, where it is on the canvas once what it is in has been moved by `m`. */
function movedBy(shape: Shape, m: Mat): Shape {
	const clip = shape.clip === undefined ? {} : { clip: transform(shape.clip, m) }
	if (isOutlined(shape.draw)) return { ...shape, value: transform(shape.value as Path, m), ...clip }
	if (shape.draw === 'point') return { ...shape, value: vec2.transformMat2d(shape.value as Vec, m as unknown as mat2d) as unknown as Vec, ...clip }
	if (shape.draw === 'line') {
		const [through, direction] = shape.value as StraightLine
		return { ...shape, value: [vec2.transformMat2d(through, m as unknown as mat2d) as unknown as Vec, direction], ...clip }
	}
	if (shape.draw === 'ray') {
		return { ...shape, value: Ray.transform(shape.value as Ray, m as unknown as mat2d) ?? shape.value, ...clip }
	}
	return { ...shape, ...clip }
}

/** `shape`, cut off by `clip` as well as by whatever it was. */
const clippedBy = (shape: Shape, clip: Path): Shape => ({ ...shape, clip: shape.clip ?? clip })

/**
 * Whether a node is a vector of what each draws something, with no names, as what a spray comes to
 * once it has been worked out. Each is a row of its own, as they are in a group.
 */
export function isVecOfDrawn(ast: AST, env: Env): boolean {
	const node = bare(ast)
	if (node.kind !== 'vec' || node.elements.length === 0) return false
	if (drawOf(infer(readByName(ast), env)) !== null) return false
	return viewOf(node, env).slots.every(({ ast: element, env: elementEnv }) => {
		if (isHidden(element)) return true
		const value = evaluate(readByName(element), elementEnv).value
		return shapesIn(infer(readByName(element), elementEnv), value, '').length > 0
	})
}

/** All that is drawn in the end, in that order: what is on the canvas, and what it is on. */
export const paintedIn = (root: AST, env: Env): readonly Shape[] => drawnIn(root, env)

/** Whether the row at `row` draws something of its own, or would if it were not hidden. */
export const drawsAt = (root: AST, env: Env, row: string): boolean =>
	shapesAtRow(drawnIn(root, env)).has(row) || shapesAtRow(drawnIn(root, env, true)).has(row)

/**
 * Source as it is written now, from when things went by other names: what fills a canvas was a
 * `background`, what is laid over it a `grid` that could say it had nothing to lay, and a stop
 * on a Dubins path four numbers in a row, and lines out from a center a function of their own.
 * A program with its own of those names keeps them.
 */
export function writtenAsNow(source: string): string {
	const renamed = (text: string, old: string, name: string, hiddenAs: string): string =>
		new RegExp(`(?<![\\w.-])${old}\\s*=\\s*\\(=>`).test(text)
			? text
			: text
					.replaceAll(`(${old} "none")`, `#_(${name} ${hiddenAs})`)
					.replaceAll(`(${old} `, `(${name} `)
					.replaceAll(`(${old})`, `(${name})`)
	const num = '-?[\\d.]+(?:e-?\\d+)?'
	const flatRow = new RegExp(`\\[\\s*(${num})\\s+(${num})((?:\\s+${num})*)\\s*\\]`, 'g')
	// Lines out from a center came to a group of them, each with what the whole was styled by.
	const rowOfLines = /\[\s*([^\s\][]+)\s+([^\s\][]+)\s+([^\s\][]+)\s*\]/g
	const round = (n: number): number => Math.round(n * 100) / 100
	const radial = (x: string, y: string, rows: string, styled: (line: string) => string): string => {
		const lines = [...rows.matchAll(rowOfLines)].map(([, angle, from, to], i) => {
			const radians = (Number(angle) * Math.PI) / 180
			const at = (along: string): string =>
				`[${round(Number(x) + Math.cos(radians) * Number(along))} ${round(Number(y) + Math.sin(radians) * Number(along))}]`
			return `line${i + 1} = ${styled(`(path.line ${at(from!)} ${at(to!)})`)}`
		})
		return `[${lines.join(' ')}]`
	}
	const radialCall = `\\(path\\.radial\\s+\\[\\s*(${num})\\s+(${num})\\s*\\]\\s+\\[((?:\\s*\\[\\s*${num}\\s+${num}\\s+${num}\\s*\\])*)\\s*\\]\\)`
	return renamed(renamed(source, 'background', 'solid', '"#ffffff"'), 'grid', 'graphPaper', '"dots"')
		.replace(new RegExp(`\\(style\\s+${radialCall}([^()]*)\\)`, 'g'), (_, x, y, rows, rest) =>
			radial(x, y, rows, line => `(style ${line}${rest})`)
		)
		.replace(new RegExp(radialCall, 'g'), (_, x, y, rows) => radial(x, y, rows, line => line))
		.replaceAll('(path.style ', '(style ')
		.replaceAll('/topLeft', '/origin')
		.replaceAll('topLeft=', 'origin=')
		.replace(/\(path\.dubinsChain\s+\[((?:\s*\[[^[\]()]*\])*)\s*\]/g, (call, rows: string) =>
			call.replace(rows, rows.replace(flatRow, '[[$1 $2]$3]'))
		)
}

/**
 * A program as it is written now, with what it draws as named elements of the vector it ends
 * with, `main = [...]`, which is what it comes to. Before, a program drew its bindings, in
 * their order, or those its vector held by name; and a group was a block like that. What a
 * vector held by name goes there under that name, a binding that drew goes there too, what
 * was drawn last coming first, and what only is bound stays where it was.
 */
export function withLayersFromOrder(root: AST, env: Env): AST {
	const holding = (block: LetAST, blockEnv: Env): { kept: (readonly [string, AST])[]; held: AST[] } => {
		const inside = pushLetFrame(block, blockEnv)
		const values = new Map(block.bindings)
		// What the block's own vector holds of its bindings, once, by name, goes there.
		const elements = block.body?.kind === 'vec' ? block.body.elements : null
		const taken = new Set<string>()
		const held: AST[] = []
		if (elements !== null) {
			for (const element of elements) {
				const name = element.kind === 'sym' && values.has(element.name) && !taken.has(element.name) ? element.name : null
				if (name === null) {
					held.push(asGroup(element, inside))
					continue
				}
				taken.add(name)
				held.push(named(name, asGroup(values.get(name)!, inside)))
			}
		} else if (block.body === null) {
			// What drew went by the order of the bindings, the last on top, which is first now.
			for (const [name, value] of [...block.bindings].reverse()) {
				const node = bare(value)
				const read = readByName(value)
				const draws =
					(node.kind === 'let' && node.body === null) ||
					shapesIn(infer(read, inside), evaluate(read, inside).value, name).length > 0
				if (!draws) continue
				taken.add(name)
				held.push(named(name, asGroup(value, inside)))
			}
		}
		return { kept: block.bindings.filter(([name]) => !taken.has(name)), held }
	}
	/** A group from before, a block holding what it draws, as the vector it is now. */
	const asGroup = (value: AST, at: Env): AST => {
		const node = bare(value)
		if (node.kind !== 'let' || (node.body !== null && node.body.kind !== 'vec') || layersVectorOf(node)?.name) return value
		const { kept, held } = holding(node, at)
		const group = kept.length === 0 ? new VecAST(held) : new LetAST(kept, new VecAST(held))
		return value.kind === 'meta' ? new MetaAST(value.metadata, group) : group
	}
	const node = bare(root)
	if (node.kind !== 'let' && node.kind !== 'vec') return root
	if (node.kind === 'let') {
		const layered = layersVectorOf(node)
		if (layered !== null && layered.name !== null) return root
		if (node.body !== null && node.body.kind !== 'vec') return root
	}
	const { kept, held } = node.kind === 'vec' ? { kept: [], held: [...node.elements] } : holding(node, env)
	const program = new LetAST([...kept, [MAIN, node.kind === 'vec' ? root : new VecAST(held)]], null)
	// What a path from the root went to by its name is in what the program draws now.
	return held.reduce<AST>((moved, element) => {
		const name = nameOf(element)
		return name === null ? moved : withPathsMoved(moved, env, [name], [MAIN, name])
	}, program)
}

/** What a name comes to, in the program, however many names away, or a path to a call. */
function follow(start: AST, startEnv: Env): { node: AST; env: Env } | null {
	let node = start
	let env = startEnv
	for (let reached = bare(node); reached.kind === 'sym' || reached.kind === 'path'; reached = bare(node)) {
		const target =
			reached.kind === 'sym' ? lookupBareName(reached.name, env) : pathTarget(reached.segments, env)
		if (target === null || 'message' in target || target.ast === node) {
			return reached.kind === 'sym' ? null : { node, env }
		}
		// Where else a path goes is a place of its own, which is itself what can be held.
		if (reached.kind === 'path' && bare(target.ast).kind !== 'call') return { node, env }
		node = target.ast
		env = target.env
	}
	return { node, env }
}

/**
 * What a call is given, as what it takes: what failed to come to anything is the default,
 * in each place, as it is for the call itself, so that there is always something to hold.
 */
const argsOf = (call: CallAST, env: Env) => {
	const inside = enterNode(call, env)
	const head = evaluate(call.head, inside).value
	const { paramTypes = [], variadicTail } = (isTypedHostFn(head) ? head : {}) as Partial<TypedHostFn>
	const names = call.kwargs === undefined ? [] : (callParameters(call, inside)?.names ?? [])
	return {
		inside,
		head,
		args: Array.from({ length: Math.max(call.args.length, names.length) }, (_, i) => {
			const arg = call.args[i] ?? call.kwargs?.get(names[i]!)
			if (arg === undefined) return undefined
			const { value } = evaluate(arg, inside)
			const type = paramTypes[i] ?? variadicTail
			return type === undefined ? value : coerceTo(type, value)
		}),
	}
}

/** How `start` can be taken hold of, or null if it is nothing of the kind. */
function gripAtNode(start: AST, startEnv: Env, root: AST, rootEnv: Env): Grip | null {
	const found = follow(start, startEnv)
	if (found === null) return null
	const { node, env } = found
	const call = bare(node)
	if (call.kind === 'call') {
		const { inside, head, args } = argsOf(call, env)
		const grip = gripOf(
			head,
			args,
			i => {
				const arg = call.args[i]
				const inner = arg === undefined ? null : gripAtNode(arg, inside, root, rootEnv)
				return inner === null ? null : under(i, inner)
			},
			i => {
				const arg = call.args[i]
				return arg !== undefined && isProportional(arg, inside)
			},
			i => {
				// What is not said yet can be said. Otherwise, only working it out can tell.
				const arg = call.args[i]
				const value = arg === undefined ? null : evaluate(arg, inside).value
				return typeof value !== 'number' || solve(root, rootEnv, arg!, value + 1).ast !== null
			}
		)
		if (grip !== null) return grip
	}
	const value = evaluate(readByName(node), env).value
	if (drawOf(infer(readByName(node), env)) === 'point') return gripOfPoint(value as Vec)
	return call.kind === 'call' ? NO_GRIP : null
}

/** The node of a row, and where the program's coordinates are for it. */
function rowAt(
	root: AST,
	env: Env,
	row: string
): { node: AST; env: Env; transform: Mat } | null {
	let node = root
	let nodeEnv = env
	let transform: Mat = IDENTITY
	for (const key of row.split('/').filter(part => part !== '')) {
		const call = bare(node)
		const arg = /^arg(\d+)$/.exec(key)?.[1]
		if (call.kind === 'call' && arg !== undefined) {
			const { head, args } = argsOf(call, nodeEnv)
			const within = withinArg(head, Number(arg), args)
			if (within !== null) transform = mat2d.mul(transform, within) as unknown as Mat
		}
		const slot = viewOf(node, nodeEnv).slots.find(s => s.key === key)
		if (slot === undefined) return null
		node = slot.ast
		nodeEnv = slot.env
	}
	return { node, env: nodeEnv, transform }
}

/** The path that the row at `row` comes to, if it does, with where that is on the canvas. */
export function pathOfRow(
	root: AST,
	env: Env,
	row: string
): { readonly path: Path; readonly transform: Mat } | null {
	const found = rowAt(root, env, row)
	if (found === null) return null
	const { value } = evaluate(readByName(found.node), found.env)
	const path = isStyled(value) ? value.path.path : isPath(value) ? value.path : null
	return path === null ? null : { path, transform: found.transform }
}

/** The row of what the row at `row` is, past the style it is only given and the names it goes by. */
export function rowWorkedOn(root: AST, env: Env, row: string): string {
	const seen = new Set([row])
	let at = row
	for (;;) {
		const next = referenceTargetOf(root, env, at) ?? paintedRow(root, env, at)
		if (seen.has(next)) return at
		seen.add(next)
		at = next
	}
}

/** The paths that what the row at `row` comes to is made from, which is where to go into it. */
export function innerPathsOf(root: AST, env: Env, row: string): readonly string[] {
	const at = rowWorkedOn(root, env, row)
	const found = rowAt(root, env, at)
	if (found === null || bare(found.node).kind !== 'call') return []
	return viewOf(found.node, found.env)
		.slots.filter(({ key }) => /^arg\d+$/.test(key))
		.map(({ key }) => `${at}/${key}`)
		.filter(inner => pathOfRow(root, env, inner) !== null)
}

/**
 * How the row at `row` can be taken hold of. A row that only refers to another has
 * the handles of that one, as moving it can only mean moving that.
 */
export function gripAt(
	root: AST,
	env: Env,
	row: string
): (Grip & { readonly transform: Mat }) | null {
	const found = rowAt(root, env, row)
	if (found === null) return null
	const grip = gripAtNode(found.node, found.env, root, env)
	return grip === null ? null : { ...grip, transform: found.transform }
}

/** What is only there to see by and to refer to, whose handles are all there is to see of it. */
export const isGuide = (draw: string): boolean =>
	draw === 'point' || draw === 'line' || draw === 'ray' || draw === 'frame'

/**
 * `gripped`, with the handles of the guides among `shapes` after its own, as they can be taken
 * hold of whatever is selected. Those of `rows` are in it already, and only those that can be
 * reached and are in the same coordinates can be with it. A button is for when it is selected.
 */
export function withGuideHandles(
	gripped: { grip: Grip & { readonly transform: Mat }; rowOf: readonly string[] } | null,
	root: AST,
	env: Env,
	shapes: readonly Shape[],
	rows: readonly string[],
	isReachable: (row: string) => boolean
): { grip: Grip & { readonly transform: Mat }; rowOf: readonly string[] } | null {
	const transform = gripped?.grip.transform ?? IDENTITY
	const guides = [...new Set(shapes.filter(({ draw }) => isGuide(draw)).map(({ row }) => row))]
		.filter(row => !rows.includes(row) && isReachable(row))
		.flatMap(row => {
			const grip = gripAt(root, env, row)
			if (grip === null || grip.transform.join() !== transform.join()) return []
			return grip.handles.filter(({ kind }) => kind !== 'button').map(handle => ({ row, handle }))
		})
	if (guides.length === 0) return gripped
	return {
		grip: {
			...(gripped?.grip ?? { guides: [], transform }),
			handles: [...(gripped?.grip.handles ?? []), ...guides.map(({ handle }) => handle)],
		},
		rowOf: [...(gripped?.rowOf ?? []), ...guides.map(({ row }) => row)],
	}
}

/**
 * `gripped` for a tool that goes by the points of a path, with only what is for that, or for one
 * that goes by the whole of things, with none of it. The rest is in the way of each.
 */
export function gripOfPointsOrNot<G extends { grip: Grip; rowOf: readonly string[] }>(gripped: G | null, ofPoints: boolean): G | null {
	if (gripped === null) return null
	const handles = gripped.grip.handles.map((handle, i) => ({ handle, row: gripped.rowOf[i]! }))
	const kept = handles.filter(({ handle }) => (handle.ofPoints === true) === ofPoints)
	// What is between the points goes under them, for them to be seen and to be reached for.
	const inOrder = [...kept.filter(({ handle }) => handle.segment), ...kept.filter(({ handle }) => !handle.segment)]
	return {
		...gripped,
		grip: {
			...gripped.grip,
			handles: inOrder.map(({ handle }) => handle),
			guides: gripped.grip.guides.filter(guide => isGuideOfPoints(guide) === ofPoints),
		},
		rowOf: inOrder.map(({ row }) => row),
	}
}

/** `gripped` for a tool that draws, which goes on from the points of a path, and has no use for what is between them. */
export function gripWithoutSegments<G extends { grip: Grip; rowOf: readonly string[] }>(gripped: G | null): G | null {
	if (gripped === null) return null
	const kept = gripped.grip.handles.map(handle => handle.segment === undefined)
	return {
		...gripped,
		grip: { ...gripped.grip, handles: gripped.grip.handles.filter((_, i) => kept[i]) },
		rowOf: gripped.rowOf.filter((_, i) => kept[i]),
	}
}

/** Some of the points and segments of a row, as `Handle.vertex` and `Handle.segment` call them. */
export interface PartsOfRow {
	readonly row: string
	readonly parts: readonly string[]
}

/** The corners around `chosen`, going by the points that there are of them. Null if that is nothing. */
function boxOfParts(grips: readonly { handles: readonly Handle[]; parts: readonly string[] }[]): readonly [Vec, Vec] | null {
	const places = grips.flatMap(({ handles, parts }) =>
		handles.flatMap(({ vertex, segment, ends, at }): Vec[] => {
			if (vertex !== undefined && parts.includes(vertex) && at !== undefined) return [at]
			return segment !== undefined && parts.includes(segment) && ends ? [...ends] : []
		})
	)
	if (places.length === 0) return null
	return [
		[Math.min(...places.map(([x]) => x)), Math.min(...places.map(([, y]) => y))],
		[Math.max(...places.map(([x]) => x)), Math.max(...places.map(([, y]) => y))],
	]
}

/** What has them go where `map` says, of each row, by a handle that can say so. */
function changesOfParts(
	grips: readonly { row: string; handles: readonly Handle[]; parts: readonly string[] }[],
	map: (at: Vec) => Vec
): Change[] {
	return grips.flatMap(({ row, handles, parts }) => {
		const handle = handles.find(({ vertex, segment }) => parts.includes(vertex ?? segment ?? ''))
		if (handle === undefined) return []
		return handle.to([0, 0], [0, 0], { mapping: { parts, map } }).map(change => ({ ...change, row }))
	})
}

/**
 * `gripped`, for a tool that goes by points, with the box around those of them that are `chosen`,
 * to scale and turn them by, if there is more than one place to go around.
 */
export function withBoxOfParts<G extends { grip: Grip & { readonly transform: Mat }; rowOf: readonly string[] }>(
	gripped: G | null,
	chosen: readonly PartsOfRow[]
): (G & { readonly around: readonly [Vec, Vec] | null }) | null {
	if (gripped === null) return null
	const none = { ...gripped, around: null }
	const [first] = chosen
	if (first === undefined || gripped.grip.transform.join() !== IDENTITY.join()) return none
	const grips = chosen.map(({ row, parts }) => ({
		row,
		parts,
		handles: gripped.grip.handles.filter((_, i) => gripped.rowOf[i] === row),
	}))
	const around = boxOfParts(grips)
	if (around === null) return none
	const [[left, top], [right, bottom]] = around
	if (left === right && top === bottom) return none
	const answer: BoxAnswer = {
		even: false,
		scaled: (x, y, [ax, ay]) => changesOfParts(grips, ([px, py]) => [ax + (px - ax) * x, ay + (py - ay) * y]),
		turned: (by, [ax, ay]) => {
			const [cos, sin] = [Math.cos((by * Math.PI) / 180), Math.sin((by * Math.PI) / 180)]
			return changesOfParts(grips, ([px, py]) => [ax + (px - ax) * cos - (py - ay) * sin, ay + (px - ax) * sin + (py - ay) * cos])
		},
	}
	const box = boxHandlesOf(around, answer).map(handle => ({ ...handle, across: true }))
	const turning = turningAll(around, answer)
	const turners = turning ? cornerTurners(around, 0, turning) : []
	const added = [...box, ...turners]
	return {
		...gripped,
		around,
		grip: { ...gripped.grip, handles: [...gripped.grip.handles, ...added] },
		rowOf: [...gripped.rowOf, ...added.map(() => first.row)],
	}
}

/** As fine as what comes of a number typed is written, for what is worked out not to show how. */
const TYPED_STEP = 1e-6

/** What the numbers of a box are said of: all of some rows, or only some parts of them. */
export type Measured = { readonly rows: readonly string[] } | { readonly parts: readonly PartsOfRow[] }

const partsWithHandles = (root: AST, env: Env, parts: readonly PartsOfRow[]) =>
	parts.map(({ row, parts: own }) => ({ row, parts: own, handles: gripAt(root, env, row)?.handles ?? [] }))

/** The corners around what is `measured`. Null if there is nothing there to go by. */
export function boxMeasured(root: AST, env: Env, measured: Measured): readonly [Vec, Vec] | null {
	if ('parts' in measured) return boxOfParts(partsWithHandles(root, env, measured.parts))
	const box = boundsOfRows(sceneOf(root, env), measured.rows)
	if (box !== null) return box
	// One place alone has nothing around it, and is still somewhere.
	const [only] = sceneOf(root, env).filter(({ row }) => measured.rows.includes(row))
	return only?.draw === 'point' ? [only.value as Vec, only.value as Vec] : null
}

/** Whether what is `measured` can go by a size, as what is only one place cannot be, and what cannot be scaled. */
export function hasSizeMeasured(root: AST, env: Env, measured: Measured): boolean {
	const box = boxMeasured(root, env, measured)
	if (box === null || (box[0][0] === box[1][0] && box[0][1] === box[1][1])) return false
	return 'parts' in measured || gripOfRows(root, env, measured.rows)?.grip.box !== undefined
}

/**
 * `root`, with what is `measured` having its box at `x` `y`, of `width` by `height`. What is 0 across
 * goes no other way than where it is. What can only go by one scale goes by the one of them that says.
 */
export function withBoxMeasured(
	root: AST,
	env: Env,
	measured: Measured,
	[x, y, width, height]: readonly [number, number, number, number]
): AST | null {
	const box = boxMeasured(root, env, measured)
	if (box === null) return null
	const [[left, top], [right, bottom]] = box
	const [wasWidth, wasHeight] = [right - left, bottom - top]
	const scaleX = wasWidth === 0 ? 1 : width / wasWidth
	const scaleY = wasHeight === 0 ? 1 : height / wasHeight
	if ('parts' in measured) {
		const changes = changesOfParts(partsWithHandles(root, env, measured.parts), ([px, py]) => [x + (px - left) * scaleX, y + (py - top) * scaleY])
		return changes.length === 0 ? null : changed(root, env, measured.parts[0]!.row, roundedChanges(changes, TYPED_STEP)).ast
	}
	let next: AST | null = root
	const [first] = measured.rows
	if (first === undefined) return null
	if (scaleX !== 1 || scaleY !== 1) {
		const answer = gripOfRows(next, env, measured.rows)?.grip.box
		if (answer === undefined) return null
		const one = scaleX !== 1 ? scaleX : scaleY
		const scaled = answer.even ? answer.scaled(one, one, [left, top]) : answer.scaled(scaleX, scaleY, [left, top])
		next = changed(next, env, first, roundedChanges(scaled, TYPED_STEP)).ast
	}
	const moved: Vec = [x - left, y - top]
	if (moved[0] === 0 && moved[1] === 0) return next
	for (const row of measured.rows.flatMap(row => rowsPaintedBy(root, env, row))) {
		if (next === null) return null
		const move = gripAt(next, env, row)?.move
		if (move !== undefined) next = changed(next, env, row, roundedChanges(move(moved), TYPED_STEP)).ast
	}
	return next
}

const SAME_NUMBER = 1e-4

/** Which of X, Y, width and height are any different in `after` from `before`, as those are all that a drag is about. */
export function numbersDifferent(before: readonly [Vec, Vec], after: readonly [Vec, Vec]): number[] {
	const numbers = ([[left, top], [right, bottom]]: readonly [Vec, Vec]): number[] => [left, top, right - left, bottom - top]
	const was = numbers(before)
	return numbers(after).flatMap((value, i) => (Math.abs(value - was[i]!) > SAME_NUMBER ? [i] : []))
}

/**
 * How far across and down a box is what stayed where it was, from `before` to `after`: what a size
 * is said from, when a side has been pulled. The middle, if both ways went, as they do with OPT.
 */
export function whatStayed([[left, top], [right, bottom]]: readonly [Vec, Vec], [[l, t], [r, b]]: readonly [Vec, Vec]): Vec {
	const along = (from: number, to: number, a: number, c: number): number => {
		const [movedFrom, movedTo] = [Math.abs(a - from) > SAME_NUMBER, Math.abs(c - to) > SAME_NUMBER]
		return movedFrom && movedTo ? 0.5 : movedFrom ? 1 : 0
	}
	return [along(left, right, l, r), along(top, bottom, t, b)]
}

/**
 * Where the numbers of a box go: by what was pulled, on the side of it that it goes out toward, or
 * else at its last corner. `shown` is which of X, Y, width and height there are.
 */
export function placeOfNumbers(
	[[left, top], [right, bottom]]: readonly [Vec, Vec],
	shown: readonly number[],
	corner?: Vec,
	stays?: Vec
): { readonly at: Vec; readonly side: DimensionSide | 'corner' } {
	if (corner) {
		return {
			at: [left + corner[0] * (right - left), top + corner[1] * (bottom - top)],
			side: corner[1] === 0 ? 'above' : 'below',
		}
	}
	if (stays === undefined) return { at: [right, bottom], side: 'corner' }
	const [middleX, middleY] = [(left + right) / 2, (top + bottom) / 2]
	if (shown.includes(2)) return stays[0] === 1 ? { at: [left, middleY], side: 'left' } : { at: [right, middleY], side: 'right' }
	return stays[1] === 1 ? { at: [middleX, top], side: 'above' } : { at: [middleX, bottom], side: 'below' }
}

/**
 * The box with its corner `corner` of the way across and down at `to`, what `stays` of the way
 * staying where it is, for those to be what it goes by: it goes no further than to nothing.
 */
export function boxWithCornerAt(
	[[left, top], [right, bottom]]: readonly [Vec, Vec],
	corner: Vec,
	stays: Vec,
	to: Vec
): [number, number, number, number] {
	const along = (from: number, size: number, c: number, s: number, at: number): [number, number] => {
		const fixed = from + s * size
		const next = Math.max((at - fixed) / (c - s), 0)
		return [fixed - s * next, next]
	}
	const [x, width] = along(left, right - left, corner[0], stays[0], to[0])
	const [y, height] = along(top, bottom - top, corner[1], stays[1], to[1])
	return [x, y, width, height]
}

/** What is called, of the points of each of `rows`, for those from `a` to `b` on the canvas. */
export function pointsWithin(root: AST, env: Env, rows: readonly string[], a: Vec, b: Vec): { readonly row: string; readonly points: readonly string[] }[] {
	const [left, right] = a[0] < b[0] ? [a[0], b[0]] : [b[0], a[0]]
	const [top, bottom] = a[1] < b[1] ? [a[1], b[1]] : [b[1], a[1]]
	return rows.flatMap(row => {
		const grip = gripAt(root, env, row)
		if (grip === null) return []
		const [ma, mb, mc, md, me, mf] = grip.transform
		const points = grip.handles.flatMap(({ vertex, at }) => {
			if (vertex === undefined || at === undefined) return []
			const [x, y] = [ma * at[0] + mc * at[1] + me, mb * at[0] + md * at[1] + mf]
			return x >= left && x <= right && y >= top && y <= bottom ? [vertex] : []
		})
		return points.length === 0 ? [] : [{ row, points }]
	})
}

/**
 * What several say to a box around all of them, if all of them have something to say, each
 * change being of the row it comes from. It goes along the canvas, as they need not go along
 * each other, so that what goes along its own axes can only go by one scale.
 */
function boxOfRows(grips: readonly { row: string; grip: Grip }[]): { box: BoxAnswer } | Record<string, never> {
	const answers = grips.flatMap(({ row, grip: { box } }) => (box === undefined ? [] : [{ row, box }]))
	if (answers.length !== grips.length) return {}
	const ofRow = (row: string, changes: readonly Change[]): Change[] =>
		changes.map(change => ({ ...change, row }))
	return {
		box: {
			across: true,
			even: answers.some(({ box }) => box.even || (box.angle ?? 0) !== 0),
			scaled: (x, y, about) => answers.flatMap(({ row, box }) => ofRow(row, box.scaled(x, y, about))),
			...(answers.every(({ box }) => box.turned !== undefined)
				? {
						turned: (by: number, about: Vec) =>
							answers.flatMap(({ row, box }) => ofRow(row, box.turned!(by, about))),
					}
				: {}),
		},
	}
}

/**
 * How `rows` can be taken hold of at once: the handles of all of them, and whose each is. Null
 * if they have no coordinates in common to put those in, as they can then only be moved. A group
 * goes as one, so that what is in it says what the box can do, and shows no handles of its own.
 */
export function gripOfRows(
	root: AST,
	env: Env,
	rows: readonly string[]
): { grip: Grip & { readonly transform: Mat }; rowOf: readonly string[] } | null {
	const hasGroup = rows.some(row => holdsRows(root, env, row))
	let wholly = true
	const grips = rows.flatMap(row => {
		const isGroup = holdsRows(root, env, row)
		return (isGroup ? rowsPaintedBy(root, env, row) : [row]).flatMap(part => {
			const grip = gripAt(root, env, part)
			if (grip === null) {
				// Something that cannot be scaled with the rest would be left behind by the box.
				wholly = false
				return []
			}
			return [
				{
					row: part,
					grip: isGroup
						? { transform: grip.transform, handles: [], guides: [], ...(grip.box ? { box: grip.box } : {}) }
						: grip,
				},
			]
		})
	})
	const [first, second] = grips
	if (first === undefined) return null
	const rowOf = grips.flatMap(({ row, grip }) => grip.handles.map(() => row))
	if (second === undefined && !hasGroup) return { grip: first.grip, rowOf }
	const transform = first.grip.transform
	if (grips.some(({ grip }) => grip.transform.join() !== transform.join())) return null
	const sources = grips.flatMap(({ grip }) => grip.sources ?? [])
	return {
		grip: {
			transform,
			handles: grips.flatMap(({ grip }) => grip.handles),
			guides: grips.flatMap(({ grip }) => grip.guides),
			...(sources.length > 0 ? { sources } : {}),
			...(wholly ? boxOfRows(grips) : {}),
		},
		rowOf,
	}
}

/**
 * What a double click at `held` selects, having had `before` selected: all that it is made
 * from, or, if it is one of several selected with nothing inside of it, only that one.
 */
export function rowsInside(
	root: AST,
	env: Env,
	held: string,
	before: readonly string[]
): readonly string[] {
	const within = before.length === 1 && before[0]!.startsWith(`${held}/`) ? before[0]! : held
	const inner = innerPathsOf(root, env, within)
	if (inner.length > 0) return inner
	return before.length > 1 && before.includes(held) ? [held] : []
}

const shown = (n: number): string => String(Math.round(n * 1000) / 1000)

const isNumbers = (value: unknown): value is number[] =>
	Array.isArray(value) && value.every(element => typeof element === 'number')

/**
 * What `changes` have made of the row at `row`, a line to each thing that changed: what
 * it is called, and what it is now. What cannot be told as numbers is left out.
 */
export function readoutOf(
	root: AST,
	env: Env,
	row: string,
	changes: readonly Change[],
	before?: AST
): string[] {
	const lines = linesOf(root, env, row, changes)
	if (before === undefined) return lines
	// What is not any different goes unsaid, unless nothing is yet.
	const was = new Set(linesOf(before, env, row, changes))
	const different = lines.filter(line => !was.has(line))
	return different.length > 0 ? different : lines
}

/** What `route` comes to in the row at `row`: what it is called, wants, and is now. */
function readAt(
	root: AST,
	env: Env,
	row: string,
	route: readonly number[]
): {
	label: string
	expected: TypeValue | null
	options: NumberOptions
	value: unknown
	proportional: boolean
} | null {
	const found = rowAt(root, env, row)
	if (found === null) return null
	let label = row.split('/').at(-1)!.replace(/^binding:/, '')
	let expected: TypeValue | null = null
	let options: NumberOptions = {}
	let at = follow(found.node, found.env)
	for (const [i, arg] of route.entries()) {
		if (at === null) return null
		const slot = viewOf(bare(at.node), at.env).slots.find(s => s.key === `arg${arg}`)
		if (slot === undefined) return null
		label = titleOf(slot)
		expected = slot.expected
		options = numberOptionsAt(slot)
		at = i === route.length - 1 ? { node: slot.ast, env: slot.env } : follow(slot.ast, slot.env)
	}
	if (at === null) return null
	return {
		label,
		expected,
		options,
		value: evaluate(readByName(at.node), at.env).value,
		proportional: isProportional(at.node, at.env),
	}
}

/** Whether a row is a block with nothing to return. */
export function isGroupRow(root: AST, env: Env, row: string): boolean {
	const node = rowAt(root, env, row)?.node
	if (!node) return false
	return isGroup(node)
}

/** Whether a row goes as what it holds does, each being a row of its own, having none of its own. */
export function holdsRows(root: AST, env: Env, row: string): boolean {
	const found = rowAt(root, env, row)
	return found !== null && (isGroup(found.node) || isVecOfDrawn(found.node, found.env))
}

/**
 * What taking hold of what is drawn at `row` takes hold of: the outermost group around it, which
 * goes as one. A group that has something in it selected has been gone into, and is left to that,
 * and what is isolated is as far out as anything goes.
 */
export function rowTakenAt(
	root: AST,
	env: Env,
	row: string,
	selected: readonly string[],
	isolated: string | null = null
): string {
	const keys = row.split('/')
	const first = isolated === null ? 1 : isolated.split('/').length + 1
	for (let i = first; i < keys.length; i++) {
		const around = keys.slice(0, i).join('/')
		const isInto = selected.some(other => other.startsWith(`${around}/`))
		// What an artboard holds is not a group: what is on it is taken hold of each by itself.
		const isOnArtboard = keys[i - 1] === `arg${ARTBOARD_LAYERS}` && isArtboardRow(root, env, keys.slice(0, i - 1).join('/'))
		if (!isInto && !isOnArtboard && holdsRows(root, env, around)) return around
	}
	return row
}

/** The row in `group` that what is drawn at `row` is, or is in. */
export const rowInGroup = (group: string, row: string): string =>
	`${group}/${row.slice(group.length + 1).split('/')[0]}`

/** Whether `row` is `of`, or is somewhere in it. */
export const isWithin = (row: string, of: string): boolean => row === of || row.startsWith(`${of}/`)

/**
 * Whether what is drawn at `row` has nothing to do with what is isolated, the last of the rows that
 * have been gone through to get there: it is neither in that, nor what any of them is part of, as
 * what a path is made from is seen for what it makes, however far away it is written.
 */
export function isOutside(row: string, gone: readonly string[]): boolean {
	const isolated = gone.at(-1)
	return isolated !== undefined && !isWithin(row, isolated) && !gone.some(through => isWithin(through, row))
}

/** Whether there is an inside to a row to go to: a group, or a path made from others. */
export const canIsolate = (root: AST, env: Env, row: string): boolean =>
	holdsRows(root, env, row) || innerPathsOf(root, env, row).length > 0

/**
 * What a double click at `held` comes to: what to select, and what it has gone into, if anything,
 * which for a group is that group, by what is drawn at `drawnRow`, and for a path what it is made
 * of. Null if there is nothing for it to do.
 */
export function diveAt(
	root: AST,
	env: Env,
	held: string,
	drawnRow: string | undefined,
	before: readonly string[]
): { readonly rows: readonly string[]; readonly isolated: string | null } | null {
	if (drawnRow !== undefined && drawnRow.startsWith(`${held}/`) && holdsRows(root, env, held)) {
		return { rows: [rowInGroup(held, drawnRow)], isolated: held }
	}
	const rows = rowsInside(root, env, held, before)
	const [first] = rows
	if (first === undefined) return null
	return { rows, isolated: first === held ? null : first.slice(0, first.lastIndexOf('/')) }
}

/** What is listed in a row, as the project lists it: what is shown whole in it, where it is written. */
export function rowsListedIn(root: AST, env: Env, row: string): string[] {
	const found = rowAt(root, env, row)
	if (found === null) return []
	return listedSlots(found.node, found.env, SHOWN_WHOLE).map(({ key }) => `${row}/${key}`)
}

/** What a row with no name of its own is called: what makes it, past its style, or the name it refers to. */
export function labelOfRow(root: AST, env: Env, row: string): string | null {
	const found = rowAt(root, env, row)
	return found === null ? null : layerLabelOf(found.node, found.env)
}

/** All that there is to select at once, from where it is isolated, as a press would take it. */
export function rowsToTake(root: AST, env: Env, isolated: string | null): string[] {
	if (isolated !== null && !holdsRows(root, env, isolated)) return [...innerPathsOf(root, env, isolated)]
	const drawnInside = sceneOf(root, env).filter(({ row }) => isolated === null || isWithin(row, isolated))
	return [...new Set(drawnInside.map(({ row }) => rowTakenAt(root, env, row, [], isolated)))]
}

/** What a row comes to, past the style it is only given. */
export function valueOfRow(root: AST, env: Env, row: string): unknown {
	const found = rowAt(root, env, paintedRow(root, env, row))
	return found && evaluate(readByName(found.node), found.env).value
}

/** Where one number is in a row: an argument, and which of it, if it is a vector. */
export interface DimensionPlace {
	readonly route: readonly number[]
	readonly index?: number
	/** What it takes for it to be `value`, if that is more than only the number itself. */
	readonly set?: (value: number) => readonly Change[]
}

/** A number a program says, to read and to type, wherever it is that says it. */
export interface Dimension extends DimensionPlace {
	readonly label: string
	readonly value: number
	/** It is worked out from something, rather than being written as a number. */
	readonly expression?: boolean
	readonly options: NumberOptions
	/** How many numbers the vector it is one of has. */
	readonly length: number
}

const pathOfPlace = (row: string, { route, index }: DimensionPlace): string =>
	[row, ...route.map(arg => `arg${arg}`), ...(index === undefined ? [] : [index])].join('/')

/**
 * `root`, with the number at a place being what `text` says, as code, or what is wrong with
 * that: it has to come to a number, without anything else coming to nothing. A `=` in front
 * of it is only a way to begin.
 */
export function withExpressionAt(
	root: AST,
	env: Env,
	row: string,
	place: DimensionPlace,
	text: string
): { ast: AST } | { problem: string } {
	let written: AST
	try {
		written = parse(text.replace(/^\s*=/, ''))
	} catch (error) {
		return { problem: (error as Error).message }
	}
	const reached = reach(root, env, pathOfPlace(row, place))
	const last = reached?.chain.at(-1)
	if (!reached || !last) return { problem: 'this is not written anywhere it can be replaced' }
	const ast = withParent(reached.chain, last.replace(written))
	if (errorsIn(ast, env) > errorsIn(root, env)) return { problem: 'that cannot be worked out' }
	const { value } = evaluate(written, last.env)
	return typeof value === 'number' && Number.isFinite(value)
		? { ast }
		: { problem: 'that does not come to a number' }
}

/** Whether the number at a place is worked out from something else. */
function isExpressionAt(root: AST, env: Env, row: string, place: DimensionPlace): boolean {
	const last = reach(root, env, pathOfPlace(row, place))?.chain.at(-1)
	if (last !== undefined) return bare(last.ast).kind !== 'lit'
	// A part of what is not written out, as a vector that is all a reference, is worked out with the rest of it.
	if (place.index === undefined) return false
	const whole = reach(root, env, pathOfPlace(row, { route: place.route }))?.chain.at(-1)
	return whole !== undefined && bare(whole.ast).kind !== 'vec' && bare(whole.ast).kind !== 'lit'
}

/**
 * The parts of the row at `row` that a handle is exactly, to select by clicking it: the place
 * it is of, or what it says it is, or the one number that it is about, or the one thing that
 * dragging it changes. Only those that are written can be selected.
 */
export function rowsOfHandle(root: AST, env: Env, row: string, handle: Handle): string[] {
	const within = gripAt(root, env, row)?.within
	if (typeof handle.place === 'number') {
		return [`${row}${within === undefined ? '' : `/${within}`}/arg${handle.place}`]
	}
	const rowOf = ({ route, index }: { route: readonly number[]; index?: number }): string[] => {
		if (route.length === 0 || readAt(root, env, row, route) === null) return []
		const path = route.map(arg => `/arg${arg}`).join('')
		return [`${row}${path}${index === undefined ? '' : `/${index}`}`]
	}
	if (handle.parts !== undefined) return handle.parts.flatMap(route => rowOf({ route }))
	const { means, at } = handle
	if (means !== undefined) return means.length === 1 ? rowOf(means[0]!) : []
	if (at === undefined || handle.place === 'self') return []
	const changes = handle.to([at[0] + 1.37, at[1] + 2.11], at)
	if (changes.length !== 1) return []
	const { route, value } = changes[0]!
	if (!Array.isArray(value) || !value.includes(UNSET)) return rowOf({ route })
	const said = value.flatMap((element, i) => (element === UNSET ? [] : [i]))
	return said.length === 1 ? rowOf({ route, index: said[0]! }) : []
}

/** The number at a place in the row at `row`, as it is in `root`. */
export function dimensionAt(
	root: AST,
	env: Env,
	row: string,
	{ route, index, set }: DimensionPlace
): Dimension | null {
	const read = readAt(root, env, row, route)
	if (read === null) return null
	const { label, expected, options, value } = read
	const own = { route, ...(index === undefined ? {} : { index }) }
	const place = {
		...own,
		...(set === undefined ? {} : { set }),
		...(isExpressionAt(root, env, row, own) ? { expression: true } : {}),
	}
	if (index === undefined) {
		if (typeof value !== 'number') return null
		// Out on its own, it has no row to show what it is by.
		const icon = expected === null ? null : textOf(expected.meta?.get('icon'))
		const shown = icon === null || options.leftIcon !== undefined ? options : { ...options, leftIcon: icon }
		return { ...place, label, value, options: shown, length: 1 }
	}
	const element = isNumbers(value) ? value[index] : undefined
	if (element === undefined || !isNumbers(value)) return null
	const shape = expected === null ? null : unwrapLazy(expected).shape
	const title = shape?.kind === 'tuple' ? textOf(shape.elements[index]?.meta?.get('title')) : null
	return {
		...place,
		label: title ?? `${label} ${index}`,
		value: element,
		options: elementOptionsOf(expected, index),
		length: value.length,
	}
}

/** Where the numbers are in what is at `route`, leaving out what `wanted` leaves alone. */
function placesAt(
	root: AST,
	env: Env,
	row: string,
	route: readonly number[],
	wanted?: unknown
): DimensionPlace[] {
	const value = readAt(root, env, row, route)?.value
	if (typeof value === 'number') return [{ route }]
	if (!isNumbers(value)) return []
	return value.flatMap((_, index) =>
		Array.isArray(wanted) && wanted[index] === UNSET ? [] : [{ route, index }]
	)
}

const inOrder = (a: DimensionPlace, b: DimensionPlace): number =>
	a.route.join() === b.route.join()
		? (a.index ?? 0) - (b.index ?? 0)
		: a.route.join().localeCompare(b.route.join(), undefined, { numeric: true })

/**
 * The numbers that `changes` have got hold of, in the order the call has them, each
 * once. What is no different from `before` is left out, unless nothing is yet.
 */
export function dimensionsOf(
	root: AST,
	env: Env,
	row: string,
	changes: readonly Change[],
	before?: AST
): Dimension[] {
	const seen = new Set<string>()
	const all = changes
		.flatMap(({ route, value }) => placesAt(root, env, row, route, value))
		.filter(({ route, index }) => {
			const key = `${route.join()}/${index}`
			if (seen.has(key)) return false
			seen.add(key)
			return true
		})
		.sort(inOrder)
		.flatMap(place => dimensionAt(root, env, row, place) ?? [])
	if (before === undefined) return all
	const different = all.filter(
		dimension => dimensionAt(before, env, row, dimension)?.value !== dimension.value
	)
	return different.length > 0 ? different : all
}

/**
 * The numbers of a shape just drawn: what is written as numbers, as what it starts from
 * may be something else's, which is not for typing over here. Which to go to first is
 * what the drag said, which is the argument after where it started.
 */
/**
 * The numbers to say while the whole of it is being moved, which are where it is, if there
 * is one place that says so: a rect's or a circle's, but not each of a polyline's.
 */
export const dimensionsMoved = (
	root: AST,
	env: Env,
	row: string,
	changes: readonly Change[],
	before?: AST
): Dimension[] => (changes.length === 1 ? dimensionsOf(root, env, row, changes, before) : [])

export function dimensionsDrawn(
	root: AST,
	env: Env,
	row: string
): { dimensions: Dimension[]; first: number } {
	const found = rowAt(root, env, row)
	const call = found && bare(found.node)
	if (call?.kind !== 'call') return { dimensions: [], first: 0 }
	const dimensions = call.args
		.flatMap((arg, i) =>
			arg.kind === 'vec' || arg.kind === 'lit' ? placesAt(root, env, row, [i]) : []
		)
		.flatMap(place => dimensionAt(root, env, row, place) ?? [])
	return { dimensions, first: Math.max(0, dimensions.findIndex(({ route }) => route[0] === 1)) }
}

/** Whether what `wanted` asks of `node` is written right there, rather than somewhere else. */
function isWritten(node: AST, wanted: unknown): boolean {
	const written = bare(node)
	if (written.kind === 'lit') return true
	if (written.kind !== 'vec' || !Array.isArray(wanted)) return false
	return written.elements.every((element, i) => wanted[i] === UNSET || bare(element).kind === 'lit')
}

/**
 * What has to change for a number to be `value`, however much that comes to. What it
 * would have to take along is left where it is, if that refers to something else: what a
 * shape was put on stays what it is on, and it is only this number that is any different.
 * What goes in proportion goes by the ratio in `ratioFrom`, which is where the typing began,
 * for it to last through a number that is 0 on the way to being typed.
 */
export function dimensionChanges(
	root: AST,
	env: Env,
	row: string,
	dimension: Dimension,
	value: number,
	ratioFrom: AST = root
): readonly Change[] {
	const alone = (): Change => {
		const { route, index } = dimension
		const read = index === undefined ? null : readAt(ratioFrom, env, row, route)
		return read?.proportional && index !== undefined && isNumbers(read.value)
			? { route, value: keepingRatio(null, read.value, index, value).wrote }
			: dimensionChange(dimension, value)
	}
	const changes = dimension.set?.(value)
	if (changes === undefined) return [alone()]
	const found = rowAt(root, env, row)
	const own = dimension.route.join()
	const onlyWritten = changes.every(({ route, value: wanted }) => {
		if (route.join() === own) return true
		const node = found && nodeAt(found.node, found.env, route)
		return node !== null && isWritten(node, wanted)
	})
	return onlyWritten ? changes : [alone()]
}

/**
 * The numbers a drag of `handle` is about: what it says it is about, or else what
 * `changes` have got hold of. What is typed in them goes on from where it was let go of.
 */
export function dimensionsHeld(
	root: AST,
	env: Env,
	row: string,
	handle: Handle,
	changes: readonly Change[],
	before: AST,
	to: Vec,
	how?: HandleDrag
): Dimension[] {
	if (handle.means === undefined) return dimensionsOf(root, env, row, changes, before)
	return handle.means.flatMap(
		({ route, index, set }) =>
			dimensionAt(root, env, row, {
				route,
				...(index === undefined ? {} : { index }),
				set: value => set(value, to, how),
			}) ?? []
	)
}

/**
 * What goes in one place on screen: the numbers of a place go together, as one thing.
 * `corner` is down and across from there.
 */
export interface PlacedDimension {
	readonly dimensions: readonly Dimension[]
	readonly at: Vec
	readonly side: DimensionSide | 'corner'
}

const POINTER_OFFSET = 14
const STACKED_BY = 26

/** Whether what a handle says goes outside of it: all but a place, and the whole of it. */
export const saysOutside = ({ kind, name }: Handle): boolean =>
	kind === 'offset' ||
	kind === 'arrow' ||
	kind === 'direction' ||
	(kind === 'point' && name === 'vertex')

/**
 * Where the numbers of a handle being dragged go: by the one of its `kind` nearest the
 * pointer, which is the one taken hold of, on the side of it that it goes out toward. An
 * offset has an outline on either side, and goes away from the rest of them, as a ring
 * has a side toward the center that is just as much outside of it.
 */
function outsideOfHandle(
	grip: Grip & { readonly transform: Mat },
	kind: Handle['kind'],
	[pointerX, pointerY]: Vec,
	onScreen: (at: Vec, transform: Mat) => Vec
): { at: Vec; side: DimensionSide } | null {
	const screen = (at: Vec): Vec => onScreen(at, grip.transform)
	const ofKind = grip.handles.flatMap(handle =>
		handle.kind === kind && handle.at !== undefined && saysOutside(handle)
			? [{ handle, at: screen(handle.at) }]
			: []
	)
	const [first] = ofKind
	if (first === undefined) return null
	const distance = ([x, y]: Vec) => Math.hypot(x - pointerX, y - pointerY)
	const { handle, at } = ofKind.reduce((a, b) => (distance(b.at) < distance(a.at) ? b : a), first)
	const between = (from: Vec, to: Vec): Vec => [to[0] - from[0], to[1] - from[1]]

	let out: Vec
	if (handle.angle === undefined) {
		out = handle.pivot === undefined ? [1, 0] : between(screen(handle.pivot), at)
	} else {
		const radians = (handle.angle * Math.PI) / 180
		const [localX, localY] = handle.at!
		out = between(at, screen([localX + Math.cos(radians), localY + Math.sin(radians)]))
	}
	const middle: Vec = [
		ofKind.reduce((sum, o) => sum + o.at[0], 0) / ofKind.length,
		ofKind.reduce((sum, o) => sum + o.at[1], 0) / ofKind.length,
	]
	const away = between(middle, at)
	const back = handle.kind === 'offset' ? away[0] * out[0] + away[1] * out[1] < 0 : handle.inward === true
	const [x, y] = back ? [-out[0], -out[1]] : out
	const side = Math.abs(x) >= Math.abs(y) ? (x < 0 ? 'left' : 'right') : y < 0 ? 'above' : 'below'
	return { at, side }
}

/**
 * The numbers at `places`, each by the part of the shape it belongs to, as it is in
 * `root`, so that it goes along with what it says. What has no such part, as a matrix
 * written out has not, is stacked by the pointer. Those of a handle of the `outsideOf`
 * kind being dragged go outside of it instead.
 */
export function placedDimensions(
	root: AST,
	env: Env,
	row: string,
	places: readonly DimensionPlace[],
	[pointerX, pointerY]: Vec,
	onScreen: (at: Vec, transform: Mat) => Vec,
	outsideOf: Handle['kind'] | null = null
): PlacedDimension[] {
	const grip = gripAt(root, env, row)
	const outside =
		outsideOf !== null && grip
			? outsideOfHandle(grip, outsideOf, [pointerX, pointerY], onScreen)
			: null
	let stacked = 0
	let outsideAfter = 0
	const placed: PlacedDimension[] = []
	for (const place of places) {
		const dimension = dimensionAt(root, env, row, place)
		if (dimension === null) continue
		const mark = grip?.marks?.find(
			({ route, index }) => route.join() === place.route.join() && index === place.index
		)
		if (!mark || !grip) {
			const at: Vec = [pointerX + POINTER_OFFSET, pointerY + POINTER_OFFSET + STACKED_BY * stacked++]
			placed.push({ dimensions: [dimension], at, side: 'corner' })
			continue
		}
		const last = placed.at(-1)
		// A number of another part goes clear of the one before, as it is by the same handle.
		if (outside && last && last.dimensions[0]!.route.join() !== place.route.join()) outsideAfter++
		const at: Vec = outside
			? [outside.at[0], outside.at[1] + (outside.side === 'above' ? -1 : 1) * STACKED_BY * outsideAfter]
			: onScreen(mark.at, grip.transform)
		const side = outside?.side ?? mark.side
		const together =
			last !== undefined &&
			last.side === side &&
			last.at[0] === at[0] &&
			last.at[1] === at[1] &&
			last.dimensions[0]!.route.join() === place.route.join()
		if (together) placed[placed.length - 1] = { ...last, dimensions: [...last.dimensions, dimension] }
		else placed.push({ dimensions: [dimension], at, side })
	}
	return placed
}

const DIMENSION_GAP = 14
const ROOM_MARGIN = 8

/** The top left of something of `size`, to the `side` of `at`, inside of `room`. */
export function placedBeside(
	[x, y]: Vec,
	side: PlacedDimension['side'],
	[width, height]: Vec,
	[roomWidth, roomHeight]: Vec
): Vec {
	const left =
		side === 'left'
			? x - width - DIMENSION_GAP
			: side === 'right'
				? x + DIMENSION_GAP
				: side === 'corner' || side === 'above-start'
					? x
					: x - width / 2
	const top =
		side === 'above' || side === 'above-start'
			? y - height - DIMENSION_GAP
			: side === 'below'
				? y + DIMENSION_GAP
				: side === 'corner'
					? y
					: y - height / 2
	return [
		Math.max(ROOM_MARGIN, Math.min(left, roomWidth - width - ROOM_MARGIN)),
		Math.max(ROOM_MARGIN, Math.min(top, roomHeight - height - ROOM_MARGIN)),
	]
}

/** What has to change, for the number at a place to be `value`. */
export function dimensionChange({ route, index, length }: Dimension, value: number): Change {
	if (index === undefined) return { route, value }
	return { route, value: Array.from({ length }, (_, i) => (i === index ? value : UNSET)) }
}

function linesOf(root: AST, env: Env, row: string, changes: readonly Change[]): string[] {
	const lines = changes.flatMap(({ route, value: wanted }) => {
		const read = readAt(root, env, row, route)
		if (read === null) return []
		const { label, expected, options, value } = read
		// A percentage as a percentage, as it is in a field, and it would mean nothing without saying so.
		if (typeof value === 'number') {
			const { scale, suffix = '' } = options
			return [scale === undefined ? `${label} ${shown(value)}` : `${label} ${shown(value * scale)}${suffix}`]
		}
		if (!isNumbers(value)) return []
		// Of a vector, only what was asked of it, as what it is called on its own.
		if (Array.isArray(wanted) && wanted.includes(UNSET)) {
			const shape = expected === null ? null : unwrapLazy(expected).shape
			return value.flatMap((element, i) => {
				if (wanted[i] === UNSET) return []
				const title =
					shape?.kind === 'tuple' ? textOf(shape.elements[i]?.meta?.get('title')) : null
				return [`${title ?? `${label} ${i}`} ${shown(element)}`]
			})
		}
		return [`${label} ${value.map(shown).join(', ')}`]
	})
	return [...new Set(lines)]
}

/** What `route` goes down to from `start`, through the calls on the way. */
function nodeAt(start: AST, startEnv: Env, route: readonly number[]): AST | null {
	let node = start
	let env = startEnv
	for (const arg of route) {
		const found = follow(node, env)
		if (found === null) return null
		const call = bare(found.node)
		if (call.kind !== 'call') return null
		const inside = enterNode(call, found.env)
		const name = call.kwargs === undefined ? undefined : callParameters(call, inside)?.names[arg]
		const next = call.args[arg] ?? (name === undefined ? undefined : call.kwargs?.get(name))
		if (next === undefined) return null
		env = inside
		node = next
	}
	return node
}

/**
 * `ast`, with the argument on the call at `route` being `added`: next if it comes next, and by
 * its name if there are others not said before it.
 */
function withArgument(ast: AST, route: readonly number[], added: AST, env: Env): AST | null {
	const call = bare(ast)
	const [arg, ...rest] = route
	if (call.kind !== 'call' || arg === undefined) return null
	const args = [...call.args]
	if (rest.length === 0) {
		if (arg < args.length) return null
		if (arg > args.length) {
			const name = callParameters(call, enterNode(call, env))?.names[arg]
			if (name === undefined) return null
			const named = new CallAST(call.head, args, new Map([...(call.kwargs ?? []), [name, added]]))
			return ast.kind === 'meta' ? new MetaAST(ast.metadata, named) : named
		}
		args.push(added)
	} else {
		const within = args[arg] && withArgument(args[arg], rest, added, env)
		if (!within) return null
		args[arg] = within
	}
	const next = new CallAST(call.head, args, call.kwargs)
	return ast.kind === 'meta' ? new MetaAST(ast.metadata, next) : next
}

/** `root` with an argument that was left unsaid on the row at `row` said. */
function withAddedArgument(
	root: AST,
	env: Env,
	row: string,
	route: readonly number[],
	value: unknown
): AST | null {
	const reached = reach(root, env, row)
	const last = reached?.chain.at(-1)
	if (!reached || !last) return null
	const next = withArgument(last.ast, route, toAst(value, null), env)
	return next === null ? null : withParent(reached.chain, last.replace(next))
}

/**
 * `root` with `changes` made to the row at `row`, each in turn, as each edit makes a
 * new program for the next. Null, with why, if one of them cannot be.
 */
export function changed(
	root: AST,
	env: Env,
	row: string,
	changes: readonly Change[]
): { ast: AST | null; problem: string | null } {
	// What is written as it is goes first, so that what is worked out from it, as a center can be
	// from a radius, already comes to what it is to be, rather than what it refers to being changed.
	const written = (change: Change): boolean => {
		const found = rowAt(root, env, change.row ?? row)
		const node = found && nodeAt(found.node, found.env, change.route)
		return node !== null && isWritten(node, change.value)
	}
	const inOrder = [...changes.filter(written), ...changes.filter(change => !written(change))]
	let next = root
	// What the rest of the changes say stays as they say it, so that one of them is not had by
	// way of another: a corner pulled down grows the height, and does not move the top.
	const saidBy = (change: Change): AST[] => {
		const found = rowAt(next, env, change.row ?? row)
		const node = found && nodeAt(found.node, found.env, change.route)
		return node ? partsSaid(node, change.value) : []
	}
	const heldFor = (change: Change): ReadonlySet<AST> => {
		const own = new Set(saidBy(change))
		return new Set(inOrder.filter(other => other !== change).flatMap(saidBy).filter(node => !own.has(node)))
	}
	for (const change of inOrder) {
		const { route, value, row: elsewhere } = change
		const of = elsewhere ?? row
		const found = rowAt(next, env, of)
		const node = found && nodeAt(found.node, found.env, route)
		if (!node) {
			const added = withAddedArgument(next, env, of, route, value)
			if (added === null) return { ast: null, problem: 'that is no longer there' }
			next = added
			continue
		}
		const held = heldFor(change)
		const { ast, diagnostics } = solve(next, env, node, value, { held })
		// A place that can go only one way goes as far as it can: the rest stays.
		const some = ast ?? partsChanged(next, env, of, route, value, held)
		if (some === null) {
			return { ast: null, problem: diagnostics[0]?.message ?? 'cannot be moved' }
		}
		next = some
	}
	return { ast: next, problem: null }
}

/** The parts of `node` that `value` says anything of: each element it says, or all of it. */
function partsSaid(node: AST, value: unknown): AST[] {
	if (value === UNSET) return []
	const written = bare(node)
	if (Array.isArray(value) && written.kind === 'vec' && written.elements.length === value.length) {
		return written.elements.flatMap((element, i) => partsSaid(element, value[i]))
	}
	return node === written ? [node] : [node, written]
}

/** `root`, with each part of what is wanted that can be there, or null if none can. */
function partsChanged(
	root: AST,
	env: Env,
	row: string,
	route: readonly number[],
	value: unknown,
	held: ReadonlySet<AST>
): AST | null {
	if (!Array.isArray(value)) return null
	let next = root
	for (const [i, part] of value.entries()) {
		if (part === UNSET) continue
		const found = rowAt(next, env, row)
		const node = found && nodeAt(found.node, found.env, route)
		const only = value.map((_, j) => (j === i ? part : UNSET))
		next = (node && solve(next, env, node, only, { held }).ast) ?? next
	}
	return next === root ? null : next
}
