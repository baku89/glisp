<script setup lang="ts">
import type { TypeValue } from '@glisp/lang'
import { colorOfType, isManyType } from '@glisp/tweeq/typeColor'
import { useElementSize } from '@vueuse/core'
import { Icon } from 'tweeq/Icon'
import { useThemeStore } from 'tweeq/stores/theme'
import { vTooltip } from 'tweeq/Tooltip'
import { computed, ref, useTemplateRef, watch } from 'vue'

import {
	DETAIL_FROM,
	type Graph,
	type GraphEdge,
	type GraphNode,
	HEADER_HEIGHT,
	heightOf,
	inputPort,
	NODE_WIDTH,
	outputPort,
	ROW_HEIGHT,
	type Vec,
} from './nodeGraph'

/**
 * A let-block drawn as nodes and the wires between them. What is here is only how it looks
 * and what the pointer means: every change is said to what holds this, which has the program.
 */
const props = defineProps<{
	graph: Graph
	/** The nodes that are selected, by key. */
	selected: readonly string[]
	/** An icon for a node, over what it says of itself. */
	iconOf?: (node: GraphNode) => string | null
}>()

const emit = defineEmits<{
	select: [keys: readonly string[]]
	/** Nodes have been let go of at these places. */
	move: [places: ReadonlyMap<string, Vec>]
	/** A wire now goes from `from` into `to`, in place of `was` if it was picked up from there. */
	wire: [from: string, to: { key: string; input: string | null } | null, was: { key: string; input: string | null } | null]
	/** The block is to come to this node. */
	result: [key: string]
	remove: [keys: readonly string[]]
	/** Something is to be added at a place in the graph, asked for at a place on screen. */
	add: [at: Vec, screen: Vec]
	menu: [key: string, screen: Vec]
}>()

const theme = useThemeStore()
/** A port or a wire of `type`, in the color its values have in code. Without one, it is as plain as before. */
const tinted = (type: TypeValue | null): { '--type'?: string } => {
	const color = colorOfType(type, theme.monacoTheme.rules)
	return color === undefined ? {} : { '--type': color }
}

const MIN_ZOOM = 0.15
const MAX_ZOOM = 2.5
const FIT_MARGIN = 40
/** A press does nothing but press, until it has gone this far. */
const DRAG_FROM = 3

const $root = useTemplateRef<HTMLElement>('$root')
const { width, height } = useElementSize($root)
const pan = ref<Vec>([FIT_MARGIN, FIT_MARGIN])
const zoom = ref(1)
const detailed = computed(() => zoom.value >= DETAIL_FROM)

/** How far apart the dots behind the nodes are, in the graph. */
const GRID = 20
/** On screen they are no nearer than this: further out, only every other one is left, and so on. */
const GRID_NEAREST = 12
/** The dots, which go with the graph as it is moved and are as far apart as it is near. */
const grid = computed(() => {
	const step = GRID * zoom.value * 2 ** Math.max(0, Math.ceil(Math.log2(GRID_NEAREST / (GRID * zoom.value))))
	return {
		backgroundSize: `${step}px ${step}px`,
		backgroundPosition: `${pan.value[0] - step / 2}px ${pan.value[1] - step / 2}px`,
	}
})

/** Where nodes being dragged are for now, which the program only hears of when they are let go of. */
const held = ref<ReadonlyMap<string, Vec>>(new Map())
const nodes = computed(() => props.graph.nodes.map(node => ({ ...node, at: held.value.get(node.key) ?? node.at })))
const byKey = computed(() => new Map(nodes.value.map(node => [node.key, node])))

/** A wire being pulled, from a node to wherever the pointer is. */
const pulling = ref<{ readonly from: string; readonly to: Vec; readonly was: { key: string; input: string | null } | null } | null>(null)
/** Where a wire being pulled would go in, if it were let go of now. */
const over = ref<{ readonly key: string; readonly input: string | null } | null>(null)

const toGraph = (clientX: number, clientY: number): Vec => {
	const rect = $root.value!.getBoundingClientRect()
	return [(clientX - rect.left - pan.value[0]) / zoom.value, (clientY - rect.top - pan.value[1]) / zoom.value]
}

/** A wire as a curve that leaves and arrives going across. */
function curve([x1, y1]: Vec, [x2, y2]: Vec): string {
	const reach = Math.max(30, Math.abs(x2 - x1) / 2)
	return `M${x1} ${y1} C${x1 + reach} ${y1} ${x2 - reach} ${y2} ${x2} ${y2}`
}

