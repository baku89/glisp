<script setup lang="ts">
import type { AST, LetAST } from '@glisp/lang'
import { type GlispDocument } from '@glisp/tweeq'
import { useEventListener, useResizeObserver } from '@vueuse/core'
import { mat2d, vec2 } from 'linearly'
import { toPath2D } from 'pave/path/canvas'
import { transform } from 'pave/path/modifiers'
import { useZUI } from 'tweeq/use/useZUI'
import { computed, onBeforeUnmount, ref, shallowRef, useTemplateRef, watch, watchEffect } from 'vue'

import Dimensions from './Dimensions.vue'
import {
	type Modulation,
	modulationAt,
	withPointInserted,
	withPointRemoved,
	withPointsClosed,
} from './modulate'
import { otherControl, type Change, type Grip, type Handle, type Mat, NO_PAINT, type Paint, type Path, type Vec, inkOn, onlyShapes } from './graphics'
import { type GridKind, gridPositions, offAxis } from './grid'
import { rowsAbout, viewBetween } from './rows'
import {
	changed,
	type Dimension,
	dimensionChanges,
	dimensionsHeld,
	backgroundOf,
	dimensionsDrawn,
	dimensionsMoved,
	dimensionsOf,
	dragStep,
	drawn,
	drawnFrom,
	gripAt,
	gripOfRows,
	rowsInside,
	linked,
	nameFor,
	nearestSnap,
	closingPulled,
	penGuided,
	penned,
	hasInside,
	placedDimensions,
	saysOutside,
	withExpressionAt,
	readoutOf,
	roundedChanges,
	roundedTo,
	rowsChanged,
	rowsWithin,
	type Anchor,
	hiddenShapesOf,
	pathOfRow,
	sceneOf,
	type Shape,
	SHAPE_ATTRIBUTES,
	type ShapeAttributes,
	type ShapeTool,
	type SnapPoint,
	snapPointsOf,
	evenlyFrom,
	facesWhenDrawn,
	placesTakenBy,
	anchorsAlong,
	nameOfKind,
	pencilCloses,
	pencilled,
	pencilledAs,
	rowsOfHandle,
	isOutlined,
	canRefer,
	penKind,
} from './scene'
import { BRUSHES, type Brush, type BrushContext, brushed, type BrushName, type Guides, isBrush } from './brushes'
import { fitFurther, NOTHING_SETTLED, pathOfFit, type PencilFit, samplesOf, type Steady, steadied } from './pencilFit'
import { paintOfLine, withPaintDrawn } from './toolAttributes'

const props = defineProps<{
	document: GlispDocument
	/** The rows selected, as the tree has them too. */
	selected: readonly string[]
	/** Where the program's origin is on screen, until the view has been moved. */
	origin: readonly [number, number]
	/** What a press does, if it draws. */
	drawing?: ShapeTool | 'pen' | 'pencil' | BrushName | null
	/** What it draws from, of which what it draws has a copy. */
	attributes?: { readonly paint: Paint; readonly shape: ShapeAttributes }
	/** A drag says its numbers exactly, and they can be typed once it is let go of. */
	dimensions?: boolean
	/** What is laid over the canvas to see by. */
	grid?: GridKind
	/** A drag or a drawing goes to what it comes near. */
	snapping?: boolean
}>()

const emit = defineEmits<{
	select: [rows: readonly string[]]
	/** A right click, and the row of what it was on, if anything. */
	menu: [x: number, y: number, row: string | null]
}>()

const FRAME_ALPHA = 0.4
const SOURCE_ALPHA = 0.5
const UNPAINTED_ALPHA = 0.25
const GRID_DOT = 2
const GRID_DOT_ALPHA = 0.18
const GRID_LINE_ALPHA = 0.06
const GRID_AXIS_ALPHA = 0.35

const VIEW_KEY = 'glisp.canvas.view'
const VIEW_SAVE_MS = 200

/** How the view was left, in this browser. */
function storedView(): mat2d | null {
	try {
		const stored = JSON.parse(localStorage.getItem(VIEW_KEY) ?? 'null') as unknown
		return Array.isArray(stored) &&
			stored.length === 6 &&
			stored.every(n => typeof n === 'number' && Number.isFinite(n))
			? (stored as unknown as mat2d)
			: null
	} catch {
		return null
	}
}

const $canvas = useTemplateRef<HTMLCanvasElement>('$canvas')
const size = ref<[number, number]>([0, 0])
/** From the program's coordinates to the screen's. */
const view = shallowRef<mat2d>(storedView() ?? mat2d.fromTranslation([...props.origin]))
/** The row of what the pointer is over, which is about to be selected. */
const hovered = ref<string | null>(null)
const hoveredHandle = ref<number | null>(null)
/** The handle being dragged, which is all there is to see of the pointer meanwhile. */
const draggedHandle = ref<number | null>(null)
/**
 * The row whose handles these still are, a part of it having been selected by clicking
 * one. To the canvas it is that row that is selected, or there would be nothing to go on with.
 */
const keptRow = defineModel<string | null>('keptRow', { default: null })
const taken = computed(() => rowsAbout(props.selected, keptRow.value))
watch(taken, rows => {
	if (rows[0] !== keptRow.value) keptRow.value = null
})
/** Two places on screen on the line that something going by even angles is on. */
const evenLine = shallowRef<readonly [Vec, Vec] | null>(null)
/** What is being referred to, or would be if pressed here: which is said in the color of that. */
const linking = shallowRef<SnapPoint | null>(null)
/**
 * The anchor a pen has got to, if it has been pulled, which nothing drawn says yet: what
 * comes out of it is not a part of the path until there is somewhere for that to go.
 */
const penPulled = shallowRef<{ readonly at: Vec; readonly out: Vec; readonly into?: Vec } | null>(null)
/** Where a pencil has been, and the program it is being drawn on, until it is let go of. */
const pencilStroke = shallowRef<readonly Vec[] | null>(null)
let pencilBase: LetAST | null = null
let pencilFit: PencilFit = NOTHING_SETTLED
let pencilSteady: Steady | null = null
/** A brush while it is in the middle of something, which can take any number of presses. */
let brush: { readonly def: Brush; state: unknown; readonly base: LetAST } | null = null
const brushGuides = shallowRef<Guides | null>(null)
/** Where the pointer is, for a brush that shows how far around it reaches. */
const brushPointer = shallowRef<Vec | null>(null)
/** Where the pointer really is, which is ahead of the stroke by what steadying it holds back. */
let pencilTip: Vec | null = null
/** How far on screen a pencil goes before that is somewhere else. */
const PENCIL_STEP = 1
const BRUSH_SEEDS = 1_000_000
/** How long on screen the stretch still changing can be, at most: all that ever moves behind a pencil. */
const PENCIL_LONGEST = 100
const PENCIL_LONGEST_PER_SMOOTHNESS = 20
/** The corners, on screen, of a range being drawn. */
const range = shallowRef<{ from: Vec; to: Vec } | null>(null)
/** How much finer than a pixel what a handle changes is, where that is small. */
const FINE_BY = 100

/** As finely as a pointer can say anything, as things are on screen now. */
const pointerStep = (): number => dragStep(view.value[0], window.devicePixelRatio)

const roundedPlace = (x: number, y: number): Vec => {
	const [wx, wy] = fromScreen(x, y)
	const step = pointerStep()
	return [roundedTo(wx, step), roundedTo(wy, step)]
}

/** A way to take something, to see what it takes with it. */
const TRIAL: Vec = [37.3, 41.9]
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1]]

/** The rows that would come out differently, for what is at `row` to change like this. */
function changedBy(row: string, changes: readonly Change[], root?: AST): Set<string> {
	const { env, root: current } = props.document
	const from = root ?? current.value
	const { ast } = apply(row, changes, from)
	return new Set([row, ...(ast === null ? [] : rowsChanged(from, ast, env.value))])
}

/** What moving `rows` can line up, and with what, none of which is moving too. */
function snapsFor(rows: readonly Moving[]): {
	own: SnapPoint[]
	others: SnapPoint[]
} {
	const { env, root } = props.document
	const shapes = sceneOf(root.value, env.value)
	const moving = new Set<string>()
	for (const { row, grip: held } of rows) {
		for (const changed of changedBy(row, held.move?.(TRIAL) ?? [])) moving.add(changed)
	}
	return {
		own: snapPointsOf(
			root.value,
			env.value,
			shapes.filter(shape => moving.has(shape.row))
		).filter(point => point.to === undefined),
		others: snapPointsOf(root.value, env.value, shapes, moving),
	}
}

/** Where to take the pointer to, for the nearest of `own` to be on one of `others`. */
function snappedMove(
	own: readonly SnapPoint[],
	others: readonly SnapPoint[],
	[fromX, fromY]: Vec,
	[x, y]: Vec
): Vec {
	const [ax, ay] = fromScreen(fromX, fromY)
	const [bx, by] = fromScreen(x, y)
	const [dx, dy] = [bx - ax, by - ay]
	let best: { snap: SnapPoint; distance: number; delta: Vec } | null = null
	for (const { at } of own) {
		const moved: Vec = [at[0] + dx, at[1] + dy]
		const snap = snapNear(others, moved)
		if (snap === null) continue
		const distance = Math.hypot(snap.at[0] - moved[0], snap.at[1] - moved[1])
		if (best === null || distance < best.distance) {
			best = { snap, distance, delta: [snap.at[0] - at[0], snap.at[1] - at[1]] }
		}
	}
	snapMark.value = best?.snap ?? null
	return best === null ? [x, y] : toScreen([ax + best.delta[0], ay + best.delta[1]], view.value)
}

/** How near, on screen, a place has to be to be snapped to. */
const SNAP_REACH = 8

