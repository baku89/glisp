<script setup lang="ts">
import { Icon } from 'tweeq/Icon'
import { useAppConfigStore } from 'tweeq/stores/appConfig'
import { computed, ref, useTemplateRef } from 'vue'

import EdgeSurface from './EdgeSurface.vue'
import { draggedHeight, type Height } from './floatHeight'

/**
 * What floats over the canvas from one edge, so with a border on the other three
 * sides. It is the one thing, a tab that grows into a panel and goes back. It is as tall
 * as what is in it, until it has been made otherwise.
 */
const props = defineProps<{
	/** What its size is kept under. */
	name: string
	side: 'left' | 'right'
	label: string
	icon: string
	/** How wide it opens, until it has been made otherwise. */
	width: number
	/** It sits at the end of its edge, growing up from there, as tall as what is in it. */
	fromBottom?: boolean
}>()

const open = defineModel<boolean>('open', { required: true })

const MIN_WIDTH = 200
const MIN_HEIGHT = 64
const TOP = 8
const MARGIN = 24

const config = useAppConfigStore()
const width = config.ref(`${props.name}.width`, props.width)
const height = config.ref<Height>(`${props.name}.fixedHeight`, null)

const $root = useTemplateRef<HTMLElement>('$root')
const resizing = ref(false)
const snapped = ref(false)

const style = computed(() => ({
	'--panel-width': `${width.value}px`,
	'--panel-height': height.value === null ? 'auto' : `${height.value}px`,
}))

/** Takes off what holds it to the height it has, only long enough to read what that leaves. */
function natural(root: HTMLElement): number {
	root.classList.add('measuring')
	const measured = root.offsetHeight
	root.classList.remove('measuring')
	return measured
}

function resize(event: PointerEvent, axes: { x?: boolean; y?: boolean }): void {
	const root = $root.value
	if (event.button !== 0 || !root) return
	event.preventDefault()
	const handle = event.currentTarget as HTMLElement
	handle.setPointerCapture(event.pointerId)
	const { clientX, clientY } = event
	const start = root.getBoundingClientRect()
	const parent = root.parentElement!.getBoundingClientRect()
	const toward = props.side === 'left' ? 1 : -1
	const fit = axes.y ? natural(root) : 0
	resizing.value = true

	const onMove = (move: PointerEvent) => {
		if (axes.x) {
			const wanted = start.width + (move.clientX - clientX) * toward
			width.value = Math.round(Math.min(Math.max(wanted, MIN_WIDTH), parent.width - MARGIN))
		}
		if (axes.y) {
			const wanted = Math.round(start.height + move.clientY - clientY)
			const dragged = draggedHeight(wanted, parent.height - TOP - MARGIN, fit, MIN_HEIGHT)
			height.value = dragged.height
			snapped.value = dragged.snapped
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
</script>

<template>
	<aside
		ref="$root"
		class="FloatPanel"
		:class="[side, { open, resizing, fitting: fromBottom || height === null, 'from-bottom': fromBottom }]"
		:style="style"
	>
		<EdgeSurface :edge="side" />
		<div class="clip">
			<button
				class="tab"
				:inert="open"
				:aria-label="`Show ${label}`"
				data-selects-rows
				@click="open = true"
			>
				<Icon class="tab-icon" :icon="icon" />
				<span class="tab-label">{{ label }}</span>
			</button>
			<div class="body" :inert="!open">
				<header class="header" data-selects-rows>
					<slot name="header" />
					<button class="toggle" :aria-label="`Minimize ${label}`" @click="open = false">
						<Icon :icon="side === 'left' ? 'ph:caret-left' : 'ph:caret-right'" />
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
				v-if="!fromBottom"
				class="edge bottom"
				:class="{ snapped }"
				data-selects-rows
				@pointerdown="resize($event, { y: true })"
			/>
			<div
				v-if="!fromBottom"
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
	/* As far down as the curve into the edge takes, so that it starts from the title bar. */
	top: var(--edge-fillet);
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
.FloatPanel.from-bottom {
	/* As far up as the curve into the edge takes. */
	top: auto;
	bottom: var(--edge-fillet);
}
.FloatPanel.left {
	left: 0;
	border-left: none;
	border-radius: 0 var(--tq-radius-pane) var(--tq-radius-pane) 0;
}
.FloatPanel.right {
	right: 0;
	border-right: none;
	border-radius: var(--tq-radius-pane) 0 0 var(--tq-radius-pane);
}
.FloatPanel.open {
	/* Up to what is below it on that edge, or else short of the end of it. */
	max-height: calc(100% - var(--edge-fillet) - var(--taken-below, 24px));
	width: var(--panel-width);
	height: var(--panel-height);
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
.FloatPanel.resizing {
	transition: none;
	user-select: none;
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
.edge.bottom {
	right: 0;
	bottom: 0;
	left: 0;
	height: 6px;
	cursor: ns-resize;
}
.edge.bottom.snapped {
	border-bottom: 2px solid var(--tq-color-accent);
}
.edge.corner {
	bottom: 0;
	width: 14px;
	height: 14px;
}
.left .edge.corner {
	cursor: nwse-resize;
}
.right .edge.corner {
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
.from-bottom .tab {
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
.from-bottom .body {
	transform-origin: left bottom;
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