const wires = computed(() =>
	props.graph.edges.flatMap(edge => {
		const [from, to] = [byKey.value.get(edge.from), byKey.value.get(edge.to)]
		if (from === undefined || to === undefined) return []
		// The one being pulled away shows where the pointer has it, and not where it was.
		const was = pulling.value?.was
		if (was && was.key === edge.to && was.input === edge.input && pulling.value!.from === edge.from) return []
		return [{ edge, type: from.type, d: curve(outputPort(from), inputPort(to, edge.input, detailed.value)) }]
	})
)
const pulled = computed(() => {
	const from = pulling.value === null ? undefined : byKey.value.get(pulling.value.from)
	return from === undefined ? null : { type: from.type, d: curve(outputPort(from), pulling.value!.to) }
})

/** The view with all of the graph in it. */
function fit(): void {
	const all = props.graph.nodes
	if (all.length === 0 || width.value === 0) return
	const left = Math.min(...all.map(({ at }) => at[0]))
	const top = Math.min(...all.map(({ at }) => at[1]))
	const right = Math.max(...all.map(({ at }) => at[0] + NODE_WIDTH))
	const bottom = Math.max(...all.map(node => node.at[1] + heightOf(node, true)))
	const scale = Math.min(1, (width.value - FIT_MARGIN * 2) / (right - left), (height.value - FIT_MARGIN * 2) / (bottom - top))
	zoom.value = Math.max(MIN_ZOOM, scale)
	pan.value = [
		(width.value - (right - left) * zoom.value) / 2 - left * zoom.value,
		(height.value - (bottom - top) * zoom.value) / 2 - top * zoom.value,
	]
}
defineExpose({ fit })

// Once there is room to show it in, and not again, as where it is looked at from is then the user's.
let fitted = false
watch([width, () => props.graph.nodes.length], () => {
	if (fitted || width.value === 0 || props.graph.nodes.length === 0) return
	fitted = true
	fit()
})

function onWheel(event: WheelEvent): void {
	if (!event.ctrlKey && !event.metaKey) {
		pan.value = [pan.value[0] - event.deltaX, pan.value[1] - event.deltaY]
		return
	}
	const rect = $root.value!.getBoundingClientRect()
	const [x, y] = [event.clientX - rect.left, event.clientY - rect.top]
	const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom.value * Math.exp(-event.deltaY * 0.01)))
	const by = next / zoom.value
	pan.value = [x - (x - pan.value[0]) * by, y - (y - pan.value[1]) * by]
	zoom.value = next
}

/** Follows the pointer from a press until it is let go of, wherever it goes. */
function follow(event: PointerEvent, move: (move: PointerEvent) => void, up: (up: PointerEvent, dragged: boolean) => void): void {
	const { clientX, clientY, pointerId } = event
	let dragged = false
	const onMove = (moved: PointerEvent) => {
		if (moved.pointerId !== pointerId) return
		if (!dragged && Math.hypot(moved.clientX - clientX, moved.clientY - clientY) < DRAG_FROM) return
		dragged = true
		move(moved)
	}
	const onUp = (ended: PointerEvent) => {
		if (ended.pointerId !== pointerId) return
		window.removeEventListener('pointermove', onMove)
		window.removeEventListener('pointerup', onUp)
		window.removeEventListener('pointercancel', onUp)
		up(ended, dragged && ended.type === 'pointerup')
	}
	window.addEventListener('pointermove', onMove)
	window.addEventListener('pointerup', onUp)
	window.addEventListener('pointercancel', onUp)
}

function pressBackground(event: PointerEvent): void {
	if (event.button !== 0 && event.button !== 1) return
	$root.value?.focus()
	const from = pan.value
	follow(
		event,
		move => (pan.value = [from[0] + move.clientX - event.clientX, from[1] + move.clientY - event.clientY]),
		(_, dragged) => {
			if (!dragged && event.button === 0) emit('select', [])
		}
	)
}