/** The nearest of `points` within reach of `at` in the program's coordinates, unless turned off. */
const snapNear = (points: readonly SnapPoint[], at: Vec): SnapPoint | null =>
	props.snapping ? nearestSnap(points, at, SNAP_REACH / view.value[0]) : null

/** Everywhere there is to snap to, on what `root` draws. */
function snapPoints(
	root: AST = props.document.root.value,
	except?: ReadonlySet<string>
): SnapPoint[] {
	const { env } = props.document
	return snapPointsOf(root, env.value, sceneOf(root, env.value), except)
}

const snapAt = (points: readonly SnapPoint[], x: number, y: number): SnapPoint | null =>
	snapNear(points, fromScreen(x, y))

/** A path being drawn with the pen, which goes on until it is finished. */
let pen: { base: LetAST; name: string; anchors: readonly Anchor[] } | null = null
/** From the last place to where it would go next, on screen, and what that lines up by. */
const penLine = shallowRef<[Vec, Vec, (readonly (readonly [Vec, Vec])[])?] | null>(null)
/** Where the pointer last was, for what is held down to say at once where a pen would go. */
let penPointer: Vec | null = null

/** What a handle being dragged has made of what it changes, beside the pointer. */
const readout = shallowRef<{
	at: Vec
	lines: readonly string[]
	fallback: string
	place: Vec
} | null>(null)
/**
 * The numbers a drag has got hold of, whichever kind of drag it was: to read as it goes,
 * and to type in once it is let go of, which is all it takes to be at them.
 */
const held = shallowRef<{
	row: string
	places: readonly Dimension[]
	/** Where it is beside, in the program's coordinates, to stay there as the view moves. */
	at: Vec
	/** The kind of handle dragged, if what it says goes outside of it. */
	outsideOf: Handle['kind'] | null
	/** It came of drawing a shape. */
	drawn: boolean
	first: number
	editing: boolean
	/** The program as the drag left it, to go back to. */
	base: AST
} | null>(null)
/** What was last typed came to this, which is not someone else having changed it. */
let typed: AST | null = null

const heldDimensions = computed(() => {
	const { root, env } = props.document
	if (held.value === null) return []
	const { row, places, at, outsideOf } = held.value
	return placedDimensions(
		root.value,
		env.value,
		row,
		places,
		toScreen(at, view.value),
		(place, mat) => toScreen(place, gripView(mat)),
		outsideOf
	)
})

/** What each keystroke of an expression starts over from, and whose number it is. */
let beforeExpression: { place: string; ast: AST } | null = null

function hold(
	row: string,
	places: readonly Dimension[],
	[x, y]: Vec,
	first = 0,
	outsideOf: Handle['kind'] | null = null,
	drawn = false
): void {
	beforeExpression = null
	held.value =
		places.length === 0
			? null
			: { row, places, at: fromScreen(x, y), outsideOf, drawn, first, editing: false, base: props.document.root.value }
}

function typeDimension(dimension: Dimension, value: number): void {
	if (held.value === null) return
	// A number in place of what it was worked out from is that gone, not that changed.
	if (dimension.expression) {
		typeExpression(dimension, String(value))
		return
	}
	const { root, env } = props.document
	const { row, base } = held.value
	const next = apply(row, dimensionChanges(root.value, env.value, row, dimension, value, base))
	typed = next.ast
	commit(next)
}

function typeExpression(dimension: Dimension, text: string): string | null {
	if (held.value === null) return null
	const { root, env } = props.document
	const place = `${dimension.route}/${dimension.index}`
	if (beforeExpression?.place !== place) beforeExpression = { place, ast: root.value }
	const result = withExpressionAt(beforeExpression.ast, env.value, held.value.row, dimension, text)
	const ast = 'ast' in result ? result.ast : beforeExpression.ast
	typed = ast
	commit({ ast, problem: null })
	return 'problem' in result ? result.problem : null
}

function doneTyping(keep: boolean): void {
	const base = held.value?.base
	held.value = null
	if (!keep && base?.kind === 'let' && base !== props.document.root.value) {
		props.document.setRoot(base)
	}
}

// Whatever else changes the program, or the option, these are no longer what they were.
watch(
	() => props.document.root.value,
	root => {
		if (held.value?.editing && root !== typed && root !== held.value.base) held.value = null
	}
)
watch(
	() => props.dimensions,
	() => {
		held.value = null
	}
)

/** What the pointer has snapped to, and where that is, to say so. */
const snapMark = shallowRef<SnapPoint | null>(null)
const cursor = ref('default')
/** Why what was asked for could not be, until the next press. */
const problem = ref<string | null>(null)

const HANDLE_RADIUS = 5
const PEN_CONTROL_RADIUS = 3
/** How far out from a handle the paper goes, each way, to be seen over the color of a shape. */
const HANDLE_EDGE = 1.5
/** How far past the ends of a line that goes. */
const HANDLE_EDGE_PAST = 1
/** As much to be seen of a square as of a round handle. */
const CORNER_HALF = 4.5
const HIT_WIDTH = 10
const HOVER_WIDTH = 3
const DASH = [3, 2]
const RANGE_OPACITY = 0.1

const scene = computed(() => sceneOf(props.document.root.value, props.document.env.value))
const hiddenSelected = computed(() =>
	hiddenShapesOf(props.document.root.value, props.document.env.value, taken.value)
)
const background = computed(() => backgroundOf(props.document.root.value, props.document.env.value))

const gripOfRow = (row: string) =>
	gripAt(props.document.root.value, props.document.env.value, row)

/** The handles of all that is selected, and whose each of them is. */
const gripped = computed(() =>
	gripOfRows(props.document.root.value, props.document.env.value, taken.value)
)
const grip = computed(() => gripped.value?.grip ?? null)

/** From where a grip's coordinates are to the screen's. */
const gripView = (mat: Mat): mat2d => mat2d.mul(view.value, mat as unknown as mat2d)
const onScreen = computed(() => (grip.value ? gripView(grip.value.transform) : view.value))

const toScreen = (at: Vec, mat: mat2d = onScreen.value): [number, number] => {
	const [x, y] = vec2.transformMat2d(at, mat)
	return [x, y]
}
const fromScreen = (x: number, y: number, mat: mat2d = view.value): Vec => {
	const [wx, wy] = vec2.transformMat2d([x, y], mat2d.inv(mat) ?? mat2d.I)
	return [wx, wy]
}
const pathOnScreen = (path: Path, mat: mat2d = onScreen.value): Path2D =>
	toPath2D(transform(path, mat))

/** Going to a view, a frame at a time, until something else moves it. */
let gliding: number | null = null

function stopGliding(): void {
	if (gliding !== null) cancelAnimationFrame(gliding)
	gliding = null
}

function glideTo(next: mat2d): void {
	stopGliding()
	if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
		view.value = next
		return
	}
	const from = view.value
	const start = performance.now()
	const step = (now: number) => {
		const t = Math.min(1, (now - start) / GLIDE_TIME)
		const eased = t < 0.5 ? 4 * t ** 3 : 1 - (2 - 2 * t) ** 3 / 2
		view.value = t < 1 ? (viewBetween(from, next, eased) as mat2d) : next
		gliding = t < 1 ? requestAnimationFrame(step) : null
	}
	gliding = requestAnimationFrame(step)
}
onBeforeUnmount(stopGliding)

useZUI($canvas, delta => {
	stopGliding()
	view.value = mat2d.mul(delta, view.value)
})

defineExpose({
	/** The row of what is drawn at a place on the screen, if anything is. */
	rowAtPoint(clientX: number, clientY: number): string | null {
		// Not through what floats over it.
		const canvas = $canvas.value
		if (!canvas || window.document.elementFromPoint(clientX, clientY) !== canvas) return null
		const box = canvas.getBoundingClientRect()
		return shapeAt(clientX - box.left, clientY - box.top)?.row ?? null
	},
	/** Where a place on the screen is in what is drawn. */
	placeAt(clientX: number, clientY: number): Vec {
		const box = $canvas.value?.getBoundingClientRect()
		return roundedPlace(clientX - (box?.left ?? 0), clientY - (box?.top ?? 0))
	},
	/** Go over to this as the view. */
	glideTo,
	/** Zoom by this much, around the middle of what can be seen. */
	zoomBy(factor: number): void {
		stopGliding()
		const middle: vec2 = [size.value[0] / 2, size.value[1] / 2]
		view.value = mat2d.mul(mat2d.fromScaling([factor, factor], middle), view.value)
	},
	/** The same as it was, with this as how far in it is. */
	zoomTo(zoom: number): void {
		stopGliding()
		const factor = zoom / view.value[0]
		const middle: vec2 = [size.value[0] / 2, size.value[1] / 2]
		view.value = mat2d.mul(mat2d.fromScaling([factor, factor], middle), view.value)
	},
	size: () => size.value,
	/** How far in the view is, where 1 is actual size. */
	zoom: () => view.value[0],
})

let savingView: ReturnType<typeof setTimeout> | undefined
watch(view, next => {
	clearTimeout(savingView)
	savingView = setTimeout(() => {
		try {
			localStorage.setItem(VIEW_KEY, JSON.stringify(next))
		} catch {
			// With nowhere to keep it, it lasts as long as the page.
		}
	}, VIEW_SAVE_MS)
})

function color(name: string): string {
	return getComputedStyle(window.document.body).getPropertyValue(name).trim()
}

