<script setup lang="ts">
import type { AST, LetAST } from '@glisp/lang'
import { type GlispDocument } from '@glisp/tweeq'
import { useEventListener, useResizeObserver } from '@vueuse/core'
import { mat2d, vec2 } from 'linearly'
import { toPath2D } from 'pave/path/canvas'
import { transform } from 'pave/path/modifiers'
import { useZUI } from 'tweeq/use/useZUI'
import { computed, ref, shallowRef, useTemplateRef, watch, watchEffect } from 'vue'

import { type Change, type Grip, type Handle, type Mat, type Path, type Vec } from './graphics'
import {
	changed,
	dragStep,
	drawn,
	drawnFrom,
	gripAt,
	linked,
	nameFor,
	nearestSnap,
	penned,
	roundedChanges,
	roundedTo,
	rowsWithin,
	type Anchor,
	sceneOf,
	type Shape,
	type ShapeTool,
	type SnapPoint,
	snapPointsOf,
} from './scene'

const props = defineProps<{
	document: GlispDocument
	/** The rows selected, as the tree has them too. */
	selected: readonly string[]
	/** What a press does, if it draws. */
	drawing?: ShapeTool | 'pen' | null
}>()

const emit = defineEmits<{ select: [rows: readonly string[]] }>()

const $canvas = useTemplateRef<HTMLCanvasElement>('$canvas')
const size = ref<[number, number]>([0, 0])
/** From the program's coordinates to the screen's. */
const view = shallowRef<mat2d>(mat2d.I)
/** The row of what the pointer is over, which is about to be selected. */
const hovered = ref<string | null>(null)
const hoveredHandle = ref<number | null>(null)
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

/** How near, on screen, a place has to be to be snapped to. */
const SNAP_REACH = 8

/** Everywhere there is to snap to, on what `root` draws. */
function snapPoints(root: AST = props.document.root.value, except?: string): SnapPoint[] {
	const { env } = props.document
	return snapPointsOf(root, env.value, sceneOf(root, env.value), except)
}

const snapAt = (points: readonly SnapPoint[], x: number, y: number): SnapPoint | null =>
	nearestSnap(points, fromScreen(x, y), SNAP_REACH / view.value[0])

/** A path being drawn with the pen, which goes on until it is finished. */
let pen: { base: LetAST; name: string; anchors: readonly Anchor[] } | null = null
/** From the last place to the pointer, on screen. */
const penLine = shallowRef<[Vec, Vec] | null>(null)

/** Where the pointer has snapped to, on screen. */
const snapMark = shallowRef<Vec | null>(null)
const cursor = ref('default')
/** Why what was asked for could not be, until the next press. */
const problem = ref<string | null>(null)

const HANDLE_RADIUS = 5
const HIT_WIDTH = 10
const HOVER_WIDTH = 3
const DASH = [3, 2]
const RANGE_OPACITY = 0.1

const scene = computed(() => sceneOf(props.document.root.value, props.document.env.value))

const gripOfRow = (row: string) =>
	gripAt(props.document.root.value, props.document.env.value, row)