function pressNode(event: PointerEvent, node: GraphNode): void {
	if (event.button !== 0) return
	$root.value?.focus()
	const already = props.selected.includes(node.key)
	const picked = event.shiftKey
		? already
			? props.selected.filter(key => key !== node.key)
			: [...props.selected, node.key]
		: already
			? props.selected
			: [node.key]
	if (picked !== props.selected) emit('select', picked)
	const moving = props.graph.nodes.filter(({ key }) => picked.includes(key))
	follow(
		event,
		move => {
			const by: Vec = [(move.clientX - event.clientX) / zoom.value, (move.clientY - event.clientY) / zoom.value]
			held.value = new Map(moving.map(({ key, at }) => [key, [at[0] + by[0], at[1] + by[1]]]))
		},
		(_, dragged) => {
			const places = held.value
			if (dragged && places.size > 0) emit('move', places)
			else if (!dragged && !event.shiftKey && already && props.selected.length > 1) emit('select', [node.key])
			// Until the program says the same, so that they do not go back for a moment.
			requestAnimationFrame(() => (held.value = new Map()))
		}
	)
}

/** Where a wire would go in at a place on screen: an input that shows, or a node that has none. */
function inputAt(clientX: number, clientY: number): { key: string; input: string | null } | null {
	const under = document.elementFromPoint(clientX, clientY)
	const at = under?.closest<HTMLElement>('[data-node]')
	if (!at || !$root.value?.contains(at)) return null
	const key = at.dataset.node!
	const input = under?.closest<HTMLElement>('[data-input]')?.dataset.input ?? null
	if (input !== null) return { key, input }
	return byKey.value.get(key)?.inputs.length === 0 ? { key, input: null } : null
}

function pull(event: PointerEvent, from: string, was: { key: string; input: string | null } | null): void {
	if (event.button !== 0) return
	event.stopPropagation()
	$root.value?.focus()
	follow(
		event,
		move => {
			pulling.value = { from, to: toGraph(move.clientX, move.clientY), was }
			const target = inputAt(move.clientX, move.clientY)
			over.value = target !== null && target.key !== from ? target : null
		},
		(_, dragged) => {
			const target = over.value
			pulling.value = over.value = null
			if (!dragged) return
			if (target !== null && was !== null && target.key === was.key && target.input === was.input) return
			if (target !== null || was !== null) emit('wire', from, target, was)
		}
	)
}

/** The wire into an input, to take hold of by its end there. */
const wireInto = (key: string, input: string | null): GraphEdge | undefined =>
	props.graph.edges.find(edge => edge.to === key && edge.input === input)

function pressInput(event: PointerEvent, key: string, input: string | null): void {
	const edge = wireInto(key, input)
	if (edge !== undefined) pull(event, edge.from, { key, input })
}

/** Where the pointer is over this, for what a key adds to go there. */
let pointer: Vec | null = null
function track(event: PointerEvent | null): void {
	pointer = event === null ? null : [event.clientX, event.clientY]
}
function onKey(event: KeyboardEvent): void {
	if ((event.target as Element).closest('input, textarea, [contenteditable]')) return
	if (event.key === 'Tab' && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
		event.preventDefault()
		event.stopPropagation()
		const rect = $root.value!.getBoundingClientRect()
		const screen: Vec = pointer ?? [rect.left + rect.width / 2, rect.top + rect.height / 2]
		emit('add', toGraph(screen[0], screen[1]), screen)
		return
	}
	if ((event.key === 'Delete' || event.key === 'Backspace') && props.selected.length > 0) {
		event.preventDefault()
		event.stopPropagation()
		emit('remove', props.selected)
	}
}

const iconFor = (node: GraphNode): string =>
	props.iconOf?.(node) ?? node.icon ?? (node.fn === null ? 'ph:circle-dashed' : 'mdi:function-variant')
const isOver = (key: string, input: string | null): boolean => over.value?.key === key && over.value.input === input
const sourceName = (from: string): string => byKey.value.get(from)?.name ?? ''
</script>

