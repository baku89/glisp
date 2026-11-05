<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import { Icon } from 'tweeq/Icon'
import { useAppConfigStore } from 'tweeq/stores/appConfig'
import { computed, inject, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'

import EdgeSurface from './EdgeSurface.vue'
import { draggedHeight, type Height } from './floatHeight'
import { MIN_HEIGHT, type PanelBox } from './panelLayout'
import { PANEL_DOCK } from './usePanelLayout'

/**
 * What floats over the canvas, from an edge or away from them, alone or joined to others. It
 * is the one thing, a tab that grows into a panel and goes back. It is as tall as what is in
 * it, until it has been made otherwise. Where it is, the layout says.
 */
const props = defineProps<{
	/** What its size is kept under, and what the layout knows it by. */
	name: string
	label: string
	icon: string
	/** How wide it opens, until it has been made otherwise. */
	width: number
}>()

const open = defineModel<boolean>('open', { required: true })

const MIN_WIDTH = 200
const MARGIN = 24
/** What is in the way of taking hold of the header. */
const NOT_A_HANDLE = 'button, input, textarea, select, a, [contenteditable], .RowName'

const dock = inject(PANEL_DOCK)!
const config = useAppConfigStore()
const width = config.ref(`${props.name}.width`, props.width)
const height = config.ref<Height>(`${props.name}.fixedHeight`, null)

const $root = useTemplateRef<HTMLElement>('$root')
const resizing = ref(false)
const snapped = ref(false)

const box = computed<PanelBox>(
	() =>
		dock.boxes.value.get(props.name) ?? {
			side: 'left',
			inset: 0,
			top: 0,
			bottom: null,
			maxHeight: 0,
			grows: 'down',
			joinedAbove: false,
			joinedBelow: false,
			flushBottom: false,
			room: 0,
		}
)
const floating = computed(() => box.value.inset > 0)
/** Held from both ends, so that it goes from one to the other. */
const fills = computed(() => box.value.top !== null && box.value.bottom !== null)
const moving = computed(() => dock.held.value.includes(props.name))
const order = computed(() => dock.layout.value.findIndex(({ panels }) => panels.includes(props.name)))

const px = (value: number | null): string => (value === null ? 'auto' : `${value}px`)

const style = computed(() => ({
	'--panel-width': `${width.value}px`,
	'--panel-height': fills.value || height.value === null ? 'auto' : `${height.value}px`,
	'--panel-max-height': `${box.value.maxHeight}px`,
	'--panel-top': px(box.value.top),
	'--panel-bottom': px(box.value.bottom),
	'--panel-inset': `${box.value.inset}px`,
	zIndex: order.value + 1,
}))

/** Takes off what holds it to the height it has, only long enough to read what that leaves. */
function natural(root: HTMLElement): number {
	root.classList.add('measuring')
	const measured = root.offsetHeight
	root.classList.remove('measuring')
	return measured
}

onMounted(() => {
	dock.register(props.name, {
		root: () => $root.value,
		width,
		freeHeight() {
			const root = $root.value
			if (root === null) return 0
			if (!open.value) return root.offsetHeight
			return height.value ?? natural(root)
		},
	})
})
onBeforeUnmount(() => dock.unregister(props.name))

useResizeObserver($root, () => {
	const root = $root.value
	if (root !== null) dock.measure(props.name, { width: root.offsetWidth, height: root.offsetHeight })
})

function resize(event: PointerEvent, axes: { x?: boolean; y?: boolean }): void {
	const root = $root.value
	if (event.button !== 0 || !root) return
	event.preventDefault()
	const handle = event.currentTarget as HTMLElement
	handle.setPointerCapture(event.pointerId)
	const { clientX, clientY } = event
	const start = root.getBoundingClientRect()
	const parent = root.parentElement!.getBoundingClientRect()
	const toward = box.value.side === 'left' ? 1 : -1
	const fit = axes.y ? natural(root) : 0
	const { grows, room, joinedAbove, joinedBelow } = box.value
	const down = grows === 'down' ? 1 : -1
	// Only what ends its stack has nothing past it, to go on to the end of the window.
	const canReach = grows === 'down' ? !joinedBelow : !joinedAbove
	const startY = dock.stackOf(props.name)?.y
	const before = height.value
	resizing.value = true

	const onMove = (move: PointerEvent) => {
		if (axes.x) {
			const wanted = start.width + (move.clientX - clientX) * toward
			const most = parent.width - box.value.inset - MARGIN
			dock.setWidth(props.name, Math.round(Math.min(Math.max(wanted, MIN_WIDTH), most)))
		}
		if (axes.y) {
			const wanted = Math.round(start.height + (move.clientY - clientY) * down)
			const dragged = draggedHeight(wanted, room, fit, MIN_HEIGHT)
			const reaches = dragged.reaches && canReach
			if (canReach) dock.setFull(props.name, reaches, reaches ? undefined : startY)
			height.value = reaches ? before : dragged.height
			snapped.value = dragged.snapped || dragged.reaches
		}
	}
	const onUp = () => {
		resizing.value = false
		snapped.value = false
		handle.removeEventListener('pointermove', onMove)
		handle.removeEventListener('pointerup', onUp)
		handle.removeEventListener('pointercancel', onUp)
	}
	handle.addEventListener('pointermove', onMove)
	handle.addEventListener('pointerup', onUp)
	handle.addEventListener('pointercancel', onUp)
}

function grabHeader(event: PointerEvent): void {
	if ((event.target as Element).closest(NOT_A_HANDLE)) return
	dock.grab(props.name, event, event.currentTarget as HTMLElement)
}

function grabTab(event: PointerEvent): void {
	dock.grab(props.name, event, event.currentTarget as HTMLElement)
}
</script>

<template>
	<aside
		ref="$root"
		class="FloatPanel"
		:class="[
			box.side,
			box.grows,
			{
				open,
				floating,
				fills,
				moving,
				resizing,
				fitting: !fills && height === null,
				'joined-above': box.joinedAbove,
				'joined-below': box.joinedBelow,
				'flush-bottom': box.flushBottom,
			},
		]"
		:style="style"
		:data-panel="name"
		@pointerdown.capture="dock.raise(name)"
	>
		<EdgeSurface
			:edge="box.side"
			:floating="floating"
			:joinedAbove="box.joinedAbove"
			:joinedBelow="box.joinedBelow"
			:flushBottom="box.flushBottom"
		/>
		<div class="clip">
			<button
				class="tab"
				:inert="open"
				:aria-label="`Show ${label}`"
				data-selects-rows
				@pointerdown="grabTab"
				@click="open = true"
			>
				<Icon class="tab-icon" :icon="icon" />
				<span class="tab-label">{{ label }}</span>
			</button>
			<div class="body" :inert="!open">
				<header class="header" data-selects-rows @pointerdown="grabHeader">
					<slot name="header" />
					<button class="toggle" :aria-label="`Minimize ${label}`" @click="open = false">
						<Icon :icon="box.side === 'left' ? 'ph:caret-left' : 'ph:caret-right'" />
					</button>
				</header>
				<div class="content">
					<slot />
				</div>
			</div>
		</div>
		<template v-if="open">
			<div class="edge side" data-selects-rows @pointerdown="resize($event, { x: true })" />
			<div
				class="edge along"
				:class="{ snapped }"
				data-selects-rows
				@pointerdown="resize($event, { y: true })"
			/>
			<div
				class="edge corner"
				data-selects-rows
				@pointerdown="resize($event, { x: true, y: true })"
			/>
		</template>
	</aside>