/** What a handle looks like, around where it is, facing the way it pulls. */
const ARROW = new Path2D('M 15 0 H -15 M -9 -5 L -15 0 L -9 5 M 9 -5 L 15 0 L 9 5')
const CROSS = new Path2D('M 12 0 H -12 M 0 12 V -12')
const DIAMOND = new Path2D('M 7 0 L 0 7 L -7 0 L 0 -7 Z')
/** What only says which way: the head of an arrow, at the end of its line. */
const POINTER = new Path2D('M -8 -6 L 0 0 L -8 6')
/** How far either side of an outline the marks of what moves it are, and how far they bend. */
const OFFSET_GAP = 4
const OFFSET_REACH = HANDLE_RADIUS * 1.25
const OFFSET_BEND = 3.5
/** How far along the outline they reach once bent, which is less, for them to come to a point. */
const OFFSET_BENT_REACH = 3.5
const OFFSET_BEND_TIME = 100
/** How long going over to another view takes, in ms. */
const GLIDE_TIME = 320
/** What is being dragged is larger, for there being no pointer to find it by. */
const HELD_SCALE = 1.3

/** Which way `angle` faces on screen, in radians. */
function facing(angle: number): number {
	const radians = (angle * Math.PI) / 180
	const [a, b, c, d] = onScreen.value
	const [x, y] = [Math.cos(radians), Math.sin(radians)]
	return Math.atan2(b * x + d * y, a * x + c * y)
}

function drawHandle(
	context: CanvasRenderingContext2D,
	handle: Handle,
	active: boolean,
	accent: string,
	paper: string,
	dragged = false
): void {
	context.strokeStyle = accent
	context.lineWidth = active ? HOVER_WIDTH : 1
	// Under what is about to be drawn, for it to be told from what is the same color as it.
	const edged = (path?: Path2D): void => {
		const width = context.lineWidth
		context.strokeStyle = paper
		context.lineWidth = width + HANDLE_EDGE * 2
		if (path) context.stroke(path)
		else context.stroke()
		context.strokeStyle = accent
		context.lineWidth = width
	}
	if (handle.path !== undefined) {
		const path = pathOnScreen(handle.path)
		edged(path)
		context.setLineDash(handle.dashed && !active ? DASH : [])
		context.stroke(path)
		context.setLineDash([])
		return
	}
	const [x, y] = toScreen(handle.at!)
	context.save()
	context.translate(x, y)
	if (dragged) context.scale(HELD_SCALE, HELD_SCALE)
	context.fillStyle = active ? accent : paper
	if (handle.kind === 'dia') {
		context.lineWidth = 1
		edged(DIAMOND)
		context.fill(DIAMOND)
		context.stroke(DIAMOND)
	} else if (handle.kind === 'offset') {
		// Along the outline, either side of it: reached for, they point the two ways it can go.
		const bent = handle.along || (active && dragged) ? 1 : active ? hoverBend.value : 0
		const out = OFFSET_GAP + bent * OFFSET_BEND
		const reach = OFFSET_REACH + bent * (OFFSET_BENT_REACH - OFFSET_REACH)
		context.rotate(facing(handle.angle ?? 0))
		context.lineWidth = active ? 1.5 : 1
		context.lineJoin = 'miter'
		context.lineCap = 'butt'
		// A cap would go half of the width of the edge past each end, which is more than is wanted.
		const lines = (past: number): Path2D => {
			const length = Math.hypot(OFFSET_GAP - out, reach)
			const [endX, endY] = [
				OFFSET_GAP + ((OFFSET_GAP - out) / length) * past,
				reach + (reach / length) * past,
			]
			const path = new Path2D()
			for (const side of [1, -1]) {
				path.moveTo(side * endX, -endY)
				path.lineTo(side * out, 0)
				path.lineTo(side * endX, endY)
			}
			return path
		}
		edged(lines(HANDLE_EDGE_PAST))
		context.stroke(lines(0))
	} else if (handle.kind === 'direction') {
		context.rotate(facing(handle.angle ?? 0))
		context.lineJoin = 'round'
		context.lineCap = 'round'
		edged(POINTER)
		context.stroke(POINTER)
	} else {
		// Which way an arrow pulls is for when it is reached for, along with the cursor.
		if (handle.kind === 'translate' || (handle.kind === 'arrow' && active)) {
			context.save()
			context.rotate(facing(handle.angle ?? 0))
			context.lineWidth = 1
			edged(handle.kind === 'arrow' ? ARROW : CROSS)
			context.stroke(handle.kind === 'arrow' ? ARROW : CROSS)
			context.restore()
		}
		context.lineWidth = 1
		context.beginPath()
		if (handle.corner) {
			context.rotate(facing(0))
			context.rect(-CORNER_HALF, -CORNER_HALF, CORNER_HALF * 2, CORNER_HALF * 2)
		} else {
			context.arc(0, 0, HANDLE_RADIUS, 0, Math.PI * 2)
		}
		edged()
		context.fill()
		context.stroke()
	}
	context.restore()
}

const SNAP_LABEL_FONT = `11px ${getComputedStyle(window.document.documentElement).getPropertyValue('--tq-font-numeric') || 'sans-serif'}`

/** The line through two places, on and on past them, broken to say it is not there. */
function drawExtended(context: CanvasRenderingContext2D, [ax, ay]: Vec, [bx, by]: Vec): void {
	const length = Math.hypot(bx - ax, by - ay)
	if (length === 0) return
	const reach = (size.value[0] + size.value[1]) / length
	context.save()
	context.lineWidth = 1
	context.setLineDash(DASH)
	context.beginPath()
	context.moveTo(ax - (bx - ax) * reach, ay - (by - ay) * reach)
	context.lineTo(bx + (bx - ax) * reach, by + (by - ay) * reach)
	context.stroke()
	context.restore()
}

/**
 * What has been snapped to, as Illustrator says it: a mark there, the line if it was
 * one, and its name.
 */
function drawSnap(
	context: CanvasRenderingContext2D,
	{ at, label, line, beyond, target, code }: SnapPoint,
	accent: string,
	paper: string
): void {
	const [x, y] = toScreen(at, view.value)
	context.save()
	context.strokeStyle = accent
	if (line) {
		const [[ax, ay], [bx, by]] = [toScreen(line[0], view.value), toScreen(line[1], view.value)]
		context.lineWidth = 2
		context.beginPath()
		context.moveTo(ax, ay)
		context.lineTo(bx, by)
		context.stroke()
		if (beyond) drawExtended(context, [ax, ay], [bx, by])
	} else {
		context.lineWidth = 2
		context.beginPath()
		context.arc(x, y, HANDLE_RADIUS + 2, 0, Math.PI * 2)
		context.stroke()
	}
	// Bare, with an edge of the paper to stay readable over what is under it, and bold
	// if it will be referred to, rather than only being the same.
	if (label === '') {
		context.restore()
		return
	}
	context.font = target === null && code === undefined ? SNAP_LABEL_FONT : `bold ${SNAP_LABEL_FONT}`
	context.textBaseline = 'middle'
	const [left, top] = [x + 11, y - 13]
	context.lineJoin = 'round'
	context.lineWidth = 3
	context.strokeStyle = paper
	context.strokeText(label, left, top)
	context.fillStyle = accent
	context.fillText(label, left, top)
	context.restore()
}

/** What is being changed, beside the pointer, to read as it goes. */
function drawReadout(
	context: CanvasRenderingContext2D,
	ink: string,
	mute: string,
	border: string,
	paper: string
): void {
	if (readout.value === null) return
	const { at, lines, fallback, place } = readout.value
	// A path's data says nothing to read, so it is where it has got to.
	const said =
		lines.length > 0
			? lines
			: [`${fallback} ${place.map(n => Math.round(n * 1000) / 1000).join(', ')}`.trim()]
	context.save()
	context.font = SNAP_LABEL_FONT
	context.textBaseline = 'middle'
	// What it is called goes quietly, for what it is to stand out.
	const parts = said.map(line => {
		const [, name = '', value = line] = /^(.*?) ?(-?[\d.]+(?:, -?[\d.]+)*)$/.exec(line) ?? []
		const nameWidth = name === '' ? 0 : context.measureText(`${name} `).width
		return { name, value, nameWidth }
	})
	const width =
		Math.max(...parts.map(({ value, nameWidth }) => nameWidth + context.measureText(value).width)) + 12
	const [left, top] = [at[0] + 14, at[1] + 14]
	context.beginPath()
	context.roundRect(left, top, width, said.length * 15 + 5, 4)
	context.fillStyle = paper
	context.strokeStyle = border
	context.lineWidth = 1
	context.fill()
	context.stroke()
	parts.forEach(({ name, value, nameWidth }, i) => {
		const y = top + 10.5 + i * 15
		context.fillStyle = mute
		context.fillText(name, left + 6, y)
		context.fillStyle = ink
		context.fillText(value, left + 6 + nameWidth, y)
	})
	context.restore()
}