<template>
	<div
		ref="$root"
		class="NodeGraph"
		:class="{ pulling: pulling !== null }"
		:style="grid"
		tabindex="0"
		@wheel.prevent="onWheel"
		@pointerdown.self="pressBackground"
		@pointermove="track($event)"
		@pointerleave="track(null)"
		@keydown="onKey"
		@contextmenu.prevent
	>
		<svg class="wires" @pointerdown="pressBackground">
			<g :transform="`translate(${pan[0]} ${pan[1]}) scale(${zoom})`">
				<g
					v-for="{ edge, type, d } in wires"
					:key="`${edge.from}>${edge.to}>${edge.input}`"
					class="wire"
					:class="{ selected: selected.includes(edge.from) || selected.includes(edge.to), many: isManyType(type) }"
					:style="tinted(type)"
				>
					<path class="line" :d="d" />
					<path v-if="isManyType(type)" class="between" :d="d" />
				</g>
				<g v-if="pulled" class="wire pulled" :class="{ many: isManyType(pulled.type) }" :style="tinted(pulled.type)">
					<path class="line" :d="pulled.d" />
					<path v-if="isManyType(pulled.type)" class="between" :d="pulled.d" />
				</g>
			</g>
		</svg>
		<div class="nodes" :style="{ transform: `translate(${pan[0]}px, ${pan[1]}px) scale(${zoom})` }">
			<div
				v-for="node in nodes"
				:key="node.key"
				class="node"
				:class="{ selected: selected.includes(node.key), result: node.result, over: isOver(node.key, null) }"
				:style="{
					left: `${node.at[0]}px`,
					top: `${node.at[1]}px`,
					width: `${NODE_WIDTH}px`,
					height: `${heightOf(node, detailed)}px`,
				}"
				:data-node="node.key"
				@pointerdown="pressNode($event, node)"
				@contextmenu.prevent="emit('menu', node.key, [$event.clientX, $event.clientY])"
			>
				<header class="head" :style="{ height: `${HEADER_HEIGHT}px` }">
					<Icon class="icon" :icon="iconFor(node)" />
					<span class="name">{{ node.name ?? 'Result' }}</span>
					<span v-if="node.title" class="title">{{ node.title }}</span>
					<button
						v-if="node.result || node.name !== null"
						v-tooltip="node.result ? 'What the block comes to' : 'Have the block come to this'"
						class="flag"
						:class="{ on: node.result }"
						:aria-label="node.result ? 'What the block comes to' : 'Have the block come to this'"
						:disabled="node.result"
						@pointerdown.stop
						@click="emit('result', node.key)"
					>
						<Icon :icon="node.result ? 'ph:flag-fill' : 'ph:flag'" />
					</button>
				</header>
				<template v-if="detailed">
					<div
						v-for="input in node.inputs"
						:key="input.key"
						class="row"
						:class="{ over: isOver(node.key, input.key), wired: input.from !== null }"
						:style="{ height: `${ROW_HEIGHT}px` }"
						:data-input="input.key"
					>
						<span
							class="port in"
							:class="{ wired: wireInto(node.key, input.key) !== undefined, many: isManyType(input.type) }"
							:style="tinted(input.type)"
							@pointerdown.stop="pressInput($event, node.key, input.key)"
						/>
						<span class="label">{{ input.label }}</span>
						<span v-if="input.from !== null" class="value from">{{ sourceName(input.from) }}</span>
						<span v-else class="value">{{ input.text }}</span>
					</div>
					<div v-if="node.text !== null" class="row" :style="{ height: `${ROW_HEIGHT}px` }">
						<span class="value whole">{{ node.text }}</span>
					</div>
				</template>
				<span
					v-if="wireInto(node.key, null) !== undefined"
					class="port in whole wired"
					:class="{ many: isManyType(node.type) }"
					:style="tinted(node.type)"
					@pointerdown.stop="pressInput($event, node.key, null)"
				/>
				<span v-if="node.name !== null" class="port out" :class="{ many: isManyType(node.type) }" :style="tinted(node.type)" @pointerdown="pull($event, node.key, null)" />
			</div>
		</div>
		<p v-if="nodes.length === 0" class="empty">Nothing in this block yet. Press TAB to add a node.</p>
		<div class="view">
			<button v-tooltip="'Fit All'" class="view-button" aria-label="Fit All" @click="fit">
				<Icon icon="mdi:fit-to-screen-outline" />
			</button>
			<span class="zoom">{{ Math.round(zoom * 100) }}%</span>
		</div>
	</div>
</template>