</template>

<style scoped>
.FloatPanel {
	--ease: 240ms cubic-bezier(0.2, 0, 0, 1);
	--tab-width: 32px;
	--tab-height: 112px;
	position: absolute;
	top: var(--panel-top);
	bottom: var(--panel-bottom);
	isolation: isolate;
	display: flex;
	flex-direction: column;
	box-sizing: border-box;
	width: var(--tab-width);
	height: var(--tab-height);
	border: 1px solid transparent;
	interpolate-size: allow-keywords;
	transition:
		width var(--ease),
		height var(--ease);
}
.FloatPanel.left {
	left: var(--panel-inset);
	--corner-tl: 0px;
	--corner-bl: 0px;
	--corner-tr: var(--tq-radius-pane);
	--corner-br: var(--tq-radius-pane);
}
.FloatPanel.right {
	right: var(--panel-inset);
	--corner-tl: var(--tq-radius-pane);
	--corner-bl: var(--tq-radius-pane);
	--corner-tr: 0px;
	--corner-br: 0px;
}
.FloatPanel.floating {
	--corner-tl: var(--tq-radius-pane);
	--corner-bl: var(--tq-radius-pane);
	--corner-tr: var(--tq-radius-pane);
	--corner-br: var(--tq-radius-pane);
}
.FloatPanel.left:not(.floating) {
	border-left: none;
}
.FloatPanel.right:not(.floating) {
	border-right: none;
}
/* Where it meets another, or the end of the window, it goes straight on. */
.FloatPanel.joined-above {
	--corner-tl: 0px;
	--corner-tr: 0px;
}
.FloatPanel.joined-below,
.FloatPanel.flush-bottom {
	--corner-bl: 0px;
	--corner-br: 0px;
}
.FloatPanel {
	border-radius: var(--corner-tl) var(--corner-tr) var(--corner-br) var(--corner-bl);
}
.FloatPanel.open {
	max-height: var(--panel-max-height);
	width: var(--panel-width);
	height: var(--panel-height);
}
/* It goes between where it is held from, rather than being of any height of its own. */
.FloatPanel.open.fills {
	height: auto;
	max-height: none;
}
/* What is in it stays in it, where the curves into the edge go outside of it. */
.clip {
	position: relative;
	display: flex;
	flex: 1 1 auto;
	flex-direction: column;
	overflow: hidden;
	min-height: 0;
	border-radius: inherit;
}
.left .clip {
	align-items: flex-start;
}
.right .clip {
	align-items: flex-end;
}
.fitting .clip {
	flex: 0 1 auto;
}
/* What it would come to, with nothing holding it. */
.FloatPanel.open.measuring {
	bottom: auto;
	max-height: none;
	height: auto;
	transition: none;
}
.FloatPanel.measuring .clip,
.FloatPanel.measuring .body,
.FloatPanel.measuring .content {
	flex: none;
}
/* It goes by the pointer, rather than following it. */
.FloatPanel.resizing,
.FloatPanel.moving {
	transition: none;
	user-select: none;
}
.FloatPanel.moving .header,
.FloatPanel.moving .tab {
	cursor: grabbing;
}
.edge {
	position: absolute;
	z-index: 2;
	touch-action: none;
}
.edge.side {
	top: 0;
	bottom: 0;
	width: 6px;
	cursor: ew-resize;
}
.left .edge.side,
.left .edge.corner {
	right: 0;
}
.right .edge.side,
.right .edge.corner {
	left: 0;
}
.edge.along {
	right: 0;
	left: 0;
	height: 6px;
	cursor: ns-resize;
}
/* It is at the end that it grows from. */
.down .edge.along,
.down .edge.corner {
	bottom: 0;
}
.up .edge.along,
.up .edge.corner {
	top: 0;
}
.down .edge.along.snapped {
	border-bottom: 2px solid var(--tq-color-accent);
}
.up .edge.along.snapped {
	border-top: 2px solid var(--tq-color-accent);
}
.edge.corner {
	width: 14px;
	height: 14px;
}
.left.down .edge.corner,
.right.up .edge.corner {
	cursor: nwse-resize;
}
.right.down .edge.corner,
.left.up .edge.corner {
	cursor: nesw-resize;
}
.tab {
	position: absolute;
	top: 0;
	display: flex;
	flex-direction: column;
	gap: 6px;
	align-items: center;
	width: var(--tab-width);
	height: var(--tab-height);
	padding-block: 8px;
	border: none;
	background: none;
	color: var(--tq-color-text-mute);
	cursor: pointer;
	transition: opacity var(--ease);
}
.up .tab {
	top: auto;
	bottom: 0;
}
.left .tab {
	left: 0;
}
.right .tab {
	right: 0;
}
.tab:hover {
	color: var(--tq-color-text);
}
.tab-icon {
	flex: none;
	font-size: 18px;
}
.tab-label {
	writing-mode: vertical-rl;
}
.open .tab {
	opacity: 0;
	pointer-events: none;
}
/* As wide as it will be, so that nothing inside reflows as it grows. */
.body {
	display: flex;
	flex: 1 1 auto;
	flex-direction: column;
	min-height: 0;
	width: var(--panel-width);
	opacity: 0;
	scale: 0.96;
	transition:
		opacity var(--ease),
		scale var(--ease);
}
/* It goes in toward where it folds away to, the corner that the tab is in. */
.left .body {
	transform-origin: left top;
}
.right .body {
	transform-origin: right top;
}
.left.up .body {
	transform-origin: left bottom;
}
.right.up .body {
	transform-origin: right bottom;
}
.fitting .body {
	flex: 0 1 auto;
}
.open .body {
	opacity: 1;
	scale: 1;
}
.header {
	display: flex;
	flex-shrink: 0;
	gap: var(--tq-gap-related);
	align-items: center;
	justify-content: space-between;
	padding: 6px 6px 0;
	cursor: grab;
	touch-action: none;
}
/* It is on the side that it folds away to. */
.left .toggle {
	order: -1;
}
.left .header {
	justify-content: flex-start;
}
.toggle {
	display: grid;
	flex: none;
	place-items: center;
	width: 24px;
	height: 24px;
	border: none;
	border-radius: var(--tq-radius-input);
	background: none;
	color: var(--tq-color-text-mute);
	cursor: pointer;
}
.toggle:hover {
	background: var(--tq-color-input-hover);
	color: var(--tq-color-text);
}
.fitting .content {
	flex: 0 1 auto;
}
.content {
	display: flex;
	flex: 1 1 auto;
	flex-direction: column;
	overflow: hidden;
	min-height: 0;
	padding: var(--tq-pane-padding);
	/* The bar has the padding on this side for itself, whether it is there or not, and
	stays off the edge. */
	padding-right: 2px;
}
.content > :deep(*) {
	min-height: 0;
}
.content :deep(.TqScrollArea) {
	scrollbar-gutter: stable;
}
.content :deep(.TqScrollArea)::-webkit-scrollbar {
	width: calc(var(--tq-pane-padding) - 2px);
}
.content :deep(.TqScrollArea)::-webkit-scrollbar-thumb {
	border: 2px solid transparent;
	border-radius: 9999px;
	background: var(--tq-color-border) padding-box;
}
.content > :not(:has(.TqScrollArea), .TqScrollArea) {
	margin-right: calc(var(--tq-pane-padding) - 2px);
}
</style>