function draw(): void {
	const canvas = $canvas.value
	const context = canvas?.getContext('2d')
	if (!canvas || !context) return
	const ratio = window.devicePixelRatio
	const [width, height] = size.value
	// Only when it has to, as this makes the whole of it anew.
	const [pixelsWide, pixelsHigh] = [Math.round(width * ratio), Math.round(height * ratio)]
	if (canvas.width !== pixelsWide || canvas.height !== pixelsHigh) {
		canvas.width = pixelsWide
		canvas.height = pixelsHigh
	}
	context.setTransform(ratio, 0, 0, ratio, 0, 0)
	context.clearRect(0, 0, width, height)

	if (background.value !== null) {
		context.fillStyle = background.value
		context.fillRect(0, 0, width, height)
	}

	// The theme's text is for the theme's background, not for the one the program says.
	const ink = background.value === null ? color('--tq-color-text') : inkOn(background.value)
	const guide = background.value === null ? color('--tq-color-text-subtle') : ink
	const accent = color('--tq-color-accent')
	const expression = color('--tq-color-info')
	const paper = color('--tq-color-background')

	if (props.grid === 'dots' || props.grid === 'lines') {
		const [zoom, , , , offsetX, offsetY] = view.value
		const xs = offAxis(gridPositions(zoom, offsetX, width), offsetX)
		const ys = offAxis(gridPositions(zoom, offsetY, height), offsetY)
		context.beginPath()
		if (props.grid === 'dots') {
			for (const x of xs) {
				for (const y of ys) context.rect(x - GRID_DOT / 2, y - GRID_DOT / 2, GRID_DOT, GRID_DOT)
			}
			context.fillStyle = ink
			context.globalAlpha = GRID_DOT_ALPHA
			context.fill()
		} else {
			for (const x of xs) {
				context.moveTo(x, 0)
				context.lineTo(x, height)
			}
			for (const y of ys) {
				context.moveTo(0, y)
				context.lineTo(width, y)
			}
			context.strokeStyle = ink
			context.lineWidth = 1
			context.globalAlpha = GRID_LINE_ALPHA
			context.stroke()
		}
		// The axes, through the program's origin, for telling where that is from anywhere.
		context.beginPath()
		context.moveTo(offsetX, 0)
		context.lineTo(offsetX, height)
		context.moveTo(0, offsetY)
		context.lineTo(width, offsetY)
		context.strokeStyle = ink
		context.lineWidth = 1
		context.globalAlpha = GRID_AXIS_ALPHA
		context.stroke()
		context.globalAlpha = 1
	}

	const isMarked = ({ row }: Shape): boolean =>
		taken.value.includes(row) || row === hovered.value
	const drawPoint = (shape: Shape): void => {
		const [px, py] = toScreen(shape.value as Vec, view.value)
		context.beginPath()
		context.arc(px, py, 2.5, 0, Math.PI * 2)
		context.fill()
	}

	for (const shape of scene.value) {
		if (shape.draw === 'frame') {
			// An area is not part of the drawing, and is only outlined, faintly, to see where it is.
			context.save()
			context.globalAlpha = FRAME_ALPHA
			context.lineWidth = 1
			context.stroke(pathOnScreen(shape.value as Path, view.value))
			context.restore()
		} else if (shape.draw === 'path') {
			const onScreenPath = pathOnScreen(shape.value as Path, view.value)
			const { paint } = shape
			if (paint !== undefined) {
				if (paint.fill !== 'none') {
					context.fillStyle = paint.fill
					context.fill(onScreenPath)
				}
				if (paint.stroke !== 'none' && paint.width > 0) {
					context.strokeStyle = paint.stroke
					const zoom = view.value[0]
					context.lineWidth = paint.width * zoom
					context.lineCap = paint.cap
					context.lineJoin = paint.join
					context.miterLimit = paint.miterLimit
					context.setLineDash(paint.dash.map(length => length * zoom))
					context.lineDashOffset = paint.dashOffset * zoom
					context.stroke(onScreenPath)
					context.lineCap = 'butt'
					context.lineJoin = 'miter'
					context.miterLimit = NO_PAINT.miterLimit
					context.setLineDash([])
					context.lineDashOffset = 0
				}
			}
			if (paint === undefined && !isMarked(shape)) {
				// With no style it has no look of its own, and is only there to be found and worked on.
				context.save()
				context.globalAlpha = UNPAINTED_ALPHA
				context.strokeStyle = ink
				context.lineWidth = 1
				context.stroke(onScreenPath)
				context.restore()
			}
		} else if (shape.draw === 'point' && !isMarked(shape)) {
			context.fillStyle = guide
			drawPoint(shape)
		}
	}

	// What is selected or about to be shows over everything drawn, whatever order that is in.
	context.strokeStyle = accent
	context.fillStyle = accent
	for (const shape of scene.value) {
		if (!isMarked(shape)) continue
		if (isOutlined(shape.draw)) {
			context.lineWidth = shape.row === hovered.value ? 2 : 1.5
			context.stroke(pathOnScreen(shape.value as Path, view.value))
		} else if (shape.draw === 'point') {
			drawPoint(shape)
		}
	}

	context.strokeStyle = accent
	context.lineWidth = 1
	// What it is made from is faint, and not dashed, to be told from what shows how it is held.
	context.globalAlpha = SOURCE_ALPHA
	for (const path of grip.value?.sources ?? []) context.stroke(pathOnScreen(path))
	context.globalAlpha = 1
	context.setLineDash(DASH)
	for (const path of grip.value?.guides ?? []) context.stroke(pathOnScreen(path))
	for (const { path, transform } of innerSelected.value) {
		context.stroke(pathOnScreen(path, gripView(transform)))
	}
	// What is selected but hidden has only this to it, as it is not drawn.
	for (const shape of hiddenSelected.value) {
		if (isOutlined(shape.draw)) context.stroke(pathOnScreen(shape.value as Path, view.value))
		else if (shape.draw === 'point') drawPoint(shape)
	}
	context.setLineDash([])

	for (const [i, handle] of grip.value?.handles.entries() ?? []) {
		const dragged = draggedHandle.value
		drawHandle(
			context,
			handle,
			dragged === null ? i === hoveredHandle.value : i === dragged,
			i === dragged && linking.value !== null ? expression : accent,
			paper,
			i === dragged
		)
	}

	if (evenLine.value !== null) {
		context.strokeStyle = accent
		drawExtended(context, evenLine.value[0], evenLine.value[1])
	}

	if (snapMark.value !== null) {
		drawSnap(context, snapMark.value, snapMark.value === linking.value ? expression : accent, paper)
	}

	drawReadout(context, ink, color('--tq-color-text-mute'), color('--tq-color-border'), paper)

	const reachOfBrush = isBrush(props.drawing) ? BRUSHES[props.drawing].reach?.(brushContext()) : undefined
	if (brushPointer.value !== null && reachOfBrush !== undefined) {
		const [x, y] = toScreen(brushPointer.value, view.value)
		context.lineWidth = 1
		context.lineJoin = 'round'
		context.lineCap = 'round'
		context.strokeStyle = accent
		context.beginPath()
		context.arc(x, y, reachOfBrush * view.value[0], 0, Math.PI * 2)
		context.stroke()
	}

	if (brushGuides.value !== null) {
		const { points = [], lines = [], arrows = [] } = brushGuides.value
		context.lineWidth = 1
		context.strokeStyle = accent
		context.fillStyle = accent
		context.setLineDash(DASH)
		for (const [from, to] of lines) {
			const [ax, ay] = toScreen(from, view.value)
			const [bx, by] = toScreen(to, view.value)
			context.beginPath()
			context.moveTo(ax, ay)
			context.lineTo(bx, by)
			context.stroke()
		}
		context.setLineDash([])
		// As what is selected has them, being what they will be once it is done.
		for (const at of points) {
			drawHandle(context, { kind: 'point', at, to: () => [] }, false, accent, paper)
		}
		for (const { at, angle } of arrows) {
			drawHandle(context, { kind: 'direction', at, angle, to: () => [] }, false, accent, paper)
		}
	}

	if (penLine.value !== null) {
		const [[ax, ay], [bx, by], guides = []] = penLine.value
		context.strokeStyle = accent
		for (const [from, to] of guides) drawExtended(context, toScreen(from, view.value), toScreen(to, view.value))
		context.lineWidth = 1
		context.beginPath()
		context.moveTo(ax, ay)
		if (penPulled.value === null) {
			context.lineTo(bx, by)
		} else {
			// As it would come out, going on from how it has been pulled.
			const [cx, cy] = toScreen(penPulled.value.out, view.value)
			context.bezierCurveTo(cx, cy, bx, by, bx, by)
		}
		context.stroke()
	}

	if (penPulled.value !== null) {
		const { at, out, into = [at[0] * 2 - out[0], at[1] * 2 - out[1]] } = penPulled.value
		const [ox, oy] = toScreen(out, view.value)
		const [ix, iy] = toScreen(into, view.value)
		const [ax, ay] = toScreen(at, view.value)
		context.lineWidth = 1
		context.strokeStyle = accent
		context.fillStyle = paper
		context.beginPath()
		context.moveTo(ix, iy)
		context.lineTo(ax, ay)
		context.lineTo(ox, oy)
		context.stroke()
		for (const [x, y] of [[ix, iy], [ox, oy]] as const) {
			context.beginPath()
			context.arc(x, y, PEN_CONTROL_RADIUS, 0, Math.PI * 2)
			context.fill()
			context.stroke()
		}
	}

	if (range.value !== null) {
		const { from, to } = range.value
		context.lineWidth = 1
		context.strokeStyle = accent
		context.fillStyle = accent
		context.beginPath()
		context.rect(from[0], from[1], to[0] - from[0], to[1] - from[1])
		context.globalAlpha = RANGE_OPACITY
		context.fill()
		context.globalAlpha = 1
		context.stroke()
	}
}

let drawing: number | null = null

/** How far what is being reached for has come to show what it does, from 0 to 1. */
const hoverBend = ref(0)
let bending: number | null = null
watch(hoveredHandle, index => {
	if (bending !== null) cancelAnimationFrame(bending)
	bending = null
	hoverBend.value = 0
	if (index === null) return
	const start = performance.now()
	const step = (now: number) => {
		hoverBend.value = Math.min(1, (now - start) / OFFSET_BEND_TIME)
		bending = hoverBend.value < 1 ? requestAnimationFrame(step) : null
	}
	bending = requestAnimationFrame(step)
})

watchEffect(() => {
	void [
		hoverBend.value,
		linking.value,
		draggedHandle.value,
		evenLine.value,
		penPulled.value,
		pencilStroke.value,
		brushGuides.value,
		brushPointer.value,
		props.attributes,
		scene.value,
		background.value,
		props.grid,
		grip.value,
		view.value,
		size.value,
		taken.value,
		hovered.value,
		hoveredHandle.value,
		range.value,
		penLine.value,
		snapMark.value,
		readout.value,
	]
	// Once a frame, however many things changed in it.
	if (drawing === null) {
		drawing = requestAnimationFrame(() => {
			drawing = null
			draw()
		})
	}
})

