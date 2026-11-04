<script setup lang="ts">
import { type GlispDocument } from '@glisp/tweeq'
import { type AST, solve } from '@glisp/lang'
import { useEventListener, useResizeObserver } from '@vueuse/core'
import { mat2d, vec2 } from 'linearly'
import { toPath2D } from 'pave/path/canvas'
import { useZUI } from 'tweeq/use/useZUI'
import { computed, ref, shallowRef, useTemplateRef, watchEffect } from 'vue'

import { followersAt, handlesAt, moved, sceneOf, type Shape } from './scene'

const props = defineProps<{
	document: GlispDocument
	/** The row selected, as the tree has it too. */
	selected: string | null
}>()

const emit = defineEmits<{ select: [row: string | null] }>()

const $canvas = useTemplateRef<HTMLCanvasElement>('$canvas')
const size = ref<[number, number]>([0, 0])
/** From the program's coordinates to the screen's. */
const view = shallowRef<mat2d>(mat2d.I)
const zoom = computed(() => view.value[0])
/** The row of what the pointer is over, which is about to be selected. */
const hovered = ref<string | null>(null)
const hoveredHandle = ref<number | null>(null)
const cursor = ref('default')
/** Why what was asked for could not be, until the next press. */
const problem = ref<string | null>(null)

const HANDLE_RADIUS = 5
const HIT_WIDTH = 10

const scene = computed(() => sceneOf(props.document.root.value, props.document.env.value))
const handles = computed(() =>
	props.selected === null
		? []
		: handlesAt(props.document.root.value, props.document.env.value, props.selected)
)

const toWorld = (x: number, y: number): [number, number] => {
	const [wx, wy] = vec2.transformMat2d([x, y], mat2d.inv(view.value) ?? mat2d.I)
	return [wx, wy]
}
const toScreen = (at: readonly [number, number]): [number, number] => {
	const [x, y] = vec2.transformMat2d(at, view.value)
	return [x, y]
}

useZUI($canvas, delta => {
	view.value = mat2d.mul(delta, view.value)
})

function color(name: string): string {
	return getComputedStyle(window.document.body).getPropertyValue(name).trim()
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
	const [a, b, c, d, tx, ty] = view.value

	for (const shape of scene.value) {
		const isMarked = shape.row === props.selected || shape.row === hovered.value
		context.strokeStyle = isMarked ? accent : shape.draw === 'path' ? ink : guide
		context.fillStyle = context.strokeStyle
		if (shape.draw === 'path') {
			context.save()
			context.setTransform(ratio * a, ratio * b, ratio * c, ratio * d, ratio * tx, ratio * ty)
			context.lineWidth = (shape.row === hovered.value ? 2 : 1.5) / zoom.value
			context.stroke(toPath2D(shape.value as never))
			context.restore()
		} else if (shape.draw === 'point') {
			const [px, py] = toScreen(shape.value as [number, number])
			context.beginPath()
			context.arc(px, py, 2.5, 0, Math.PI * 2)
			context.fill()
		}
	}

	context.lineWidth = 1.5
	context.strokeStyle = accent
	const paper = color('--tq-color-background')
	for (const [i, handle] of handles.value.entries()) {
		const [hx, hy] = toScreen(handle.at)
		context.fillStyle = i === hoveredHandle.value ? accent : paper
		context.beginPath()
		context.arc(hx, hy, HANDLE_RADIUS, 0, Math.PI * 2)
		context.fill()
		context.stroke()
	}
}