<style scoped>
.NodeGraph {
	position: relative;
	flex: 1 1 auto;
	overflow: hidden;
	min-height: 160px;
	border-radius: var(--tq-radius-input);
	outline: none;
	background: var(--tq-color-background);
	background-image: radial-gradient(circle, var(--tq-color-border) 1px, transparent 1.5px);
	cursor: default;
	user-select: none;
	touch-action: none;
}
.wires {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
}
.wire {
	--width: 1.5px;
	fill: none;
	stroke: var(--type, var(--tq-color-text-mute));
	pointer-events: none;
}
.wire path {
	stroke-width: var(--width);
	vector-effect: non-scaling-stroke;
}
/* A vector's is two lines: one wide enough for both, and what is between them over it. */
.wire.many .line {
	stroke-width: calc(var(--width) * 3);
}
.wire .between {
	stroke: var(--tq-color-background);
}
.wire.selected {
	--width: 2.5px;
	stroke: var(--type, var(--tq-color-accent));
}
.wire.pulled {
	stroke: var(--type, var(--tq-color-accent));
}
.wire.pulled .line {
	stroke-dasharray: 4 3;
}
.nodes {
	position: absolute;
	top: 0;
	left: 0;
	transform-origin: 0 0;
	pointer-events: none;
}
.node {
	position: absolute;
	box-sizing: border-box;
	border: 1px solid var(--tq-color-border);
	border-radius: 6px;
	background: var(--tq-color-surface);
	box-shadow: 0 1px 3px var(--tq-color-shadow);
	pointer-events: auto;
	cursor: grab;
}
.node.selected {
	border-color: var(--tq-color-accent);
	box-shadow: 0 0 0 1px var(--tq-color-accent);
}
.node.over,
.row.over {
	background: var(--tq-color-info-soft);
}
.head {
	display: flex;
	box-sizing: border-box;
	gap: 6px;
	align-items: center;
	padding-inline: 8px 4px;
}
.icon {
	flex: none;
	font-size: 14px;
	color: var(--tq-color-text-mute);
}
.name {
	overflow: hidden;
	flex: 0 1 auto;
	font-weight: 600;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.title {
	overflow: hidden;
	flex: 1 1 0;
	min-width: 0;
	color: var(--tq-color-text-mute);
	text-overflow: ellipsis;
	white-space: nowrap;
}
.flag {
	display: grid;
	flex: none;
	place-items: center;
	width: 20px;
	height: 20px;
	margin-inline-start: auto;
	border: none;
	border-radius: var(--tq-radius-input);
	background: none;
	color: var(--tq-color-text-mute);
	opacity: 0;
	cursor: pointer;
}
.node:hover .flag,
.flag.on {
	opacity: 1;
}
.flag.on {
	color: var(--tq-color-accent);
	cursor: default;
}
.flag:not(.on):hover {
	background: var(--tq-color-input-hover);
	color: var(--tq-color-text);
}
.row {
	display: flex;
	position: relative;
	box-sizing: border-box;
	gap: 8px;
	align-items: center;
	padding-inline: 10px 8px;
}
.label {
	flex: none;
	max-width: 50%;
	overflow: hidden;
	color: var(--tq-color-text-mute);
	text-overflow: ellipsis;
	white-space: nowrap;
}
.value {
	overflow: hidden;
	flex: 1 1 0;
	min-width: 0;
	font-family: var(--tq-font-code);
	text-align: end;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.value.whole {
	text-align: start;
}
.value.from {
	color: var(--tq-color-accent);
}
.port {
	position: absolute;
	box-sizing: border-box;
	width: 9px;
	height: 9px;
	border: 1.5px solid var(--type, var(--tq-color-text-mute));
	border-radius: 50%;
	background: var(--tq-color-surface);
}
/* A vector's has a ring around it, as its wire is two lines. */
.port.many {
	outline: 1.5px solid var(--type, var(--tq-color-text-mute));
	outline-offset: 1.5px;
}
.port.in {
	top: 50%;
	left: -5px;
	translate: 0 -50%;
}
.port.in.whole {
	top: 15px;
}
.port.in.wired {
	border-color: var(--type, var(--tq-color-accent));
	background: var(--type, var(--tq-color-accent));
	cursor: crosshair;
}
.port.out {
	top: 15px;
	right: -5px;
	translate: 0 -50%;
	cursor: crosshair;
}
.port.out:hover,
.pulling .row.over .port.in {
	border-color: var(--type, var(--tq-color-accent));
	background: var(--type, var(--tq-color-accent));
}
.empty {
	position: absolute;
	inset: 0;
	display: grid;
	place-items: center;
	margin: 0;
	color: var(--tq-color-text-mute);
	pointer-events: none;
}
.view {
	display: flex;
	position: absolute;
	right: 6px;
	bottom: 6px;
	gap: 4px;
	align-items: center;
	color: var(--tq-color-text-mute);
}
.view-button {
	display: grid;
	place-items: center;
	width: 24px;
	height: 24px;
	border: none;
	border-radius: var(--tq-radius-input);
	background: none;
	color: inherit;
	cursor: pointer;
}
.view-button:hover {
	background: var(--tq-color-input-hover);
	color: var(--tq-color-text);
}
.zoom {
	min-width: 36px;
	font-variant-numeric: tabular-nums;
	text-align: end;
}
</style>