useResizeObserver($canvas, ([entry]) => {
	if (entry) size.value = [entry.contentRect.width, entry.contentRect.height]
})

/** What of the rows selected is not drawn itself, being something a path is made from. */
const innerSelected = computed(() =>
	taken.value.flatMap(row => {
		if (scene.value.some(shape => shape.row === row)) return []
		const found = pathOfRow(props.document.root.value, props.document.env.value, row)
		return found === null ? [] : [{ row, ...found }]
	})
)

const isOnPath = (path: Path, transform: Mat, x: number, y: number, within = false): boolean => {
	const context = $canvas.value?.getContext('2d')
	if (!context) return false
	context.save()
	context.setTransform(1, 0, 0, 1, 0, 0)
	context.lineWidth = HIT_WIDTH
	const onCanvas = pathOnScreen(path, gripView(transform))
	const hit =
		context.isPointInStroke(onCanvas, x, y) || (within && context.isPointInPath(onCanvas, x, y))
	context.restore()
	return hit
}

/** The row to take hold of at a place on screen: what is selected inside of a path, or the path. */
function rowHeldAt(x: number, y: number): string | null {
	const inner = innerSelected.value.find(({ path, transform }) => isOnPath(path, transform, x, y))
	return inner?.row ?? shapeAt(x, y)?.row ?? null
}

/** What was selected before the clicks that a double click is, the first of which selects. */
let beforeClicks: readonly string[] = []
let lastPress = -Infinity
const CLICKS_WITHIN_MS = 500

/** Goes one path further into what is there, to all that it is made from. */
function onDoubleClick(event: MouseEvent): void {
	const { offsetX: x, offsetY: y } = event
	const held = rowHeldAt(x, y)
	if (held === null) return
	const next = rowsInside(props.document.root.value, props.document.env.value, held, beforeClicks)
	if (next.length > 0) emit('select', next)
}

/** The shape at a place on screen, the last drawn first. */
function shapeAt(x: number, y: number): Shape | null {
	const context = $canvas.value?.getContext('2d')
	if (!context) return null
	context.save()
	context.setTransform(1, 0, 0, 1, 0, 0)
	context.lineWidth = HIT_WIDTH
	let found: Shape | null = null
	for (const shape of [...scene.value].reverse()) {
		if (isOutlined(shape.draw)) {
			const path = pathOnScreen(shape.value as Path, view.value)
			if (
				context.isPointInStroke(path, x, y) ||
				(hasInside(shape) && context.isPointInPath(path, x, y))
			) {
				found = shape
				break
			}
		} else if (shape.draw === 'point') {
			const [px, py] = toScreen(shape.value as Vec, view.value)
			if (Math.hypot(px - x, py - y) < HIT_WIDTH) {
				found = shape
				break
			}
		}
	}
	context.restore()
	return found
}

/** Which handle is at a place on screen: what has a place of its own before a line. */
function handleAt(x: number, y: number): number | null {
	const handles = grip.value?.handles ?? []
	const context = $canvas.value?.getContext('2d')
	// The nearest, and of those in the same place, what comes last.
	let nearest: number | null = null
	let away = HANDLE_RADIUS + 3
	for (let i = handles.length - 1; i >= 0; i--) {
		const { at } = handles[i]!
		if (at === undefined) continue
		const [hx, hy] = toScreen(at)
		const distance = Math.hypot(hx - x, hy - y)
		if (distance < away || (nearest === null && distance === away)) [nearest, away] = [i, distance]
	}
	if (nearest !== null) return nearest
	if (!context) return null
	context.save()
	context.setTransform(1, 0, 0, 1, 0, 0)
	context.lineWidth = HIT_WIDTH
	let found: number | null = null
	for (let i = handles.length - 1; i >= 0 && found === null; i--) {
		const { path } = handles[i]!
		if (path !== undefined && context.isPointInStroke(pathOnScreen(path), x, y)) found = i
	}
	context.restore()
	return found
}

/** What a handle shows it does, as a cursor. */
function shapingHandleAt(x: number, y: number): number | null {
	if (!props.drawing) return null
	const index = handleAt(x, y)
	return index !== null && onlyShapes(grip.value!.handles[index]!) ? index : null
}

function cursorOf(handle: Handle): string {
	if (handle.kind === 'direction') return 'grab'
	if (handle.angle === undefined) return 'move'
	const quarter = Math.round((facing(handle.angle) / Math.PI) * 4 + 4) % 4
	return ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][quarter]!
}

function apply(row: string, changes: readonly Change[], root: AST = props.document.root.value) {
	return changed(root, props.document.env.value, row, changes)
}

function commit(next: ReturnType<typeof apply>): void {
	problem.value = next.problem
	const { root } = props.document
	if (next.ast?.kind === 'let' && next.ast !== root.value) props.document.setRoot(next.ast)
}

/** How far a press has to go to be a move, so that a click does not nudge anything. */
const MOVE_THRESHOLD = 3

interface Moving {
	readonly row: string
	readonly grip: Grip & { readonly transform: Mat }
}

let pressed:
	| {
			kind: 'handle'
			row: string
			handle: Handle
			mat: mat2d
			from: Vec
			offset: Vec
			/** Where the pointer has got to, on screen. */
			at: Vec | null
			/** The program as it was, for it not to go on from a reference it let go of. */
			base: AST
			/** What it can snap to, none of which is in itself. */
			points: readonly SnapPoint[]
	  }
	| { kind: 'pan'; from: [number, number] }
	| { kind: 'pen'; from: Vec; at?: Vec }
	| { kind: 'closing'; from: Vec; first: Anchor; at?: Vec }
	| { kind: 'pencil'; points: readonly SnapPoint[] }
	| { kind: 'brush' }
	| {
			kind: 'draw'
			tool: ShapeTool
			base: LetAST
			name: string
			at: Vec
			to: Vec
			/** What it can snap to, as it was before it was drawn. */
			points: readonly SnapPoint[]
			/** What it starts from, if it snapped to something. */
			snap: SnapPoint | null
			drawing: boolean
	  }
	| { kind: 'range'; base: readonly string[]; last: readonly string[] }
	| {
			kind: 'move'
			row: string
			rows: readonly Moving[]
			from: Vec
			/** Where on what is moved can line up, and what it can line up with. */
			own: readonly SnapPoint[]
			others: readonly SnapPoint[]
			moving: boolean
			collapse: boolean
			/** The program as it was, to go back to if the move is called off. */
			base: LetAST
	  }
	| null = null

let spaceDown = false
const typing = (event: Event): boolean =>
	(event.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable], .monaco-editor') != null

// What is held down says at once, without having to move, how a shape goes.
useEventListener(window, ['keydown', 'keyup'], (event: KeyboardEvent) => {
	const valueOnly = event.metaKey || event.ctrlKey
	const isModifier = ['Shift', 'Alt', 'Meta', 'Control'].includes(event.key)
	if (isModifier && pressed?.kind === 'draw' && pressed.drawing) {
		drawPressed(event.shiftKey, valueOnly, event.altKey)
	}
	if (isModifier && pressed?.kind === 'handle') dragHandle(event.altKey, valueOnly, event.shiftKey)
	if (isModifier && pressed?.kind === 'pen' && pressed.at !== undefined) {
		pullPen(pressed.at[0], pressed.at[1], event.altKey, valueOnly, event.shiftKey)
	}
	if (isModifier && pressed?.kind === 'closing' && pressed.at !== undefined) {
		pullClosing(pressed.at[0], pressed.at[1], event.altKey, valueOnly, event.shiftKey)
	}
	if (isModifier && pressed === null && props.drawing === 'pen' && pen !== null && penPointer !== null) {
		hoverPen(penPointer[0], penPointer[1], event.shiftKey, valueOnly)
	}
})

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
	if (event.code !== 'Space' || typing(event)) return
	spaceDown = true
	if (pressed === null) cursor.value = 'grab'
	event.preventDefault()
})
useEventListener(window, 'keyup', (event: KeyboardEvent) => {
	if (event.code !== 'Space') return
	spaceDown = false
	if (pressed === null) cursor.value = 'default'
})