watchEffect(() => {
	void [
		scene.value,
		handles.value,
		view.value,
		size.value,
		props.selected,
		hovered.value,
		hoveredHandle.value,
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
	const [wx, wy] = toWorld(x, y)
	context.save()
	context.setTransform(1, 0, 0, 1, 0, 0)
	context.lineWidth = HIT_WIDTH / zoom.value
	let found: Shape | null = null
	for (const shape of [...scene.value].reverse()) {
		if (shape.draw === 'path') {
			const path = toPath2D(shape.value as never)
			if (context.isPointInStroke(path, wx, wy) || context.isPointInPath(path, wx, wy)) {
				found = shape
				break
			}
		} else if (shape.draw === 'point') {
			const [px, py] = shape.value as [number, number]
			if (Math.hypot(px - wx, py - wy) * zoom.value < HIT_WIDTH) {
				found = shape
				break
			}
		}
	}
	context.restore()
	return found
}

function handleAt(x: number, y: number) {
	return handles.value.find(handle => {
		const [hx, hy] = toScreen(handle.at)
		return Math.hypot(hx - x, hy - y) <= HANDLE_RADIUS + 3
	})
}

/** Go back from a handle to what it comes from, by its place in the program. */
function moveHandle(index: number, to: [number, number]): void {
	const handle = handles.value[index]
	if (!handle) return
	apply(handle.node, handle.wanted(to))
}

function apply(node: AST, value: unknown): void {
	const { root, env } = props.document
	const { ast, diagnostics } = solve(root.value, env.value, node, value)
	problem.value = diagnostics[0]?.message ?? null
	if (ast?.kind === 'let' && ast !== root.value) props.document.setRoot(ast)
}

/** How far a press has to go to be a move, so that a click does not nudge anything. */
const MOVE_THRESHOLD = 3

let pressed:
	| { handle: number }
	| { panFrom: [number, number] }
	| {
			row: string
			fromScreen: [number, number]
			fromWorld: [number, number]
			starts: ReturnType<typeof followersAt>
			moving: boolean
	  }
	| null = null

function onPointerDown(event: PointerEvent): void {
	problem.value = null
	if (event.button !== 0) return
	const { offsetX: x, offsetY: y } = event
	$canvas.value?.setPointerCapture(event.pointerId)
	const handle = handleAt(x, y)
	if (handle) {
		pressed = { handle: handles.value.indexOf(handle) }
		return
	}
	const shape = shapeAt(x, y)
	if (shape) {
		// What is already selected can be taken by anywhere on it.
		pressed =
			shape.row === props.selected
				? {
						row: shape.row,
						fromScreen: [x, y],
						fromWorld: toWorld(x, y),
						starts: followersAt(
							props.document.root.value,
							props.document.env.value,
							shape.row
						),
						moving: false,
					}
				: null
		emit('select', shape.row)
		return
	}
	emit('select', null)
	pressed = { panFrom: [event.clientX, event.clientY] }
}

function onPointerMove(event: PointerEvent): void {
	if (pressed === null) {
		const { offsetX: x, offsetY: y } = event
		const handle = handleAt(x, y)
		const overHandle = handle !== undefined
		const shape = overHandle ? null : shapeAt(x, y)
		hoveredHandle.value = overHandle ? handles.value.indexOf(handle) : null
		hovered.value = shape?.row ?? null
		cursor.value = overHandle
			? 'grab'
			: shape !== null && shape.row === props.selected
				? 'move'
				: 'default'
		return
	}
	if ('handle' in pressed) {
		moveHandle(pressed.handle, toWorld(event.offsetX, event.offsetY))
	} else if ('row' in pressed) {
		const { offsetX: x, offsetY: y } = event
		const [fromX, fromY] = pressed.fromScreen
		if (!pressed.moving && Math.hypot(x - fromX, y - fromY) < MOVE_THRESHOLD) return
		pressed.moving = true
		const [wx, wy] = toWorld(x, y)
		const { root, env } = props.document
		const { ast, problem: why } = moved(root.value, env.value, pressed.row, pressed.starts, [
			wx - pressed.fromWorld[0],
			wy - pressed.fromWorld[1],
		])
		problem.value = why
		if (ast?.kind === 'let' && ast !== root.value) props.document.setRoot(ast)
	} else {
		const [fromX, fromY] = pressed.panFrom
		view.value = mat2d.mul(
			mat2d.fromTranslation([event.clientX - fromX, event.clientY - fromY]),
			view.value
		)
		pressed.panFrom = [event.clientX, event.clientY]
	}
}

useEventListener(window, 'pointerup', () => {
	pressed = null
})
</script>

<template>
	<div class="CanvasView">
		<canvas
			ref="$canvas"
			@pointerdown="onPointerDown"
			:style="{ cursor }"
			@pointermove="onPointerMove"
			@pointerleave="(hovered = null), (hoveredHandle = null)"
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
