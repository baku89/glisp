<script setup lang="ts">
import { type GlispDocument } from '@glisp/tweeq'
import { type AST, solve } from '@glisp/lang'
import { useEventListener, useResizeObserver } from '@vueuse/core'
import { toPath2D } from 'pave/path/canvas'
import { computed, onMounted, ref, useTemplateRef, watchEffect } from 'vue'

import { handlesAt, sceneOf, type Shape } from './scene'

const props = defineProps<{
	document: GlispDocument
	/** The row selected, as the tree has it too. */
	selected: string | null
}>()

const emit = defineEmits<{ select: [row: string | null] }>()

const $canvas = useTemplateRef<HTMLCanvasElement>('$canvas')
const size = ref<[number, number]>([0, 0])
const view = ref({ x: 0, y: 0, zoom: 1 })
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

const toWorld = (x: number, y: number): [number, number] => [
	(x - view.value.x) / view.value.zoom,
	(y - view.value.y) / view.value.zoom,
]
const toScreen = ([x, y]: readonly [number, number]): [number, number] => [
	x * view.value.zoom + view.value.x,
	y * view.value.zoom + view.value.y,
]

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
	const { x, y, zoom } = view.value

	for (const shape of scene.value) {
		const isSelected = shape.row === props.selected
		context.strokeStyle = isSelected ? accent : shape.draw === 'path' ? ink : guide
		context.fillStyle = context.strokeStyle
		if (shape.draw === 'path') {
			context.save()
			context.setTransform(ratio * zoom, 0, 0, ratio * zoom, ratio * x, ratio * y)
			context.lineWidth = 1.5 / zoom
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
	context.fillStyle = color('--tq-color-background')
	for (const handle of handles.value) {
		const [hx, hy] = toScreen(handle.at)
		context.beginPath()
		context.arc(hx, hy, HANDLE_RADIUS, 0, Math.PI * 2)
		context.fill()
		context.stroke()
	}
}

watchEffect(() => {
	void [scene.value, handles.value, view.value, size.value, props.selected]
	draw()
})

useResizeObserver($canvas, ([entry]) => {
	if (entry) size.value = [entry.contentRect.width, entry.contentRect.height]
})

onMounted(() => {
	view.value = { x: 0, y: 0, zoom: 1 }
})

/** The shape at a place on screen, the last drawn first. */
function shapeAt(x: number, y: number): Shape | null {
	const context = $canvas.value?.getContext('2d')
	if (!context) return null
	const [wx, wy] = toWorld(x, y)
	context.save()
	context.setTransform(1, 0, 0, 1, 0, 0)
	context.lineWidth = HIT_WIDTH / view.value.zoom
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
			if (Math.hypot(px - wx, py - wy) * view.value.zoom < HIT_WIDTH) {
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

let pressed: { handle: number } | { panFrom: [number, number] } | null = null

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
		emit('select', shape.row)
		pressed = null
		return
	}
	emit('select', null)
	pressed = { panFrom: [event.clientX, event.clientY] }
}

function onPointerMove(event: PointerEvent): void {
	if (pressed === null) return
	if ('handle' in pressed) {
		moveHandle(pressed.handle, toWorld(event.offsetX, event.offsetY))
	} else {
		const [fromX, fromY] = pressed.panFrom
		view.value = {
			...view.value,
			x: view.value.x + event.clientX - fromX,
			y: view.value.y + event.clientY - fromY,
		}
		pressed.panFrom = [event.clientX, event.clientY]
	}
}

useEventListener(window, 'pointerup', () => {
	pressed = null
})

function onWheel(event: WheelEvent): void {
	event.preventDefault()
	if (event.ctrlKey || event.metaKey) {
		const zoom = Math.min(64, Math.max(1 / 64, view.value.zoom * Math.exp(-event.deltaY * 0.01)))
		const [wx, wy] = toWorld(event.offsetX, event.offsetY)
		view.value = {
			zoom,
			x: event.offsetX - wx * zoom,
			y: event.offsetY - wy * zoom,
		}
	} else {
		view.value = {
			...view.value,
			x: view.value.x - event.deltaX,
			y: view.value.y - event.deltaY,
		}
	}
}
</script>

<template>
	<div class="CanvasView">
		<canvas
			ref="$canvas"
			@pointerdown="onPointerDown"
			@pointermove="onPointerMove"
			@wheel="onWheel"
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