function onPointerDown(event: PointerEvent): void {
	problem.value = null
	held.value = null
	// The middle button is the ZUI's.
	if (event.button !== 0) return
	if (event.timeStamp - lastPress > CLICKS_WITHIN_MS) beforeClicks = props.selected
	lastPress = event.timeStamp
	const { offsetX: x, offsetY: y } = event
	$canvas.value?.setPointerCapture(event.pointerId)

	if (spaceDown) {
		pressed = { kind: 'pan', from: [event.clientX, event.clientY] }
		cursor.value = 'grabbing'
		return
	}

	// With a tool in hand, what is only there to shape something is still that.
	const shaping = shapingHandleAt(x, y)
	if (shaping !== null) {
		penLine.value = null
	} else if (props.drawing === 'pen') {
		penDown(x, y, event.metaKey || event.ctrlKey, event.shiftKey)
		return
	} else if (isBrush(props.drawing)) {
		pressBrush(props.drawing, x, y)
		return
	} else if (props.drawing === 'pencil') {
		const points = snapPoints()
		pencilStroke.value = [snapAt(points, x, y)?.at ?? fromScreen(x, y)]
		pencilBase = props.document.root.value
		pencilFit = NOTHING_SETTLED
		pencilSteady = steadied(null, [x, y], event.timeStamp, pencilSmoothness())
		pencilTip = null
		// All of it, however many times it is written on the way, undoes as one.
		props.document.hold()
		pressed = { kind: 'pencil', points }
		return
	} else if (props.drawing) {
		const base = props.document.root.value
		pressed = {
			kind: 'draw',
			tool: props.drawing,
			base,
			name: '',
			at: [x, y],
			to: [x, y],
			points: snapPoints(),
			snap: snapAt(snapPoints(), x, y),
			drawing: false,
		}
		return
	}

	const index = shaping ?? handleAt(x, y)
	if (index !== null && grip.value !== null) {
		const handle = grip.value.handles[index]!
		const owner = gripped.value!.rowOf[index]!
		const mat = onScreen.value
		const from = fromScreen(x, y, mat)
		const at = handle.at ?? from
		draggedHandle.value = index
		pressed = {
			kind: 'handle',
			row: owner,
			handle,
			mat,
			from,
			// It stays where it was taken, wherever on it that was.
			offset: [at[0] - from[0], at[1] - from[1]],
			at: null,
			base: props.document.root.value,
			points:
				grip.value.transform.join() === '1,0,0,1,0,0' && handle.at !== undefined
					? snapPoints(
							props.document.root.value,
							changedBy(owner, handle.to(add(at, TRIAL), from))
						)
					: [],
		}
		return
	}

	const heldRow = rowHeldAt(x, y)
	const shape = heldRow === null ? null : { row: heldRow }
	if (shape !== null) {
		const already = taken.value.includes(shape.row)
		const rows = event.shiftKey
			? already
				? taken.value.filter(row => row !== shape.row)
				: [...taken.value, shape.row]
			: already
				? taken.value
				: [shape.row]
		if (rows !== props.selected) emit('select', rows)
		// A press both selects and takes hold of what it selected.
		const moving = rows.flatMap(row => {
			const found = gripOfRow(row)
			return found === null ? [] : [{ row, grip: found }]
		})
		pressed = {
			kind: 'move',
			row: shape.row,
			rows: moving,
			from: [x, y],
			...(() => {
				const snaps = snapsFor(moving)
				const near = fromScreen(x, y)
				return { ...snaps, own: placesTakenBy(snaps.own, near, SNAP_REACH / view.value[0]) }
			})(),
			moving: false,
			collapse: already && !event.shiftKey && rows.length > 1,
			base: props.document.root.value,
		}
		return
	}

	const base = event.shiftKey ? taken.value : []
	if (!event.shiftKey && taken.value.length > 0) emit('select', [])
	pressed = { kind: 'range', base, last: base }
	range.value = { from: [x, y], to: [x, y] }
}

/** With a copy of how what is drawn is painted, in the row just drawn as `name`. */
const painted = (root: LetAST, name: string): LetAST =>
	props.attributes
		? withPaintDrawn(root, props.document.env.value, name, props.attributes.paint)
		: root

const paintedLine = (root: LetAST, name: string, filled: boolean): LetAST =>
	props.attributes
		? withPaintDrawn(root, props.document.env.value, name, paintOfLine(props.attributes.paint, filled))
		: root

/** What it comes to, as far as it has got, and it is what is selected, whatever that is. */
function writePen(closed: boolean): void {
	if (pen === null) return
	const last = pen.anchors.at(-1)
	penPulled.value =
		!closed && last?.out !== undefined
			? { at: last.at, out: last.out, ...(last.into === undefined ? {} : { into: last.into }) }
			: null
	const { ast, name } = penned(pen.base, props.document.env.value, pen.anchors, closed)
	props.document.setRoot(paintedLine(ast, name, closed))
	if (name !== pen.name) emit('select', [`binding:${name}`])
	pen.name = name
}

const closesPen = (x: number, y: number): boolean => {
	const first = pen?.anchors[0]
	if (first === undefined || pen!.anchors.length < 2) return false
	const [hx, hy] = toScreen(first.at, view.value)
	return Math.hypot(hx - x, hy - y) <= HANDLE_RADIUS + 3
}

/** What a pen would do here to what is selected, rather than drawing something new. */
function modulationHere(x: number, y: number): Modulation | null {
	const [row, other] = taken.value
	if (pen !== null || extending !== null || row === undefined || other !== undefined) return null
	const { root, env } = props.document
	return modulationAt(root.value, env.value, row, fromScreen(x, y), SNAP_REACH / view.value[0])
}

const MODULATION_LABEL: Readonly<Record<Modulation['kind'], string>> = {
	insert: 'add point',
	remove: 'remove point',
	continue: 'continue',
}

/** The row a pen is going on from one end of. */
let extending: { row: string; end: 'start' | 'end' } | null = null

function setModulated(next: { ast: AST; row: string } | null): void {
	if (next === null || next.ast.kind !== 'let') return
	props.document.setRoot(next.ast)
	if (taken.value[0] !== next.row) emit('select', [next.row])
}

/** Where a pen would go, at this place on screen: on something, or lined up with itself. */
function penNext(
	x: number,
	y: number,
	even: boolean
): { at: Vec; snap: SnapPoint | null; lines: readonly (readonly [Vec, Vec])[] } {
	const near = even ? null : snapAt(snapPoints(pen?.base), x, y)
	const to = roundedPlace(x, y)
	// A place is more of a place than being in line with one. A line is less of one.
	if (near !== null && near.line === undefined) return { at: near.at, snap: near, lines: [] }
	const tolerance = props.snapping ? SNAP_REACH / view.value[0] : 0
	const guided = pen === null ? null : penGuided(pen.anchors, to, tolerance, even, pointerStep())
	if (guided !== null) return { ...guided, snap: null }
	return { at: near?.at ?? to, snap: near, lines: [] }
}

/** What a pen shows of where it would go next, at this place on screen. */
function hoverPen(x: number, y: number, even: boolean, valueOnly: boolean): void {
	penPointer = [x, y]
	const closes = closesPen(x, y)
	const modulation = modulationHere(x, y)
	cursor.value = closes || modulation !== null ? 'pointer' : 'crosshair'
	const next = closes || modulation !== null ? null : penNext(x, y, even)
	const near = next?.snap ?? null
	// What a pen goes on to write can be a path as a whole, with no place in it to refer from.
	const toPath =
		near !== null &&
		penKind([...(pen?.anchors ?? []), { at: near.at }], false) === 'path' &&
		(pen?.anchors.length ?? 0) > 0
	linking.value = near !== null && canRefer(near) && !toPath && !valueOnly ? near : null
	snapMark.value =
		modulation === null ? near : { at: modulation.at, target: null, label: MODULATION_LABEL[modulation.kind] }
	const last = pen?.anchors.at(-1)
	penLine.value = last
		? [toScreen(last.at, view.value), next === null ? [x, y] : toScreen(next.at, view.value), next?.lines ?? []]
		: null
}

function penDown(x: number, y: number, valueOnly: boolean, even: boolean): void {
	const { root, env } = props.document
	if (extending !== null) {
		const here = modulationAt(
			root.value,
			env.value,
			extending.row,
			fromScreen(x, y),
			SNAP_REACH / view.value[0]
		)
		const otherEnd = extending.end === 'end' ? 'start' : 'end'
		if (here?.kind === 'continue' && here.end === otherEnd) {
			setModulated(withPointsClosed(root.value, env.value, extending.row))
			extending = null
			return
		}
		const count = gripAt(root.value, env.value, extending.row)?.handles.length ?? 0
		const next = withPointInserted(
			root.value,
			env.value,
			extending.row,
			extending.end === 'end' ? count : 0,
			snapAt(snapPoints(root.value, new Set([extending.row])), x, y)?.at ?? fromScreen(x, y),
			pointerStep()
		)
		if (next !== null) {
			extending = { ...extending, row: next.row }
			setModulated(next)
		}
		return
	}
	const modulation = modulationHere(x, y)
	if (modulation !== null) {
		const row = taken.value[0]!
		if (modulation.kind === 'continue') extending = { row, end: modulation.end }
		else if (modulation.kind === 'remove') {
			setModulated(withPointRemoved(root.value, env.value, row, modulation.index))
		} else {
			setModulated(
				withPointInserted(root.value, env.value, row, modulation.index, modulation.at, pointerStep())
			)
		}
		snapMark.value = null
		return
	}
	if (closesPen(x, y)) {
		// Closed as it is, until it is let go of, for how it comes back to be pulled.
		writePen(true)
		penLine.value = null
		pressed = { kind: 'closing', from: [x, y], first: pen!.anchors[0]! }
		return
	}
	if (pen === null) {
		const base = props.document.root.value
		pen = { base, name: '', anchors: [] }
	}
	const { at, snap } = penNext(x, y, even)
	pen.anchors = [
		...pen.anchors,
		{
			at,
			...(snap !== null && !valueOnly ? { snap } : {}),
		},
	]
	writePen(false)
	// From here on it is the curve, until the pointer is let go of.
	penLine.value = null
	pressed = { kind: 'pen', from: [x, y] }
}

/** How a path comes back to where it started, pulled to a place, and it is closed as that. */
function pullClosing(x: number, y: number, broken: boolean, uneven: boolean, even: boolean): void {
	if (pen === null || pressed?.kind !== 'closing') return
	const first = closingPulled(pressed.first, roundedPlace(x, y), { broken, uneven, even })
	pen.anchors = [first, ...pen.anchors.slice(1)]
	writePen(true)
	const { at, out = at, into = at } = first
	penPulled.value = { at, out, into }
}

