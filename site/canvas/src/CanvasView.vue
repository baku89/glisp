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
import { evenFrom, otherControl, type Change, type AxesValue, type Grip, type GraphPaperValue, type Handle, type Mat, NO_PAINT, type Paint, type Path, type Vec, inkOn, onlyShapes } from './graphics'
import { dotTile, graphPaperPositions, graphPaperStep } from './graphPaper'
import { rowsAbout, viewBetween } from './rows'
import {
	changed,
	type Dimension,
	dimensionChanges,
	dimensionsHeld,
	solidOf,
	dimensionsDrawn,
	dimensionsMoved,
	dimensionsOf,
	dragStep,
	drawn,
	drawnFrom,
	gripAt,
	gripOfRows,
	diveAt,
	innerPathsOf,
	isOutside,
	isWithin,
	rowsPaintedBy,
	rowTakenAt,
	linked,
	nameFor,
	axesThrough,
	nearestSnap,
	alongSnapped,
	movedOnto,
	pulledOnto,
	drawnOnto,
	rowsHeldBy,
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
	boundsOfRows,
	cornersOfBox,
	withBoxHandles,
	hiddenShapesOf,
	pathOfRow,
	paintedIn,
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
	isGuide,
	isOutlined,
	lineOfShape,
	withGuideHandles,
	withBoxOfParts,
	boxMeasured,
	hasSizeMeasured,
	withBoxMeasured,
	numbersDifferent,
	whatStayed,
	boxWithCornerAt,
	placeOfNumbers,
	type Measured,
	type PartsOfRow,
	gripOfPointsOrNot,
	gripWithoutSegments,
	pointsWithin,
	canRefer,
	penKind,
} from './scene'
import { BRUSHES, type Brush, type BrushContext, brushed, type BrushName, type Guides, isBrush } from './brushes'
import { fitFurther, NOTHING_SETTLED, pathOfFit, type PencilFit, samplesOf, type Steady, steadied } from './pencilFit'
import { paintOfLine, withPaintDrawn } from './toolAttributes'
import { useHostDelete } from '@glisp/tweeq'

const props = defineProps<{
	document: GlispDocument
	/** The rows selected, as the tree has them too. */
	selected: readonly string[]
	/** What is pressed is to be chosen, and nothing else comes of the press. */
	picking?: boolean
	/** Where the program's origin is on screen, until the view has been moved. */
	origin: readonly [number, number]
	/** What a press does, if it draws. */
	drawing?: ShapeTool | 'pen' | 'pencil' | BrushName | null
	/** What is taken hold of is the points of a path, and not the whole of anything. */
	byPoints?: boolean
	/** What it draws from, of which what it draws has a copy. */
	attributes?: { readonly paint: Paint; readonly shape: ShapeAttributes }
	/** A drag says its numbers exactly, and they can be typed once it is let go of. */
	dimensions?: boolean
	/** A drag or a drawing goes to what it comes near. */
	snapping?: boolean
	/** Where something is about to be added, to say so while it is being chosen. */
	addingAt?: Vec | null
}>()

const emit = defineEmits<{
	select: [rows: readonly string[]]
	/** Something has been pressed on, while choosing. */
	pick: [row: string]
	/** A right click, and the row of what it was on, if anything. */
	menu: [x: number, y: number, row: string | null]
}>()

const SOURCE_ALPHA = 0.5
/** How a guide that is selected is told from one that is not, being always in the same color. */
const GUIDE_HIGHLIGHT_ALPHA = 0.25
const GUIDE_HIGHLIGHT_WIDTH = 7
const POINT_HIGHLIGHT_RADIUS = 14
/** How much there is to see of what is outside of what is isolated. */
const OUTSIDE_ALPHA = 0.25
const UNPAINTED_ALPHA = 0.25

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
/** The row gone into, outside of which everything is faint and out of reach. */
const isolation = defineModel<readonly string[]>('isolation', { default: () => [] })
const isolated = computed(() => isolation.value.at(-1) ?? null)
const taken = computed(() => rowsAbout(props.selected, keptRow.value))
/**
 * How far round what is selected has been turned, where nothing written says that. It is only
 * how the box around it is seen, and it lasts for as long as those stay selected.
 */
const boxTurn = shallowRef(0)
watch(taken, (rows, before) => {
	if (rows[0] !== keptRow.value) keptRow.value = null
	if (rows.join() !== before.join()) boxTurn.value = 0
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
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]]

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

/**
 * Where to take the pointer to, for the nearest of `own` to be on one of `others`, and which of
 * them that is, for it to go on being there.
 */
function snappedMove(
	own: readonly SnapPoint[],
	others: readonly SnapPoint[],
	[fromX, fromY]: Vec,
	[x, y]: Vec
): { to: Vec; by: { own: SnapPoint; snap: SnapPoint } | null } {
	const [ax, ay] = fromScreen(fromX, fromY)
	const [bx, by] = fromScreen(x, y)
	const [dx, dy] = [bx - ax, by - ay]
	let best: { own: SnapPoint; snap: SnapPoint; distance: number; delta: Vec } | null = null
	for (const point of own) {
		const { at } = point
		const moved: Vec = [at[0] + dx, at[1] + dy]
		const snap = snapNear(others, moved)
		if (snap === null) continue
		const distance = Math.hypot(snap.at[0] - moved[0], snap.at[1] - moved[1])
		// A place on a place before a place on a line, whichever of its places that is, as for one alone.
		const onLine = snap.line !== undefined
		const better =
			best === null ||
			(onLine === (best.snap.line !== undefined) ? distance < best.distance : !onLine)
		if (better) best = { own: point, snap, distance, delta: [snap.at[0] - at[0], snap.at[1] - at[1]] }
	}
	snapMark.value = best?.snap ?? null
	return best === null
		? { to: [x, y], by: null }
		: { to: toScreen([ax + best.delta[0], ay + best.delta[1]], view.value), by: { own: best.own, snap: best.snap } }
}

/** How near, on screen, a place has to be to be snapped to. */
const SNAP_REACH = 8
/** How far, on screen, what snapped can end up from where it snapped to, and still be on it. */
const SNAP_MISS = 0.5

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
	/** The numbers are those of the box around this, there being none written to say them. */
	measured?: Measured
	/** Which of those, as what a drag has not changed is nothing it is about. */
	shown?: readonly number[]
	/** A size goes from this much across and down the box, as it does from a side pulled, with where it is following. */
	stays?: Vec
	/** The numbers are of this corner of it, the way across and down, as it is what has been pulled. */
	corner?: Vec
} | null>(null)
/** What was last typed came to this, which is not someone else having changed it. */
let typed: AST | null = null