/** Handles are of one thing: several can only be moved. */
const grip = computed(() => {
	const [row, other] = props.selected
	return row === undefined || other !== undefined ? null : gripOfRow(row)
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

useZUI($canvas, delta => {
	view.value = mat2d.mul(delta, view.value)
})

function color(name: string): string {
	return getComputedStyle(window.document.body).getPropertyValue(name).trim()
}

/** What a handle looks like, around where it is, facing the way it pulls. */
const ARROW = new Path2D('M 15 0 H -15 M -9 -5 L -15 0 L -9 5 M 9 -5 L 15 0 L 9 5')
const CROSS = new Path2D('M 12 0 H -12 M 0 12 V -12')
const DIAMOND = new Path2D('M 7 0 L 0 7 L -7 0 L 0 -7 Z')

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
	paper: string
): void {
	context.strokeStyle = accent
	context.lineWidth = active ? HOVER_WIDTH : 1
	if (handle.path !== undefined) {
		context.setLineDash(handle.dashed && !active ? DASH : [])
		context.stroke(pathOnScreen(handle.path))
		context.setLineDash([])
		return
	}
	const [x, y] = toScreen(handle.at!)
	context.save()
	context.translate(x, y)
	context.fillStyle = active ? accent : paper
	if (handle.kind === 'dia') {
		context.fill(DIAMOND)
		context.lineWidth = 1
		context.stroke(DIAMOND)
	} else {
		// Which way an arrow pulls is for when it is reached for, along with the cursor.
		if (handle.kind === 'translate' || (handle.kind === 'arrow' && active)) {
			context.save()
			context.rotate(facing(handle.angle ?? 0))
			context.lineWidth = 1
			context.stroke(handle.kind === 'arrow' ? ARROW : CROSS)
			context.restore()
		}
		context.lineWidth = 1
		context.beginPath()
		context.arc(0, 0, HANDLE_RADIUS, 0, Math.PI * 2)
		context.fill()
		context.stroke()
	}
	context.restore()
}

function draw(): void {
	const canvas = $canvas.value
	const context = canvas?.getContext('2d')
	if (!canvas || !context) return
	const ratio = window.devicePixelRatio
	const [width, height] = size.value
	canvas.width = width * ratio
	canvas.height = height * ratio
	context.scale(ratio, ratio)

	const ink = color('--tq-color-text')
	const guide = color('--tq-color-text-subtle')
	const accent = color('--tq-color-accent')
	const paper = color('--tq-color-background')

	for (const shape of scene.value) {
		const isMarked = props.selected.includes(shape.row) || shape.row === hovered.value
		context.strokeStyle = isMarked ? accent : shape.draw === 'path' ? ink : guide
		context.fillStyle = context.strokeStyle
		if (shape.draw === 'path') {
			context.lineWidth = shape.row === hovered.value ? 2 : 1.5
			context.stroke(pathOnScreen(shape.value as Path, view.value))
		} else if (shape.draw === 'point') {
			const [px, py] = toScreen(shape.value as Vec, view.value)
			context.beginPath()
			context.arc(px, py, 2.5, 0, Math.PI * 2)
			context.fill()
		}
	}

	context.strokeStyle = accent
	context.lineWidth = 1
	context.setLineDash(DASH)
	for (const path of grip.value?.guides ?? []) context.stroke(pathOnScreen(path))
	context.setLineDash([])

	for (const [i, handle] of grip.value?.handles.entries() ?? []) {
		drawHandle(context, handle, i === hoveredHandle.value, accent, paper)
	}

	if (snapMark.value !== null) {
		const [sx, sy] = snapMark.value
		context.lineWidth = 2
		context.strokeStyle = accent
		context.beginPath()
		context.arc(sx, sy, HANDLE_RADIUS + 2, 0, Math.PI * 2)
		context.stroke()
	}

	if (penLine.value !== null) {
		const [[ax, ay], [bx, by]] = penLine.value
		context.lineWidth = 1
		context.strokeStyle = accent
		context.beginPath()
		context.moveTo(ax, ay)
		context.lineTo(bx, by)
		context.stroke()
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

watchEffect(() => {
	void [
		scene.value,
		grip.value,
		view.value,
		size.value,
		props.selected,
		hovered.value,
		hoveredHandle.value,
		range.value,
		penLine.value,
		snapMark.value,
	]
	draw()
})

useResizeObserver($canvas, ([entry]) => {
	if (entry) size.value = [entry.contentRect.width, entry.contentRect.height]
})

/** The shape at a place on screen, the last drawn first. */
function shapeAt(x: number, y: number): Shape | null {
	const context = $canvas.value?.getContext('2d')
	if (!context) return null
	context.save()
	context.setTransform(1, 0, 0, 1, 0, 0)
	context.lineWidth = HIT_WIDTH
	let found: Shape | null = null
	for (const shape of [...scene.value].reverse()) {
		if (shape.draw === 'path') {
			const path = pathOnScreen(shape.value as Path, view.value)
			if (context.isPointInStroke(path, x, y) || context.isPointInPath(path, x, y)) {
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
	for (let i = handles.length - 1; i >= 0; i--) {
		const { at } = handles[i]!
		if (at === undefined) continue
		const [hx, hy] = toScreen(at)
		if (Math.hypot(hx - x, hy - y) <= HANDLE_RADIUS + 3) return i
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

/** What a handle shows it does, as a cursor. */
function cursorOf(handle: Handle): string {
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
	| { kind: 'pen'; from: Vec }
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
			moving: boolean
			collapse: boolean
	  }
	| null = null

let spaceDown = false
const typing = (event: Event): boolean =>
	(event.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable]') != null

// What is held down says at once, without having to move, how a shape goes.
useEventListener(window, ['keydown', 'keyup'], (event: KeyboardEvent) => {
	const valueOnly = event.metaKey || event.ctrlKey
	const isModifier = ['Shift', 'Alt', 'Meta', 'Control'].includes(event.key)
	if (isModifier && pressed?.kind === 'draw' && pressed.drawing) {
		drawPressed(event.shiftKey, valueOnly)
	}
	if (isModifier && pressed?.kind === 'handle') dragHandle(event.altKey, valueOnly)
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
	// The middle button is the ZUI's.
	if (event.button !== 0) return
	const { offsetX: x, offsetY: y } = event
	$canvas.value?.setPointerCapture(event.pointerId)

	if (spaceDown) {
		pressed = { kind: 'pan', from: [event.clientX, event.clientY] }
		cursor.value = 'grabbing'
		return
	}

	if (props.drawing === 'pen') {
		penDown(x, y)
		return
	}

	if (props.drawing) {
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

	const index = handleAt(x, y)
	if (index !== null && grip.value !== null) {
		const handle = grip.value.handles[index]!
		const mat = onScreen.value
		const from = fromScreen(x, y, mat)
		const at = handle.at ?? from
		pressed = {
			kind: 'handle',
			row: props.selected[0]!,
			handle,
			mat,
			from,
			// It stays where it was taken, wherever on it that was.
			offset: [at[0] - from[0], at[1] - from[1]],
			at: null,
			base: props.document.root.value,
			points:
				grip.value.transform.join() === '1,0,0,1,0,0' && handle.at !== undefined
					? snapPoints(props.document.root.value, props.selected[0]!)
					: [],
		}
		return
	}

	const shape = shapeAt(x, y)
	if (shape !== null) {
		const already = props.selected.includes(shape.row)
		const rows = event.shiftKey
			? already
				? props.selected.filter(row => row !== shape.row)
				: [...props.selected, shape.row]
			: already
				? props.selected
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
			moving: false,
			collapse: already && !event.shiftKey && rows.length > 1,
		}
		return
	}

	const base = event.shiftKey ? props.selected : []
	if (!event.shiftKey && props.selected.length > 0) emit('select', [])
	pressed = { kind: 'range', base, last: base }
	range.value = { from: [x, y], to: [x, y] }
}

function writePen(closed: boolean): void {
	if (pen !== null) props.document.setRoot(penned(pen.base, pen.name, pen.anchors, closed))
}

const closesPen = (x: number, y: number): boolean => {
	const first = pen?.anchors[0]
	if (first === undefined || pen!.anchors.length < 2) return false
	const [hx, hy] = toScreen(first.at, view.value)
	return Math.hypot(hx - x, hy - y) <= HANDLE_RADIUS + 3
}

function penDown(x: number, y: number): void {
	if (closesPen(x, y)) {
		writePen(true)
		pen = null
		penLine.value = null
		return
	}
	if (pen === null) {
		const base = props.document.root.value
		pen = { base, name: nameFor(base, 'pen', false), anchors: [] }
	}
	const isFirst = pen.anchors.length === 0
	pen.anchors = [...pen.anchors, { at: snapAt(snapPoints(pen.base), x, y)?.at ?? roundedPlace(x, y) }]
	writePen(false)
	if (isFirst) emit('select', [`binding:${pen.name}`])
	pressed = { kind: 'pen', from: [x, y] }
}

/** That is the path, as far as it went. With only one place, it is no path at all. */
function finishPen(): void {
	if (pen !== null && pen.anchors.length < 2) {
		props.document.setRoot(pen.base)
		emit('select', [])
	}
	pen = null
	penLine.value = null
}

watch(() => props.drawing, finishPen)

// Before it is what it means to a row in the tree.
useEventListener(
	window,
	'keydown',
	(event: KeyboardEvent) => {
		if (event.key !== 'Enter' || pen === null || typing(event)) return
		event.stopPropagation()
		event.preventDefault()
		finishPen()
	},
	{ capture: true }
)

/** The handle being dragged, to where the pointer has got. */
function dragHandle(symmetric: boolean, valueOnly: boolean): void {
	if (pressed?.kind !== 'handle' || pressed.at === null) return
	const { row, handle, mat, from, offset, at, base, points } = pressed
	const [px, py] = fromScreen(at[0], at[1], mat)
	const wanted: Vec = [px + offset[0], py + offset[1]]
	const snap = nearestSnap(points, wanted, SNAP_REACH / view.value[0])
	snapMark.value = snap ? toScreen(snap.at, view.value) : null

	const changes = handle.to(snap?.at ?? wanted, from, { symmetric })
	const finest = handle.fine ? pointerStep() / FINE_BY : pointerStep()
	const next = apply(row, roundedChanges(changes, finest), base)
	const { place } = handle
	if (next.ast !== null && snap !== null && !valueOnly && !symmetric && typeof place === 'number') {
		const referring = linked(next.ast, props.document.env.value, row, place, snap)
		if (referring !== null) next.ast = referring
	}
	commit(next)
}

/** The shape being drawn, as far as the pointer has got, and as even as asked. */
function drawPressed(even: boolean, valueOnly: boolean): void {
	if (pressed?.kind !== 'draw') return
	const [fromX, fromY] = pressed.at
	const [x, y] = pressed.to
	// It is named for what it is, which can change as it is drawn.
	const name = nameFor(pressed.base, pressed.tool, even)
	const end = snapAt(pressed.points, x, y)
	snapMark.value = end ? toScreen(end.at, view.value) : null
	const to = end?.at ?? fromScreen(x, y)
	const { base, tool, snap } = pressed
	const { env } = props.document
	props.document.setRoot(
		// Command has it only be the same value, for now, rather than refer to that.
		snap === null || valueOnly
			? drawn(base, name, tool, snap?.at ?? fromScreen(fromX, fromY), to, even, pointerStep())
			: drawnFrom(base, env.value, name, tool, snap, to, even, pointerStep())
	)
	if (name !== pressed.name) emit('select', [`binding:${name}`])
	pressed.name = name
	pressed.drawing = true
}

function onPointerMove(event: PointerEvent): void {
	const { offsetX: x, offsetY: y } = event
	if (pressed === null) {
		if (props.drawing) {
			hovered.value = null
			hoveredHandle.value = null
			const closes = props.drawing === 'pen' && closesPen(x, y)
			cursor.value = closes ? 'pointer' : 'crosshair'
			const near = closes ? null : snapAt(snapPoints(), x, y)
			snapMark.value = near ? toScreen(near.at, view.value) : null
			const last = pen?.anchors.at(-1)
			penLine.value = last ? [toScreen(last.at, view.value), [x, y]] : null
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
		case 'pen': {
			const [fromX, fromY] = pressed.from
			if (pen === null || Math.hypot(x - fromX, y - fromY) < MOVE_THRESHOLD) break
			pen.anchors = [...pen.anchors.slice(0, -1), { at: pen.anchors.at(-1)!.at, out: roundedPlace(x, y) }]
			writePen(false)
			break
		}
		case 'draw': {
			const [fromX, fromY] = pressed.at
			if (!pressed.drawing && Math.hypot(x - fromX, y - fromY) < MOVE_THRESHOLD) return
			pressed.to = [x, y]
			drawPressed(event.shiftKey, event.metaKey || event.ctrlKey)
			break
		}
		case 'handle': {
			pressed.at = [x, y]
			dragHandle(event.altKey, event.metaKey || event.ctrlKey)
			break
		}
		case 'move': {
			const [fromX, fromY] = pressed.from
			if (!pressed.moving && Math.hypot(x - fromX, y - fromY) < MOVE_THRESHOLD) return
			pressed.moving = true
			hovered.value = null
			let next: ReturnType<typeof apply> = {
				ast: props.document.root.value,
				problem: null,
			}
			for (const { row, grip: held } of pressed.rows) {
				if (next.ast === null || held.move === undefined) continue
				const mat = gripView(held.transform)
				const [ax, ay] = fromScreen(fromX, fromY, mat)
				const [bx, by] = fromScreen(x, y, mat)
				next = apply(row, roundedChanges(held.move([bx - ax, by - ay]), pointerStep()), next.ast)
			}
			commit(next)
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
			view.value = mat2d.mul(
				mat2d.fromTranslation([event.clientX - fromX, event.clientY - fromY]),
				view.value
			)
			pressed.from = [event.clientX, event.clientY]
		}
	}
}

useEventListener(window, 'pointerup', () => {
	// A click on one of several, not having moved them, is about that one.
	if (pressed?.kind === 'move' && pressed.collapse && !pressed.moving) {
		emit('select', [pressed.row])
	}
	if (pressed?.kind === 'pan') cursor.value = spaceDown ? 'grab' : 'default'
	pressed = null
	range.value = null
	snapMark.value = null
})
</script>

<template>
	<div class="CanvasView" data-selects-rows>
		<canvas
			ref="$canvas"
			:style="{ cursor }"
			@pointerdown="onPointerDown"
			@pointermove="onPointerMove"
			@pointerleave="(hovered = null), (hoveredHandle = null), (penLine = null), (snapMark = null)"
			@auxclick.prevent
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