/** The anchor a pen has got to, pulled to a place: broken with Option, uneven with Command, by even angles with Shift. */
function pullPen(x: number, y: number, broken: boolean, uneven: boolean, even: boolean): void {
	if (pen === null) return
	const anchor = pen.anchors.at(-1)!
	const { into: _into, ...rest } = anchor
	const pulled = roundedPlace(x, y)
	const step = pointerStep()
	const out: Vec = even
		? (evenlyFrom(anchor.at, pulled).map(n => roundedTo(n, step)) as unknown as Vec)
		: pulled
	evenLine.value = even ? [toScreen(anchor.at, view.value), toScreen(out, view.value)] : null
	const was = anchor.out
	const before = was === undefined ? anchor.at : (anchor.into ?? ([anchor.at[0] * 2 - was[0], anchor.at[1] * 2 - was[1]] as Vec))
	const into = broken
		? before
		: uneven && was !== undefined
			? otherControl(anchor.at, out, before, was, { smooth: true })
			: null
	pen.anchors = [...pen.anchors.slice(0, -1), { ...rest, out, ...(into === null ? {} : { into }) }]
	writePen(false)
}

const pencilSmoothness = (): number => (props.attributes?.shape ?? SHAPE_ATTRIBUTES).smoothness
const pencilTolerance = (): number => pencilSmoothness() / view.value[0]

const writePencilled = (next: { ast: LetAST; name: string } | null): void =>
	props.document.setRoot(
		next === null
			? pencilBase!
			: paintedLine(next.ast, next.name, props.attributes?.shape.pencilFill ?? false)
	)

/** What the stroke comes to, as far as it has got, as it will be drawn: it is there from the first. */
function writePencil(stroke: readonly Vec[], tip?: Vec): void {
	if (pencilBase === null || stroke.length < 2) return
	pencilFit = fitFurther(
		pencilFit,
		stroke,
		pencilTolerance(),
		Math.max(PENCIL_LONGEST, pencilSmoothness() * PENCIL_LONGEST_PER_SMOOTHNESS) / view.value[0]
	)
	writePencilled(pencilledAs(pencilBase, pathOfFit(pencilFit, stroke, tip)))
}

/** That is the stroke, as a curve, which is left unselected for there to be another. */
function finishPencil(end: SnapPoint | null): void {
	const was = pencilStroke.value
	if (was !== null && pencilBase !== null) {
		// It goes all the way to where it was let go of, which what steadied it had not caught up with.
		const last = end?.at ?? pencilTip
		const stroke = last === null ? was : [...was, last]
		// Only coming back to where it began is more than going on from what has settled.
		if (pencilCloses(stroke, SNAP_REACH / view.value[0])) {
			writePencilled(pencilled(pencilBase, stroke, pencilTolerance(), SNAP_REACH / view.value[0]))
		} else {
			writePencil(stroke)
		}
	}
	const drew = was !== null && props.document.root.value !== pencilBase
	pencilStroke.value = null
	pencilBase = null
	props.document.release()
	if (drew) emit('select', [])
}

const brushContext = (): BrushContext => ({
	paint: props.attributes?.paint ?? NO_PAINT,
	shape: props.attributes?.shape ?? SHAPE_ATTRIBUTES,
	zoom: view.value[0],
})

/** What the brush comes to, as far as it has got, with what there is to go by. */
function writeBrush(final: boolean): void {
	if (brush === null) return
	const { def, state, base } = brush
	props.document.setRoot(brushed(base, props.document.env.value, def, state, brushContext(), final))
	brushGuides.value = final ? null : def.guides(state, brushContext())
}

function pressBrush(name: BrushName, x: number, y: number): void {
	if (brush === null) {
		const def = BRUSHES[name] as Brush
		const base = props.document.root.value
		// All of it, over however many presses, undoes as one. Its seed is chosen here, as an edit
		// is, and is only a number in the program from then on.
		props.document.hold()
		brush = { def, base, state: def.start(Math.floor(Math.random() * BRUSH_SEEDS)) }
	}
	brush.state = brush.def.press(brush.state, fromScreen(x, y), brushContext())
	pressed = { kind: 'brush' }
	writeBrush(false)
}

/** That is all of it, with nothing left following the pointer, or else it never was. */
function finishBrush(): void {
	if (brush === null) return
	writeBrush(true)
	const { base, def } = brush
	const drew = props.document.root.value !== base
	if (!drew) props.document.rewind(base)
	brush = null
	brushGuides.value = null
	props.document.release()
	emit('select', drew && def.selectedAfter ? [`binding:${nameOfKind(base, def.kind)}`] : [])
}

/** That is the path, as far as it went. With only one place, it is no path at all. */
function finishPen(): void {
	penPulled.value = null
	extending = null
	if (pen !== null && pen.anchors.length < 2) {
		props.document.setRoot(pen.base)
		emit('select', [])
	}
	pen = null
	penLine.value = null
}

watch(() => props.drawing, finishPen)
watch(
	() => props.drawing,
	() => {
		finishBrush()
		brushPointer.value = null
	}
)
// Going off to something else in the middle of a stroke is leaving it undrawn.
watch(
	() => props.drawing,
	() => {
		if (pressed?.kind !== 'pencil') return
		pressed = null
		pencilStroke.value = null
		if (pencilBase !== null) props.document.rewind(pencilBase)
		pencilBase = null
		props.document.release()
	}
)

// Before it is what it means to a row in the tree.
useEventListener(
	window,
	'keydown',
	(event: KeyboardEvent) => {
		if (event.key !== 'Enter' || (pen === null && extending === null && brush === null) || typing(event)) return
		event.stopPropagation()
		event.preventDefault()
		finishPen()
		finishBrush()
	},
	{ capture: true }
)

/** Of those of `kind` that are of `row`, the handle nearest to `to`, or as it was if there are none. */
function nearestHandleOf(row: string, kind: Handle['kind'], to: Vec): number | null {
	let nearest = draggedHandle.value
	let distance = Infinity
	for (const [i, { kind: other, at }] of grip.value?.handles.entries() ?? []) {
		if (gripped.value?.rowOf[i] !== row || other !== kind || at === undefined) continue
		const away = Math.hypot(at[0] - to[0], at[1] - to[1])
		if (away < distance) [nearest, distance] = [i, away]
	}
	return nearest
}

/** The handle being dragged, to where the pointer has got. */
function dragHandle(symmetric: boolean, valueOnly: boolean, even: boolean): void {
	if (pressed?.kind !== 'handle' || pressed.at === null) return
	const { row, handle, mat, from, offset, at, base, points } = pressed
	const [px, py] = fromScreen(at[0], at[1], mat)
	const wanted: Vec = [px + offset[0], py + offset[1]]
	const snap = snapNear(points, wanted)
	snapMark.value = snap

	const changes = handle.to(snap?.at ?? wanted, from, { symmetric, even, smooth: valueOnly })
	const finest = handle.fine ? pointerStep() / FINE_BY : pointerStep()
	const rounded = roundedChanges(changes, finest)
	const next = apply(row, rounded, base)
	const { place } = handle
	let link: SnapPoint | null = null
	if (next.ast !== null && snap !== null && !valueOnly && !symmetric && !handle.constrained && typeof place === 'number') {
		const referring = linked(next.ast, props.document.env.value, row, place, snap)
		if (referring !== null) next.ast = referring
		link = referring === null ? null : snap
	}
	linking.value = link
	commit(next)
	// A side taken past the other is the other one now, wherever it has been let go.
	draggedHandle.value = nearestHandleOf(row, handle.kind, snap?.at ?? wanted)
	const now = draggedHandle.value === null ? undefined : grip.value?.handles[draggedHandle.value]?.at
	const pivot = symmetric ? (handle.middle ?? handle.pivot) : handle.pivot
	evenLine.value = even && pivot !== undefined && now !== undefined ? [toScreen(pivot), toScreen(now)] : null
	const numbers =
		props.dimensions && next.ast !== null
			? dimensionsHeld(next.ast, props.document.env.value, row, handle, rounded, base, snap?.at ?? wanted, {
					symmetric,
				})
			: []
	hold(row, numbers, at, 0, saysOutside(handle) ? handle.kind : null)
	// Exact numbers are for when they have been asked for.
	readout.value =
		!props.dimensions || next.ast === null || numbers.length > 0
			? null
			: {
					at,
					lines: readoutOf(next.ast, props.document.env.value, row, rounded, base),
					fallback: handle.name ?? '',
					place: snap?.at ?? wanted,
				}
}

/** The shape being drawn, as far as the pointer has got, and as even as asked. */
function drawPressed(even: boolean, valueOnly: boolean, fromCenter: boolean): void {
	if (pressed?.kind !== 'draw') return
	const [fromX, fromY] = pressed.at
	const [x, y] = pressed.to
	// It is named for what it is, which can change as it is drawn.
	const name = nameFor(pressed.base, pressed.tool, even)
	const end = snapAt(pressed.points, x, y)
	snapMark.value = end
	linking.value = null
	const to = end?.at ?? fromScreen(x, y)
	const { base, tool, snap } = pressed
	const { env } = props.document
	const start = snap?.at ?? fromScreen(fromX, fromY)
	evenLine.value =
		even && facesWhenDrawn(tool)
			? [toScreen(start, view.value), toScreen(evenlyFrom(start, to), view.value)]
			: null
	const shape = props.attributes?.shape
	props.document.setRoot(
		painted(
			// Command has it only be the same value, for now, rather than refer to that.
			snap === null || valueOnly
				? drawn(base, name, tool, snap?.at ?? fromScreen(fromX, fromY), to, even, pointerStep(), false, fromCenter, shape)
				: drawnFrom(base, env.value, name, tool, snap, to, even, pointerStep(), fromCenter, shape),
			name
		)
	)
	if (name !== pressed.name) emit('select', [`binding:${name}`])
	pressed.name = name
	pressed.drawing = true
	if (props.dimensions) {
		const row = `binding:${name}`
		const { dimensions, first } = dimensionsDrawn(props.document.root.value, env.value, row)
		hold(row, dimensions, [x, y], first, null, true)
	}
}