/** The numbers of the box around what is `measured`, as they are now, each by what it says. */
function numbersMeasured(measured: Measured, corner?: Vec): Dimension[] {
	const { root, env } = props.document
	const box = boxMeasured(root.value, env.value, measured)
	if (box === null) return []
	const [[left, top], [right, bottom]] = box
	const hasSize = corner === undefined && hasSizeMeasured(root.value, env.value, measured)
	const said: (readonly [string, number])[] = corner
		? [['X', left + corner[0] * (right - left)], ['Y', top + corner[1] * (bottom - top)]]
		: [['X', left], ['Y', top]]
	if (hasSize) said.push(['W', right - left], ['H', bottom - top])
	return said.map(([label, value], index): Dimension => ({
		route: [],
		index,
		label,
		value: Number(value.toFixed(4)),
		options: {},
		length: said.length,
	}))
}

const heldDimensions = computed(() => {
	const { root, env } = props.document
	if (held.value === null) return []
	const { row, places, at, outsideOf, measured, shown, corner, stays } = held.value
	if (measured !== undefined) {
		const dimensions = numbersMeasured(measured, corner).filter(({ index }) => shown?.includes(index!) ?? true)
		const box = boxMeasured(root.value, env.value, measured)
		if (box === null || dimensions.length === 0) return []
		const place = placeOfNumbers(box, dimensions.map(({ index }) => index!), corner, stays)
		return [{ dimensions, at: toScreen(place.at, view.value), side: place.side }]
	}
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

/** Saying the numbers of the box around what is `measured`, for lack of any written ones. */
function holdMeasured(measured: Measured, row: string, [x, y]: Vec, before: AST, pulled: 'side' | Vec | null = null): void {
	beforeExpression = null
	const { root, env } = props.document
	const [was, now] = [boxMeasured(before, env.value, measured), boxMeasured(root.value, env.value, measured)]
	const different = was === null || now === null ? [] : numbersDifferent(was, now)
	const corner = pulled !== null && pulled !== 'side' ? pulled : undefined
	const stayed = was !== null && now !== null ? whatStayed(was, now) : ([0, 0] as Vec)
	// Pulling a side is about how big it is, and pulling a corner about where that is: the rest comes of those.
	const cornerOf = ([[left, top], [right, bottom]]: readonly [Vec, Vec], [cx, cy]: Vec): number[] => [left + cx * (right - left), top + cy * (bottom - top)]
	const shown =
		corner && was !== null && now !== null
			? cornerOf(now, corner).flatMap((value, i) => (Math.abs(value - cornerOf(was, corner)[i]!) > 1e-4 ? [i] : []))
			: pulled === 'side'
				? different.filter(index => index >= 2)
				: different
	if (shown.length === 0) {
		held.value = null
		return
	}
	held.value = {
		shown,
		...(pulled === 'side' ? { stays: stayed } : {}),
		// What stays is the corner across from it, unless both have gone, as with OPT.
		...(corner
			? { corner, stays: [stayed[0] === 0.5 ? 0.5 : 1 - corner[0], stayed[1] === 0.5 ? 0.5 : 1 - corner[1]] as Vec }
			: {}),
		row,
		places: [],
		at: fromScreen(x, y),
		outsideOf: null,
		drawn: false,
		first: 0,
		editing: false,
		base: props.document.root.value,
		measured,
	}
}

function typeDimension(dimension: Dimension, value: number): void {
	if (held.value === null) return
	const { measured, corner, stays } = held.value
	if (measured !== undefined && corner !== undefined && stays !== undefined) {
		const box = boxMeasured(held.value.base, props.document.env.value, measured)
		const numbers = numbersMeasured(measured, corner).map(({ value }) => value)
		const [x = 0, y = 0] = numbers.map((it, i) => (i === dimension.index ? value : it))
		const next = box && withBoxMeasured(held.value.base, props.document.env.value, measured, boxWithCornerAt(box, corner, stays, [x, y]))
		if (!next) return
		typed = next
		commit({ ast: next, problem: null })
		return
	}
	if (measured !== undefined) {
		const numbers = numbersMeasured(measured).map(({ value }) => value)
		const [x = 0, y = 0, width, height] = numbers.map((it, i) => (i === dimension.index ? value : it))
		const { root, env } = props.document
		// From where it was let go of, for a number on its way to being typed to have no lasting effect.
		const boxBefore = boxMeasured(held.value.base, env.value, measured)
		const [wide, tall] = boxBefore ? [boxBefore[1][0] - boxBefore[0][0], boxBefore[1][1] - boxBefore[0][1]] : [0, 0]
		const [newWidth, newHeight] = [width ?? wide, height ?? tall]
		const [stayX, stayY] = held.value.stays ?? [null, null]
		const placed: [number, number] = [
			stayX === null || boxBefore === null ? x : boxBefore[0][0] + stayX * (wide - newWidth),
			stayY === null || boxBefore === null ? y : boxBefore[0][1] + stayY * (tall - newHeight),
		]
		const next = withBoxMeasured(held.value.base, env.value, measured, [...placed, newWidth, newHeight])
		if (next === null || next === root.value) return
		typed = next
		commit({ ast: next, problem: null })
		return
	}
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
	if (held.value.measured !== undefined) return 'This goes by a number.'
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

/** As small as Figma's: 7 or 8 pixels across what a path goes through, and 6 across what pulls it. */
const HANDLE_RADIUS = 3.5
const VERTEX_HALF = 3
const CONTROL_RADIUS = 2.5
const PEN_CONTROL_RADIUS = 2.5
/** How near a handle the pointer has to come for it, which is more than what is drawn of it. */
const HANDLE_REACH = 8
/** How far out from a handle the paper goes, each way, to be seen over the color of a shape. */
const HANDLE_EDGE = 1.5
const HANDLE_EDGE_ALPHA = 0.5
/** How far past the ends of a line that goes. */
const HANDLE_EDGE_PAST = 1
/** As much to be seen of a square as of a round handle. */
const CORNER_HALF = 3.5
const HIT_WIDTH = 10
const HOVER_WIDTH = 3
const DASH = [3, 2]
const RANGE_OPACITY = 0.1
const BOX_ALPHA = 0.6

const scene = computed(() => sceneOf(props.document.root.value, props.document.env.value))
const layers = computed(() => paintedIn(props.document.root.value, props.document.env.value))
const hiddenSelected = computed(() =>
	hiddenShapesOf(props.document.root.value, props.document.env.value, taken.value)
)
const solid = computed(() => solidOf(props.document.root.value, props.document.env.value))

const gripOfRow = (row: string) =>
	gripAt(props.document.root.value, props.document.env.value, row)

/** What the path that is isolated is made from, if it is a path rather than a group. */
const insideIsolated = computed(() => {
	const { root, env } = props.document
	if (isolated.value === null) return []
	return innerPathsOf(root.value, env.value, isolated.value).flatMap(row => {
		const found = pathOfRow(root.value, env.value, row)
		return found === null ? [] : [{ row, ...found }]
	})
})

/** The handles of all that is selected, and whose each of them is. */
/** The points and segments of what is selected that have been chosen, by row, for what is done to them next. */
const chosenPoints = shallowRef<readonly string[]>([])
const partsChosen = computed((): PartsOfRow[] => {
	const rows = [...new Set(chosenPoints.value.map(rowOfChosen))]
	return rows.map(row => ({
		row,
		parts: chosenPoints.value.filter(key => rowOfChosen(key) === row).map(partOfChosen),
	}))
})

/** What a tool that draws needs of a path's points is what it finds to go on from, so it has them all. */
const grippedAtAll = computed(() => {
	const all = gripOfRows(props.document.root.value, props.document.env.value, taken.value)
	return props.drawing ? gripWithoutSegments(all) : gripOfPointsOrNot(all, props.byPoints === true)
})
const gripped = computed((): (NonNullable<typeof grippedAtAll.value> & { readonly around?: readonly [Vec, Vec] | null }) | null =>
	props.byPoints ? withBoxOfParts(grippedAtAll.value, partsChosen.value) : withGuideHandles(
		withBoxHandles(
			grippedAtAll.value,
			[...scene.value, ...hiddenSelected.value],
			taken.value,
			boxTurn.value
		),
		props.document.root.value,
		props.document.env.value,
		scene.value,
		taken.value,
		row => !isOutside(row, isolation.value)
	)
)
const grip = computed(() => gripped.value?.grip ?? null)
/**
 * The handles that are what is selected of the rows they are of, such as a parameter picked in
 * the inspector, as pressing one has that be what is selected: one way as much as the other.
 */
const pickedHandles = computed((): ReadonlySet<number> => {
	const held = gripped.value
	const parts = props.selected.filter(row => !taken.value.includes(row))
	if (held === null || parts.length === 0) return new Set()
	const { root, env } = props.document
	return new Set(
		held.grip.handles.flatMap((handle, i) => {
			const owner = held.rowOf[i]
			if (owner === undefined) return []
			const said = rowsOfHandle(root.value, env.value, owner, handle)
			// All that it changes, and not only some of it, as one that changes more says more than that.
			const isPicked = said.length > 0 && said.every(row => parts.some(part => row === part || row.startsWith(`${part}/`)))
			return isPicked ? [i] : []
		})
	)
})
/** The corners of the box around what is selected, which goes with one that has a way it is turned. */
const selectedBox = computed(() => {
	// With a tool that goes by points, the only box is the one around those.
	if (props.byPoints) return gripped.value?.around ? cornersOfBox(gripped.value.around, 0) : null
	const angle = grip.value?.box?.angle ?? 0
	const box = boundsOfRows([...scene.value, ...hiddenSelected.value], taken.value, angle)
	return box === null ? null : cornersOfBox(box, angle)
})

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
	leaveIsolated,
	/** The row of what is drawn at a place on the screen, if anything is. */
	rowAtPoint(clientX: number, clientY: number): string | null {
		// Not through what floats over it.
		const canvas = $canvas.value
		if (!canvas || window.document.elementFromPoint(clientX, clientY) !== canvas) return null
		const box = canvas.getBoundingClientRect()
		return rowOfShapeAt(clientX - box.left, clientY - box.top)
	},
	/** Whether a place on the screen is the canvas itself, and not what floats over it. */
	isAt(clientX: number, clientY: number): boolean {
		return window.document.elementFromPoint(clientX, clientY) === $canvas.value
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
	/** The view as it is, to come back to. */
	view: () => view.value,
	/** Be at this view, at once. */
	jumpTo(next: mat2d): void {
		stopGliding()
		view.value = next
	},
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
/** How far out from a corner of a box the line is that turns it, and how far to either side of that it can be taken hold of. */
const TURNER_RADIUS = 13
const TURNER_REACH = 7
/** What pulls one side of a box, lying along the side: three lines, as what is taken hold of is. */
const GRIP = new Path2D('M -3 -5 V 5 M 0 -5 V 5 M 3 -5 V 5')
/** Which way something goes, for a button that has a way to go. */
const BUTTON_ARROW = new Path2D('M -4 0 H 4 M 1 -3 L 4 0 L 1 3')
/** How far either side of an outline the marks of what moves it are, and how far they bend. */
const OFFSET_GAP = 4
const OFFSET_REACH = 6.25
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
	dragged = false,
	/** Selected, which it stays as, rather than only being reached for. */
	picked = false
): void {
	context.strokeStyle = accent
	context.lineWidth = active ? HOVER_WIDTH : 1
	// Under what is about to be drawn, for it to be told from what is the same color as it.
	const edged = (path?: Path2D): void => {
		const width = context.lineWidth
		const alpha = context.globalAlpha
		// Of what it is seen over: what the program says is behind everything, or else the window.
		context.strokeStyle = solid.value ?? paper
		context.lineWidth = width + HANDLE_EDGE * 2
		context.globalAlpha = alpha * HANDLE_EDGE_ALPHA
		if (path) context.stroke(path)
		else context.stroke()
		context.globalAlpha = alpha
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
	if (handle.outsideCorner) {
		// As a rounded corner would go, around the corner, between the two sides it is between.
		context.rotate(facing(handle.angle ?? 0))
		context.lineCap = 'round'
		context.beginPath()
		context.arc(0, 0, TURNER_RADIUS, -Math.PI / 4, Math.PI / 4)
		edged()
		context.stroke()
	} else if (handle.grip) {
		context.rotate(facing(handle.angle ?? 0))
		context.lineCap = 'round'
		edged(GRIP)
		context.stroke(GRIP)
	} else if (handle.kind === 'dia' || handle.rotates) {
		context.lineWidth = 1
		edged(DIAMOND)
		context.fill(DIAMOND)
		context.stroke(DIAMOND)
	} else if (handle.kind === 'offset') {
		// Along the outline, either side of it: reached for, they point the two ways it can go.
		const bent = handle.along || (active && (dragged || picked)) ? 1 : active ? hoverBend.value : 0
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
	} else if (handle.kind === 'button') {
		context.lineWidth = 1
		context.beginPath()
		context.arc(0, 0, HANDLE_RADIUS + 3, 0, Math.PI * 2)
		edged()
		context.fill()
		context.stroke()
		context.strokeStyle = active ? paper : accent
		context.rotate(facing(handle.angle ?? 0))
		context.lineCap = 'round'
		context.lineJoin = 'round'
		context.stroke(BUTTON_ARROW)
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
		if (handle.vertex !== undefined) {
			// What a path goes through is square, as what only pulls it from a distance is not.
			context.rect(-VERTEX_HALF, -VERTEX_HALF, VERTEX_HALF * 2, VERTEX_HALF * 2)
		} else if (handle.corner) {
			// A point at a corner says which way out the corner is, which is square with the box it is of.
			context.rotate(facing(handle.kind === 'point' ? (handle.angle ?? 45) - 45 : 0))
			context.rect(-CORNER_HALF, -CORNER_HALF, CORNER_HALF * 2, CORNER_HALF * 2)
		} else {
			context.arc(0, 0, handle.control ? CONTROL_RADIUS : HANDLE_RADIUS, 0, Math.PI * 2)
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

	// The theme's text is for the theme's background, not for the color the program fills it with.
	const ink = solid.value === null ? color('--tq-color-text') : inkOn(solid.value)
	const accent = color('--tq-color-accent')
	const expression = color('--tq-color-info')
	const paper = color('--tq-color-background')

	// A color that cannot be read is not drawn, rather than leaving the one that came before.
	const paintWith = (with_: string): void => {
		context.fillStyle = 'transparent'
		context.strokeStyle = 'transparent'
		context.fillStyle = with_
		context.strokeStyle = with_
	}

	const drawAxes = ({ origin, color: axesColor, width: axesWidth }: AxesValue): void => {
		if (axesWidth <= 0) return
		const [zoom, , , , viewX, viewY] = view.value
		const x = viewX + origin[0] * zoom
		const y = viewY + origin[1] * zoom
		paintWith(axesColor)
		context.lineWidth = axesWidth
		context.beginPath()
		context.moveTo(x, 0)
		context.lineTo(x, height)
		context.moveTo(0, y)
		context.lineTo(width, y)
		context.stroke()
	}

	/** Dots as one tile repeated, so that it costs the same however many there are, with one at `x` and `y`. */
	const dotPattern = (
		dotColor: string,
		dot: number,
		gap: number,
		{ pixels, scale }: { readonly pixels: number; readonly scale: number },
		x: number,
		y: number
	): CanvasPattern | null => {
		const tile = window.document.createElement('canvas')
		tile.width = tile.height = pixels
		const drawing = tile.getContext('2d')
		if (drawing === null) return null
		// A color that cannot be read is not drawn, as with `paintWith`.
		drawing.fillStyle = 'transparent'
		drawing.fillStyle = dotColor
		const across = dot / scale
		drawing.fillRect((pixels - across) / 2, (pixels - across) / 2, across, across)
		const pattern = context.createPattern(tile, 'repeat')
		pattern?.setTransform(new DOMMatrix([scale, 0, 0, scale, x - gap / 2, y - gap / 2]))
		return pattern
	}

	const drawGraphPaper = ({ kind, color: paperColor, width: paperWidth, origin, step, adaptive }: GraphPaperValue): void => {
		if (paperWidth <= 0) return
		const [zoom, , , , viewX, viewY] = view.value
		const xs = graphPaperPositions(zoom, viewX + origin[0] * zoom, width, step, adaptive)
		const ys = graphPaperPositions(zoom, viewY + origin[1] * zoom, height, step, adaptive)
		paintWith(paperColor)
		context.lineWidth = paperWidth
		context.beginPath()
		if (kind === 'dots') {
			const [firstX, firstY] = [xs[0], ys[0]]
			if (firstX === undefined || firstY === undefined) return
			const dot = paperWidth * 2
			const gap = graphPaperStep(zoom, step, adaptive) * zoom
			// Touching, they are all one color.
			if (dot >= gap) {
				context.fillRect(0, 0, width, height)
				return
			}
			const tile = dotTile(gap, ratio)
			const pattern = tile && dotPattern(paperColor, dot, gap, tile, firstX, firstY)
			if (pattern) {
				context.fillStyle = pattern
				context.fillRect(0, 0, width, height)
				paintWith(paperColor)
				return
			}
			for (const x of xs) {
				for (const y of ys) context.rect(x - dot / 2, y - dot / 2, dot, dot)
			}
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
			context.stroke()
		}
	}

	const isHovered = (row: string): boolean => hovered.value !== null && isWithin(row, hovered.value)
	const isMarked = ({ row }: Shape): boolean =>
		taken.value.some(of => isWithin(row, of)) || isHovered(row)
	const drawPoint = (shape: Shape): void => {
		const [px, py] = toScreen(shape.value as Vec, view.value)
		context.beginPath()
		context.arc(px, py, 2.5, 0, Math.PI * 2)
		context.fill()
	}

	// From the back, whatever it is: what fills all of the canvas is covered like anything else.
	for (const shape of layers.value) {
		context.globalAlpha = isOutside(shape.row, isolation.value) ? OUTSIDE_ALPHA : 1
		if (shape.draw === 'solid') {
			paintWith(shape.value as string)
			context.fillRect(0, 0, width, height)
		} else if (shape.draw === 'graphPaper') {
			drawGraphPaper(shape.value as GraphPaperValue)
		} else if (shape.draw === 'axes') {
			drawAxes(shape.value as AxesValue)
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
				context.globalAlpha *= UNPAINTED_ALPHA
				context.strokeStyle = ink
				context.lineWidth = 1
				context.stroke(onScreenPath)
				context.restore()
			}
		}
	}
	context.globalAlpha = 1

	// What is selected or about to be shows over everything drawn, whatever order that is in.
	context.strokeStyle = accent
	context.fillStyle = accent
	// A guide always does, as it is not part of what is drawn, and its handles are what there is of it.
	const handled = new Set(gripped.value?.rowOf ?? [])
	for (const shape of scene.value) {
		const marked = isMarked(shape)
		if (!marked && !isGuide(shape.draw)) continue
		const alpha = isOutside(shape.row, isolation.value) ? OUTSIDE_ALPHA : 1
		context.globalAlpha = alpha
		const outline = lineOfShape(shape)
		if (isGuide(shape.draw) && taken.value.some(of => isWithin(shape.row, of))) {
			context.globalAlpha = alpha * GUIDE_HIGHLIGHT_ALPHA
			if (outline !== null) {
				context.lineWidth = GUIDE_HIGHLIGHT_WIDTH
				context.stroke(pathOnScreen(outline, view.value))
			} else {
				const [px, py] = toScreen(shape.value as Vec, view.value)
				context.beginPath()
				context.arc(px, py, POINT_HIGHLIGHT_RADIUS, 0, Math.PI * 2)
				context.fill()
			}
			context.globalAlpha = alpha
		}
		if (outline !== null) {
			context.lineWidth = isHovered(shape.row) ? 2 : marked ? 1.5 : 1
			context.stroke(pathOnScreen(outline, view.value))
		} else if (shape.draw === 'point' && !handled.has(shape.row)) {
			drawPoint(shape)
		}
	}
	context.globalAlpha = 1

	// What it is made from is what there is to take hold of, having gone into it.
	for (const { row, path, transform } of insideIsolated.value) {
		context.lineWidth = row === hovered.value ? 2 : 1
		context.stroke(pathOnScreen(path, gripView(transform)))
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
		const outline = lineOfShape(shape)
		if (outline !== null) context.stroke(pathOnScreen(outline, view.value))
		else if (shape.draw === 'point') drawPoint(shape)
	}
	context.setLineDash([])

	// Around all of what is selected, as much as any one of it, which is nothing to take hold of yet.
	if (selectedBox.value !== null) {
		context.save()
		context.globalAlpha = BOX_ALPHA
		context.lineWidth = 1
		context.beginPath()
		for (const at of selectedBox.value) {
			const [x, y] = toScreen(at, view.value)
			context.lineTo(x, y)
		}
		context.closePath()
		context.stroke()
		context.restore()
	}

	if (evenLine.value !== null) {
		context.strokeStyle = accent
		drawExtended(context, evenLine.value[0], evenLine.value[1])
	}

	if (snapMark.value !== null) {
		drawSnap(context, snapMark.value, snapMark.value === linking.value ? expression : accent, paper)
	}

	if (props.addingAt != null) {
		// All the way across, on the pixel, as it goes by the place and not by what is there.
		const [x, y] = toScreen(props.addingAt, view.value).map(at => Math.round(at) + 0.5) as [number, number]
		context.save()
		context.strokeStyle = accent
		context.lineWidth = 1
		context.setLineDash(DASH)
		context.beginPath()
		context.moveTo(x, 0)
		context.lineTo(x, height)
		context.moveTo(0, y)
		context.lineTo(width, y)
		context.stroke()
		context.restore()
	}

	// Over the lines that go through them, which would otherwise cross what is filled in them.
	for (const [i, handle] of grip.value?.handles.entries() ?? []) {
		const dragged = draggedHandle.value
		drawHandle(
			context,
			handle,
			(dragged === null ? i === hoveredHandle.value : i === dragged) || isChosenAt(i) || pickedHandles.value.has(i),
			i === dragged && linking.value !== null ? expression : accent,
			paper,
			i === dragged,
			pickedHandles.value.has(i)
		)
	}

	drawReadout(context, ink, color('--tq-color-text-mute'), color('--tq-color-border'), paper)

	const reachOfBrush = isBrush(props.drawing) ? BRUSHES[props.drawing].reach?.(brushContext()) : undefined
	if (brushPointer.value !== null && reachOfBrush !== undefined) {
		const [x, y] = toScreen(brushPointer.value, view.value)
		context.lineWidth = 1
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
		solid.value,
		layers.value,
		grip.value,
		view.value,
		size.value,
		taken.value,
		hovered.value,
		isolation.value,
		insideIsolated.value,
		hoveredHandle.value,
		pickedHandles.value,
		range.value,
		penLine.value,
		snapMark.value,
		readout.value,
		props.addingAt,
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
	const onLine = [...innerSelected.value, ...insideIsolated.value].find(({ path, transform }) =>
		isOnPath(path, transform, x, y)
	)
	// Having gone into a path, what it is made from is all there is, right across.
	const inside = insideIsolated.value.find(({ path, transform }) => isOnPath(path, transform, x, y, true))
	return onLine?.row ?? inside?.row ?? rowOfShapeAt(x, y)
}

/** The row that what is drawn at a place on screen goes with, which may be a group it is in. */
function rowOfShapeAt(x: number, y: number): string | null {
	const shape = shapeAt(x, y)
	const { root, env } = props.document
	return shape === null ? null : rowTakenAt(root.value, env.value, shape.row, taken.value, isolated.value)
}

/** What was selected before the clicks that a double click is, the first of which selects. */
let beforeClicks: readonly string[] = []
let lastPress = -Infinity
const CLICKS_WITHIN_MS = 500

/** Goes one path further into what is there, to all that it is made from. */
function onDoubleClick(event: MouseEvent): void {
	const { offsetX: x, offsetY: y } = event
	if (props.drawing) return
	const held = rowHeldAt(x, y)
	if (held === null) {
		// What it has gone into is still there underneath, and this is only outside of it elsewhere.
		const under = shapeAt(x, y, true)
		if (under === null || isOutside(under.row, isolation.value)) leaveIsolated()
		return
	}
	const { root, env } = props.document
	const dive = diveAt(root.value, env.value, held, shapeAt(x, y)?.row, beforeClicks)
	if (dive === null) return
	if (dive.isolated !== null) {
		isolation.value = [...new Set([...isolation.value, held, dive.isolated])]
	}
	// What was about to be taken was the whole of it, which it no longer is.
	hovered.value = null
	emit('select', dive.rows)
}

/** All the way out, with what it had gone into, as a whole, being what is selected. */
function leaveIsolated(): void {
	const [first] = isolation.value
	if (first === undefined) return
	emit('select', [first.split('/')[0]!])
	isolation.value = []
}

useEventListener(
	window,
	'keydown',
	(event: KeyboardEvent) => {
		// With a tool in hand, it is that which is let go of first, and a menu is closed before anything.
		const isElsewhere = typing(event) || window.document.querySelector(':popover-open') !== null
		if (event.key !== 'Escape' || isolated.value === null || props.drawing || pressed !== null || isElsewhere) return
		event.stopPropagation()
		event.preventDefault()
		leaveIsolated()
	},
	{ capture: true }
)

/** The shape at a place on screen, the last drawn first. */
function shapeAt(x: number, y: number, outsideToo = false): Shape | null {
	const context = $canvas.value?.getContext('2d')
	if (!context) return null
	context.save()
	context.setTransform(1, 0, 0, 1, 0, 0)
	context.lineWidth = HIT_WIDTH
	let found: Shape | null = null
	for (const shape of [...scene.value].reverse()) {
		// What is outside of what is isolated is only there to be seen.
		if (!outsideToo && isolated.value !== null) {
			const isWithinIsolated = isWithin(shape.row, isolated.value) && insideIsolated.value.length === 0
			if (!isWithinIsolated) continue
		}
		const outline = lineOfShape(shape)
		if (outline !== null) {
			const path = pathOnScreen(outline, view.value)
			if (
				context.isPointInStroke(path, x, y) ||
				(shape.draw === 'path' && hasInside(shape) && context.isPointInPath(path, x, y))
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
	let away = HANDLE_REACH
	for (let i = handles.length - 1; i >= 0; i--) {
		const { at, outsideCorner } = handles[i]!
		if (at === undefined || outsideCorner) continue
		const [hx, hy] = toScreen(at)
		const distance = Math.hypot(hx - x, hy - y)
		if (distance < away || (nearest === null && distance === away)) [nearest, away] = [i, distance]
	}
	if (nearest !== null) return nearest
	for (let i = handles.length - 1; i >= 0; i--) {
		const { at, outsideCorner, angle } = handles[i]!
		if (at === undefined || !outsideCorner) continue
		const [hx, hy] = toScreen(at)
		const across = Math.abs(Math.hypot(hx - x, hy - y) - TURNER_RADIUS)
		const off = Math.atan2(y - hy, x - hx) - facing(angle ?? 0)
		const round = Math.abs(Math.atan2(Math.sin(off), Math.cos(off)))
		if (across <= TURNER_REACH && round <= Math.PI / 4 + 0.2) return i
	}
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

/**
 * An arc with a head at each end, around the corner a handle turns from, as Figma has it: bulging
 * out the way the corner faces, with what it points at in the middle of the arc.
 */
const TURN_CURSOR_ARC =
	'M9.07 4.93 A10 10 0 0 1 9.07 19.07 M12.57 4.93 H9.07 V8.43 M12.57 19.07 H9.07 V15.57'
const turnCursors = new Map<number, string>()
function turnCursor(handle: Handle, x: number, y: number): string {
	// Out from what it turns around, toward the pointer, to a degree, so that turning does not make a
	// new one at every move.
	const [px, py] = handle.pivot === undefined ? [x, y] : toScreen(handle.pivot)
	const way = px === x && py === y ? facing(handle.angle ?? 0) : Math.atan2(y - py, x - px)
	const degrees = Math.round((way * 180) / Math.PI)
	let cursor = turnCursors.get(degrees)
	if (cursor === undefined) {
		const svg =
			`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">` +
			`<g transform="rotate(${degrees} 12 12)" fill="none" stroke-linecap="round" stroke-linejoin="round">` +
			`<path d="${TURN_CURSOR_ARC}" stroke="white" stroke-width="4"/>` +
			`<path d="${TURN_CURSOR_ARC}" stroke="black" stroke-width="1.5"/>` +
			`</g></svg>`
		cursor = `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, auto`
		turnCursors.set(degrees, cursor)
	}
	return cursor
}

/** What a handle shows it does, as a cursor. */
function shapingHandleAt(x: number, y: number): number | null {
	if (!props.drawing) return null
	const index = handleAt(x, y)
	return index !== null && onlyShapes(grip.value!.handles[index]!) ? index : null
}

/** The cursor over a handle, until it is dragged, when the handle itself shows where the pointer is. */
function cursorOf(handle: Handle, x: number, y: number): string {
	if (handle.outsideCorner) return turnCursor(handle, x, y)
	if (handle.kind === 'button') return 'pointer'
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

/** What is selected, if a press is inside of the box that goes around several of it or a group, to move them all. */
function rowOfBoxAt(x: number, y: number, adding: boolean): string | null {
	if (adding || !grip.value?.box?.across) return null
	const box = boundsOfRows([...scene.value, ...hiddenSelected.value], taken.value)
	if (box === null) return null
	const [px, py] = fromScreen(x, y)
	const [[left, top], [right, bottom]] = box
	return px >= left && px <= right && py >= top && py <= bottom ? taken.value[0]! : null
}

const chosenKey = (row: string, part: string): string => `${row}\n${part}`
const rowOfChosen = (key: string): string => key.slice(0, key.lastIndexOf('\n'))
const partOfChosen = (key: string): string => key.slice(key.lastIndexOf('\n') + 1)
const partOf = ({ vertex, segment }: Handle): string | undefined => vertex ?? segment
const isChosenAt = (i: number): boolean => {
	const part = partOf(grip.value!.handles[i]!)
	return part !== undefined && chosenPoints.value.includes(chosenKey(gripped.value!.rowOf[i]!, part))
}
// Only as far as what they are of goes, as a press on something inside comes to a new list of the same.
watch([taken, () => props.byPoints], () => {
	chosenPoints.value = props.byPoints ? chosenPoints.value.filter(key => taken.value.includes(rowOfChosen(key))) : []
})

/** A handle to go by for each row with something chosen, as it is what can say so of them all, and what. */
function chosenByRow(): { row: string; handle: Handle; parts: readonly string[] }[] {
	return partsChosen.value.flatMap(({ row, parts }) => {
		const all = grippedAtAll.value
		const at = all?.rowOf.findIndex((owner, i) => {
			const part = partOf(all.grip.handles[i]!)
			return owner === row && part !== undefined && parts.includes(part)
		}) ?? -1
		return at < 0 ? [] : [{ row, handle: all!.grip.handles[at]!, parts }]
	})
}

/** The first of what is chosen, if a press inside of the box around it is to take hold of it all. */
function chosenInsideBox(x: number, y: number, adding: boolean): number | null {
	const around = gripped.value?.around
	if (!props.byPoints || adding || !around) return null
	const [px, py] = fromScreen(x, y)
	const [[left, top], [right, bottom]] = around
	if (px < left || px > right || py < top || py > bottom) return null
	const at = grip.value!.handles.findIndex((_, i) => isChosenAt(i))
	return at < 0 ? null : at
}

// Those go, if there are any, and not what they are of.
useHostDelete(() => {
	if (!props.byPoints) return false
	const going = chosenByRow()
	const [first] = going
	if (first === undefined) return false
	const changes = going.flatMap(({ row, handle, parts }) =>
		handle.to(handle.at ?? [0, 0], handle.at ?? [0, 0], { removing: parts }).map(change => ({ ...change, row }))
	)
	commit(apply(first.row, changes))
	chosenPoints.value = []
	return true
})

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
			/** How far round the box was, when it was taken hold of. */
			boxTurn: number
			/** What goes with it, of several points or segments chosen. */
			together: ReturnType<typeof chosenByRow> | null
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
	| { kind: 'range'; base: readonly string[]; last: readonly string[]; chosen: readonly string[] }
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
	if (props.picking) {
		const shape = shapeAt(x, y, true)
		if (shape !== null) emit('pick', shape.row)
		return
	}
	$canvas.value?.setPointerCapture(event.pointerId)

	if (spaceDown) {
		pressed = { kind: 'pan', from: [event.clientX, event.clientY] }
		cursor.value = 'grabbing'
		return
	}

	// With a tool in hand, what is only there to shape something is still that.
	const shaping = shapingHandleAt(x, y)
	// What is drawn goes in the program as a whole, so that is where it is to be seen.
	if (shaping === null && props.drawing) isolation.value = []
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
		const snap = snapAt(snapPoints(), x, y)
		pressed = {
			kind: 'draw',
			tool: props.drawing,
			base,
			name: '',
			at: [x, y],
			to: [x, y],
			points: snapPoints(),
			snap,
			drawing: false,
		}
		return
	}

	const hit = shaping ?? handleAt(x, y) ?? chosenInsideBox(x, y, event.shiftKey)
	// SHIFT on what is a guide is selecting one more or one less, as it is on anything drawn,
	// and only goes on being about the handle where that means something of its own.
	const isChoosing =
		event.shiftKey &&
		hit !== null &&
		shaping === null &&
		(!taken.value.includes(gripped.value!.rowOf[hit]!) || grip.value!.handles[hit]!.place === 'self')
	// A place among several selected is one of what is taken hold of, and goes with the rest.
	const isOneOfSeveral =
		hit !== null &&
		shaping === null &&
		taken.value.length > 1 &&
		grip.value!.handles[hit]!.place === 'self' &&
		taken.value.includes(gripped.value!.rowOf[hit]!)
	const index = isChoosing || isOneOfSeveral ? null : hit
	if (props.byPoints) {
		// A press on a part is choosing it, and one that was already stays so, to be dragged.
		const part = hit === null ? undefined : partOf(grip.value!.handles[hit]!)
		const key = part === undefined ? undefined : chosenKey(gripped.value!.rowOf[hit!]!, part)
		const chosen = chosenPoints.value
		if (key === undefined) {
			if (hit === null && !event.shiftKey) chosenPoints.value = []
		} else if (event.shiftKey) {
			chosenPoints.value = chosen.includes(key) ? chosen.filter(it => it !== key) : [...chosen, key]
		} else if (!chosen.includes(key)) {
			chosenPoints.value = [key]
		}
	}
	if (index !== null && grip.value !== null && (!props.byPoints || !event.shiftKey)) {
		const handle = grip.value.handles[index]!
		const owner = gripped.value!.rowOf[index]!
		if (handle.kind === 'button') {
			commit(apply(owner, handle.to(handle.at!, handle.at!)))
			return
		}
		// A guide's are there whatever is selected, and taking one is selecting what it is of.
		if (!taken.value.includes(owner)) emit('select', [owner])
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
			boxTurn: boxTurn.value,
			together: props.byPoints && chosenPoints.value.length > 1 && partOf(handle) !== undefined ? chosenByRow() : null,
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

	// What is reached for is what is drawn, however far in, and it stays where it is.
	if (props.byPoints) {
		if (hit !== null) return
		const row = shapeAt(x, y)?.row
		if (row !== undefined) {
			if (row !== taken.value[0] || taken.value.length > 1) emit('select', [row])
			return
		}
	}
	// What was pressed is what the handle is of, whatever else goes through the same place.
	const heldRow = isChoosing || isOneOfSeveral ? gripped.value!.rowOf[hit]! : (rowHeldAt(x, y) ?? rowOfBoxAt(x, y, event.shiftKey))
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
		// A group has no place of its own, so that moving it is moving all that is drawn in it.
		const { root, env } = props.document
		const drawnRows = new Set(rows.flatMap(row => rowsPaintedBy(root.value, env.value, row)))
		// What it is put on goes along, first, for it to be moved without anything having to change shape.
		const held = rowsHeldBy(root.value, env.value, drawnRows)
		const moving = [...held, ...drawnRows].flatMap(row => {
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
				// It lines up by the place it was taken by, or by any of its places, taken by none.
				const taken = placesTakenBy(snaps.own, near, SNAP_REACH / view.value[0])
				return { ...snaps, own: taken.length > 0 ? taken : snaps.own }
			})(),
			moving: false,
			collapse: already && !event.shiftKey && rows.length > 1,
			base: props.document.root.value,
		}
		return
	}

	const base = event.shiftKey ? taken.value : []
	if (!event.shiftKey && taken.value.length > 0) emit('select', [])
	pressed = { kind: 'range', base, last: base, chosen: event.shiftKey ? chosenPoints.value : [] }
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
	return Math.hypot(hx - x, hy - y) <= HANDLE_REACH
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
/** Where a handle like `handle` ends up in `ast`, it having been pulled to `to`: the nearest of its kind there. */
function landedAt(ast: AST | null, row: string, handle: Handle, to: Vec): Vec | null {
	if (ast === null) return null
	let nearest: Vec | null = null
	for (const { kind, name, at } of gripAt(ast, props.document.env.value, row)?.handles ?? []) {
		if (kind !== handle.kind || name !== handle.name || at === undefined) continue
		if (nearest === null || Math.hypot(at[0] - to[0], at[1] - to[1]) < Math.hypot(nearest[0] - to[0], nearest[1] - to[1])) nearest = at
	}
	return nearest
}

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
	const { row, handle, mat, from, offset, at, base, points, together } = pressed
	const [px, py] = fromScreen(at[0], at[1], mat)
	const wanted: Vec = [px + offset[0], py + offset[1]]
	const found = snapNear(
		handle.linesUpWith === undefined ? points : [...points, ...axesThrough(handle.linesUpWith, wanted)],
		wanted
	)

	const finest = handle.fine ? pointerStep() / FINE_BY : pointerStep()
	const pulled = (target: Vec) => {
		// Across, up and down or at 45 degrees from where it was, with SHIFT, as a control has already.
		const pulledTo = even && partOf(handle) !== undefined ? evenFrom(handle.at ?? from, target) : target
		const changes = together
			? together.flatMap(({ row: of, handle: other, parts }) => {
					// How far it has gone from where it was, as each goes from where it is.
					const delta = sub(pulledTo, handle.at ?? from)
					const was = other.at ?? from
					return other.to(add(was, delta), was, { moving: parts }).map(change => ({ ...change, row: of }))
				})
			: handle.to(pulledTo, from, { symmetric, even, smooth: valueOnly })
		const rounded = roundedChanges(changes, finest)
		return { pulledTo, rounded, next: apply(row, rounded, base) }
	}
	// What can only go one way does not get to what it snapped to, unless that is along its way:
	// and then it goes to where its way meets the line it snapped to, or else it does not snap.
	let snap = found
	let attempt = pulled(found?.at ?? wanted)
	if (found !== null && !together) {
		const off = (at: Vec | null): boolean => at === null || Math.hypot(at[0] - snap!.at[0], at[1] - snap!.at[1]) > SNAP_MISS / view.value[0]
		let landed = landedAt(attempt.next.ast, row, handle, attempt.pulledTo)
		const onLine = landed !== null && off(landed) ? alongSnapped(found, landed, SNAP_REACH / view.value[0]) : null
		if (onLine !== null) {
			snap = onLine
			attempt = pulled(onLine.at)
			landed = landedAt(attempt.next.ast, row, handle, attempt.pulledTo)
		}
		if (off(landed)) {
			snap = null
			attempt = pulled(wanted)
		}
	}
	snapMark.value = snap
	const { pulledTo, rounded, next } = attempt
	if (handle.turnOf) boxTurn.value = pressed.boxTurn + handle.turnOf(snap?.at ?? wanted, { even })
	const { place } = handle
	let link: SnapPoint | null = null
	if (next.ast !== null && snap !== null && !valueOnly && !symmetric && !handle.constrained) {
		// Where it is is said by an argument of its own, or worked out from what it changed, as a corner is.
		const referring =
			typeof place === 'number'
				? linked(next.ast, props.document.env.value, row, place, snap)
				: pulledOnto(next.ast, base, props.document.env.value, row, handle, snap)
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
	const isSide = handle.name === 'box' && handle.grip === true
	// Whoever's it is, as what a corner is about is where it goes, even of what says its size.
	const isBoxCorner = handle.corner === true && handle.at !== undefined
	const numbers =
		props.dimensions && next.ast !== null && !handle.across && !pressed.together && !isSide && !isBoxCorner
			? dimensionsHeld(next.ast, props.document.env.value, row, handle, rounded, base, snap?.at ?? wanted, {
					symmetric,
				})
			: []
	// With nothing written for it to say, it is the box that has numbers.
	const measured: Measured | null =
		!props.dimensions || next.ast === null || numbers.length > 0
			? null
			: props.byPoints
				? partsChosen.value.length > 0 ? { parts: partsChosen.value } : null
				: { rows: taken.value }
	if (measured !== null) {
		const wasBox = isBoxCorner ? boxMeasured(base, props.document.env.value, measured) : null
		const cornerPulled: Vec | null =
			wasBox && handle.at
				? [Math.abs(handle.at[0] - wasBox[1][0]) < Math.abs(handle.at[0] - wasBox[0][0]) ? 1 : 0, Math.abs(handle.at[1] - wasBox[1][1]) < Math.abs(handle.at[1] - wasBox[0][1]) ? 1 : 0]
				: null
		holdMeasured(measured, row, at, base, isSide ? 'side' : cornerPulled)
	}
	else hold(row, numbers, at, 0, saysOutside(handle) ? handle.kind : null)
	// Exact numbers are for when they have been asked for.
	readout.value =
		!props.dimensions || next.ast === null || numbers.length > 0 || handle.across || pressed.together || measured !== null
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
	// Command has it only be the same value, for now, rather than refer to that.
	const started =
		snap === null || valueOnly
			? drawn(base, name, tool, snap?.at ?? fromScreen(fromX, fromY), to, even, pointerStep(), false, fromCenter, shape)
			: drawnFrom(base, env.value, name, tool, snap, to, even, pointerStep(), fromCenter, shape)
	// What it is drawn to, it is drawn to as much as from what it starts at.
	const ended = end === null || valueOnly ? null : drawnOnto(started, env.value, `binding:${name}`, end)
	props.document.setRoot(painted(ended?.kind === 'let' ? ended : started, name))
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
			cursor.value = cursorOf(grip.value!.handles[shaping]!, x, y)
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
		const shape = index === null ? rowHeldAt(x, y) : null
		hoveredHandle.value = index
		hovered.value = shape
		cursor.value = props.picking
			? 'crosshair'
			: spaceDown
			? 'grab'
			: index !== null
				? cursorOf(grip.value!.handles[index]!, x, y)
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
			dragHandle(event.altKey, event.metaKey || event.ctrlKey, event.shiftKey)
			// What turns keeps its arrow, turned toward the pointer; anything else shows where it is itself.
			cursor.value = pressed.handle.outsideCorner ? turnCursor(pressed.handle, x, y) : 'none'
			break
		}
		case 'move': {
			const [fromX, fromY] = pressed.from
			if (!pressed.moving && Math.hypot(x - fromX, y - fromY) < MOVE_THRESHOLD) return
			pressed.moving = true
			hovered.value = null
			const { to: snappedTo, by: snappedBy } = snappedMove(pressed.own, pressed.others, pressed.from, [x, y])
			const [toX, toY] = event.shiftKey ? evenFrom(pressed.from, snappedTo) : snappedTo
			// Going by even angles is going by where it was, and not by what it was near.
			if (event.shiftKey) snapMark.value = null
			// From where it was taken hold of, each time: what it is now may already refer to where
			// it was put, and working back from that would change what it refers to instead.
			let next: ReturnType<typeof apply> = {
				ast: pressed.base,
				problem: null,
			}
			let moved: { row: string; changes: readonly Change[] } | null = null
			for (const { row, grip: taken } of pressed.rows) {
				if (next.ast === null || taken.move === undefined) continue
				const mat = gripView(taken.transform)
				const [ax, ay] = fromScreen(fromX, fromY, mat)
				const [bx, by] = fromScreen(toX, toY, mat)
				const changes = roundedChanges(taken.move([bx - ax, by - ay]), pointerStep())
				next = apply(row, changes, next.ast)
				// Of several, each has numbers of its own, which are not any one thing to type.
				if (props.dimensions && pressed.rows.length === 1) moved = { row, changes }
			}
			// The place it was taken by, put on another, goes on being there: unless it is only to be as much, with Command.
			let link: SnapPoint | null = null
			if (snappedBy !== null && !event.shiftKey && !event.metaKey && !event.ctrlKey && next.ast !== null) {
				const of = snappedBy.own.code?.of ?? snappedBy.own.target ?? ''
				const row = pressed.rows.find(({ row }) => of === row || of.startsWith(`${row}/`))?.row
				const onto = row === undefined ? null : movedOnto(next.ast, props.document.env.value, row, snappedBy.own, snappedBy.snap)
				if (onto !== null) {
					next = { ...next, ast: onto }
					link = snappedBy.snap
				}
			}
			linking.value = link
			commit(next)
			// As what it now says, with what it was put on, for a number that refers to something to show that it does.
			const numbers = moved === null || next.ast === null ? [] : dimensionsMoved(next.ast, props.document.env.value, moved.row, moved.changes, pressed.base)
			if (moved !== null && numbers.length > 0) hold(moved.row, numbers, [x, y])
			else if (props.dimensions && next.ast !== null) holdMeasured({ rows: taken.value }, pressed.row, [x, y], pressed.base)
			break
		}
		case 'range': {
			const { from } = range.value!
			range.value = { from, to: [x, y] }
			const within = rowsWithin(
				scene.value.filter(({ row }) => isolated.value === null || isWithin(row, isolated.value)),
				fromScreen(from[0], from[1]),
				fromScreen(x, y)
			)
			const { root, env } = props.document
			const { base } = pressed
			if (props.byPoints) {
				// What it goes round is the points themselves, of whatever they are of, however far in.
				const found = pointsWithin(root.value, env.value, within, fromScreen(from[0], from[1]), fromScreen(x, y))
				chosenPoints.value = [
					...new Set([...pressed.chosen, ...found.flatMap(({ row, points }) => points.map(part => chosenKey(row, part)))]),
				]
				const rows = [...new Set([...base, ...found.map(({ row }) => row)])]
				if (rows.join() !== pressed.last.join()) {
					pressed.last = rows
					emit('select', rows)
				}
				break
			}
			const takenWithin = within.map(row => rowTakenAt(root.value, env.value, row, base, isolated.value))
			const rows = [...new Set([...base, ...takenWithin])]
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
			@contextmenu.prevent="emit('menu', $event.clientX, $event.clientY, rowOfShapeAt($event.offsetX, $event.offsetY))"
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