function onPointerMove(event: PointerEvent): void {
	const { offsetX: x, offsetY: y } = event
	if (pressed === null) {
		const shaping = shapingHandleAt(x, y)
		if (shaping !== null) {
			hovered.value = null
			hoveredHandle.value = shaping
			snapMark.value = null
			penLine.value = null
			cursor.value = cursorOf(grip.value!.handles[shaping]!)
			return
		}
		if (props.drawing === 'pen') {
			hovered.value = null
			hoveredHandle.value = null
			hoverPen(x, y, event.shiftKey, event.metaKey || event.ctrlKey)
			return
		}
		if (isBrush(props.drawing)) {
			hovered.value = null
			hoveredHandle.value = null
			penLine.value = null
			cursor.value = 'crosshair'
			brushPointer.value = fromScreen(x, y)
			if (brush !== null) {
				brush.state = brush.def.move(brush.state, fromScreen(x, y))
				writeBrush(false)
			}
			return
		}
		if (props.drawing) {
			hovered.value = null
			hoveredHandle.value = null
			cursor.value = 'crosshair'
			const near = snapAt(snapPoints(), x, y)
			linking.value = near !== null && canRefer(near) && !event.metaKey && !event.ctrlKey ? near : null
			snapMark.value = near
			penLine.value = null
			return
		}
		const index = handleAt(x, y)
		const shape = index === null ? shapeAt(x, y) : null
		hoveredHandle.value = index
		hovered.value = shape?.row ?? null
		cursor.value = spaceDown
			? 'grab'
			: index !== null
				? cursorOf(grip.value!.handles[index]!)
				: shape !== null
					? 'move'
					: 'default'
		return
	}
	switch (pressed.kind) {
		case 'brush': {
			if (brush === null) break
			brushPointer.value = fromScreen(x, y)
			for (const sample of samplesOf(event, $canvas.value!.getBoundingClientRect())) {
				brush.state = brush.def.drag(brush.state, fromScreen(sample.at[0], sample.at[1]))
			}
			writeBrush(false)
			break
		}
		case 'pencil': {
			const stroke = [...(pencilStroke.value ?? [])]
			for (const sample of samplesOf(event, $canvas.value!.getBoundingClientRect())) {
				pencilSteady = steadied(pencilSteady, sample.at as Vec, sample.time, pencilSmoothness())
				pencilTip = fromScreen(sample.at[0], sample.at[1])
				const at = fromScreen(pencilSteady.at[0], pencilSteady.at[1])
				const before = stroke.at(-1)
				const far = PENCIL_STEP / view.value[0]
				if (before === undefined || Math.hypot(at[0] - before[0], at[1] - before[1]) >= far) {
					stroke.push(at)
				}
			}
			pencilStroke.value = stroke
			writePencil(stroke, pencilTip ?? undefined)
			snapMark.value = snapAt(pressed.points, x, y)
			break
		}
		case 'pen': {
			const [fromX, fromY] = pressed.from
			if (pen === null || Math.hypot(x - fromX, y - fromY) < MOVE_THRESHOLD) break
			pressed.at = [x, y]
			pullPen(x, y, event.altKey, event.metaKey || event.ctrlKey, event.shiftKey)
			break
		}
		case 'closing': {
			const [fromX, fromY] = pressed.from
			if (pen === null || (pressed.at === undefined && Math.hypot(x - fromX, y - fromY) < MOVE_THRESHOLD)) break
			pressed.at = [x, y]
			pullClosing(x, y, event.altKey, event.metaKey || event.ctrlKey, event.shiftKey)
			break
		}
		case 'draw': {
			const [fromX, fromY] = pressed.at
			if (!pressed.drawing && Math.hypot(x - fromX, y - fromY) < MOVE_THRESHOLD) return
			pressed.to = [x, y]
			drawPressed(event.shiftKey, event.metaKey || event.ctrlKey, event.altKey)
			break
		}
		case 'handle': {
			pressed.at = [x, y]
			cursor.value = 'none'
			dragHandle(event.altKey, event.metaKey || event.ctrlKey, event.shiftKey)
			break
		}
		case 'move': {
			const [fromX, fromY] = pressed.from
			if (!pressed.moving && Math.hypot(x - fromX, y - fromY) < MOVE_THRESHOLD) return
			pressed.moving = true
			hovered.value = null
			const [toX, toY] = snappedMove(pressed.own, pressed.others, pressed.from, [x, y])
			let next: ReturnType<typeof apply> = {
				ast: props.document.root.value,
				problem: null,
			}
			let moved: { row: string; numbers: Dimension[] } | null = null
			for (const { row, grip: taken } of pressed.rows) {
				if (next.ast === null || taken.move === undefined) continue
				const mat = gripView(taken.transform)
				const [ax, ay] = fromScreen(fromX, fromY, mat)
				const [bx, by] = fromScreen(toX, toY, mat)
				const changes = roundedChanges(taken.move([bx - ax, by - ay]), pointerStep())
				next = apply(row, changes, next.ast)
				// Of several, each has numbers of its own, which are not any one thing to type.
				if (props.dimensions && pressed.rows.length === 1 && next.ast !== null) {
					moved = { row, numbers: dimensionsMoved(next.ast, props.document.env.value, row, changes) }
				}
			}
			commit(next)
			if (moved !== null) hold(moved.row, moved.numbers, [x, y])
			break
		}
		case 'range': {
			const { from } = range.value!
			range.value = { from, to: [x, y] }
			const within = rowsWithin(
				scene.value,
				fromScreen(from[0], from[1]),
				fromScreen(x, y)
			)
			const rows = [...new Set([...pressed.base, ...within])]
			if (rows.join() !== pressed.last.join()) {
				pressed.last = rows
				emit('select', rows)
			}
			break
		}
		case 'pan': {
			const [fromX, fromY] = pressed.from
			stopGliding()
			view.value = mat2d.mul(
				mat2d.fromTranslation([event.clientX - fromX, event.clientY - fromY]),
				view.value
			)
			pressed.from = [event.clientX, event.clientY]
		}
	}
}

useEventListener(window, 'pointerup', event => {
	// Taken by what it was let go of over, it was being brought there, and was never moved.
	if (pressed?.kind === 'move' && pressed.moving && event.defaultPrevented) {
		props.document.rewind(pressed.base)
		problem.value = null
		held.value = null
	}
	const wasHandle = pressed?.kind === 'handle'
	const clicked = pressed?.kind === 'handle' && pressed.at === null ? pressed : null
	// A click on one of several, not having moved them, is about that one.
	if (pressed?.kind === 'move' && pressed.collapse && !pressed.moving) {
		emit('select', [pressed.row])
	}
	if (pressed?.kind === 'pan') cursor.value = spaceDown ? 'grab' : 'default'
	if (pressed?.kind === 'pencil') finishPencil(snapMark.value)
	if (pressed?.kind === 'brush' && brush !== null) {
		brush.state = brush.def.release(brush.state, fromScreen(event.offsetX, event.offsetY))
		if (brush.def.oneStroke) finishBrush()
		else writeBrush(false)
	}
	// That is how it comes back, and it is done.
	if (pressed?.kind === 'closing') {
		penPulled.value = null
		pen = null
		penLine.value = null
	}
	// Letting go of a drag is being at what it got hold of.
	if (pressed !== null && held.value !== null) {
		const base = props.document.root.value
		typed = base
		held.value = { ...held.value, editing: true, base }
	}
	pressed = null
	range.value = null
	linking.value = null
	evenLine.value = null
	snapMark.value = null
	readout.value = null
	if (clicked !== null) {
		const { root, env } = props.document
		const parts = rowsOfHandle(root.value, env.value, clicked.row, clicked.handle)
		if (parts.length > 0) {
			keptRow.value = clicked.row
			emit('select', parts)
		}
	}
	if (wasHandle) {
		draggedHandle.value = null
		// What is being drawn goes on from what was done to it.
		if (pen !== null) {
			const drawn = scene.value.find(({ row }) => row === taken.value[0])
			if (drawn !== undefined) {
				pen.anchors = anchorsAlong(pen.anchors, drawn.value as Path, {
					symmetric: event.altKey,
					smooth: event.metaKey || event.ctrlKey,
				})
			}
		}
		// The pointer is back, and is over whatever it has got to.
		if (event.target === $canvas.value) onPointerMove(event)
		else cursor.value = 'default'
	}
})
</script>

<template>
	<div class="CanvasView" data-selects-rows>
		<canvas
			ref="$canvas"
			:style="{ cursor }"
			@pointerdown="onPointerDown"
			@dblclick="onDoubleClick"
			@contextmenu.prevent="emit('menu', $event.clientX, $event.clientY, shapeAt($event.offsetX, $event.offsetY)?.row ?? null)"
			@pointermove="onPointerMove"
			@pointerleave="(hovered = null), (hoveredHandle = null), (penLine = null), (snapMark = null), (brushPointer = null)"
			@auxclick.prevent
		/>
		<Dimensions
			v-if="held !== null && heldDimensions.length > 0"
			:dimensions="heldDimensions"
			:room="size"
			:editing="held.editing"
			:first="held.first"
			:afterDrawing="held.drawn"
			:expression="typeExpression"
			@set="typeDimension"
			@done="doneTyping"
		/>
		<p v-if="problem !== null" class="problem">Cannot do that: {{ problem }}</p>
	</div>
</template>

<style scoped>
.CanvasView {
	position: relative;
	width: 100%;
	height: 100%;
	overflow: hidden;
}
canvas {
	display: block;
	width: 100%;
	height: 100%;
	touch-action: none;
}
.problem {
	position: absolute;
	bottom: var(--tq-pane-padding);
	left: var(--tq-pane-padding);
	font-family: var(--tq-font-code);
	color: var(--tq-color-error);
	pointer-events: none;
}
</style>
