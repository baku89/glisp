<script setup lang="ts">
import { Icon } from 'tweeq/Icon'
import { useAppConfigStore } from 'tweeq/stores/appConfig'
import { computed, ref, useTemplateRef } from 'vue'

/**
 * What floats over the canvas from one edge, so with a border on the other three
 * sides. It is the one thing, a tab that grows into a panel and goes back.
 */
const props = defineProps<{
	/** What its size is kept under. */
	name: string
	side: 'left' | 'right'
	label: string
	icon: string
	/** How wide it opens, until it has been made otherwise. */
	width: number
	/** As tall as what is in it, until it has been made otherwise. */
	fit?: boolean
	/** Comes up from the bottom corner, as tall as this until made otherwise. */
	bottomHeight?: number
}>()

const open = defineModel<boolean>('open', { required: true })

const MIN_WIDTH = 200
const MIN_HEIGHT = 160
const MARGIN = 16

const config = useAppConfigStore()
const width = config.ref(`${props.name}.width`, props.width)
/** As tall as there is room for, until it has been made otherwise. */
const height = config.ref<number | null>(`${props.name}.height`, props.bottomHeight ?? null)
const fromBottom = computed(() => props.bottomHeight !== undefined)

const $root = useTemplateRef<HTMLElement>('$root')
const resizing = ref(false)

const style = computed(() => ({
	'--panel-width': `${width.value}px`,
	'--panel-height':
		height.value === null
			? `calc(100% - ${MARGIN * 2}px)`
			: `min(${height.value}px, calc(100% - ${MARGIN * 2}px))`,
}))

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
	resizing.value = true

	const onMove = (move: PointerEvent) => {
		if (axes.x) {
			const wanted = start.width + (move.clientX - clientX) * toward
			width.value = Math.round(Math.min(Math.max(wanted, MIN_WIDTH), parent.width - MARGIN))
		}
		if (axes.y) {
			const wanted = start.height + (move.clientY - clientY) * (fromBottom.value ? -1 : 1)
			height.value = Math.round(
				Math.min(Math.max(wanted, MIN_HEIGHT), parent.height - MARGIN * 2)
			)
		}
	}
	const onUp = () => {
		resizing.value = false
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
		:class="[side, { open, resizing, 'from-bottom': fromBottom, fitting: fit && height === null }]"
		:style="style"
	>
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
		<template v-if="open">
			<div class="edge side" data-selects-rows @pointerdown="resize($event, { x: true })" />
			<div class="edge bottom" data-selects-rows @pointerdown="resize($event, { y: true })" />
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
	top: 16px;
	overflow: hidden;
	width: var(--tab-width);
	height: var(--tab-height);
	border: 1px solid var(--tq-color-border);
	background: var(--tq-color-surface);
	backdrop-filter: blur(var(--tq-popup-blur));
	box-shadow: 0 0 20px 0 var(--tq-color-shadow);
	transition:
		width var(--ease),
		height var(--ease);
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
	width: var(--panel-width);
	height: var(--panel-height);
}
.FloatPanel.from-bottom {
	top: auto;
	bottom: 16px;
}
.from-bottom .tab,
.from-bottom .body {
	top: auto;
	bottom: 0;
}
.from-bottom .edge.bottom {
	top: 0;
	bottom: auto;
}
.from-bottom .edge.corner {
	top: 0;
	bottom: auto;
}
.from-bottom.right .edge.corner {
	cursor: nwse-resize;
}
.from-bottom.left .edge.corner {
	cursor: nesw-resize;
}
/* It takes as much as it has in it, as far as there is room. */
.FloatPanel.open.fitting {
	display: flex;
	flex-direction: column;
	height: auto;
	max-height: var(--panel-height);
	interpolate-size: allow-keywords;
}
.fitting .body {
	position: static;
	flex: 0 1 auto;
	min-height: 0;
	height: auto;
}
.fitting .content {
	flex: 0 1 auto;
	display: flex;
	flex-direction: column;
	overflow: hidden;
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
	position: absolute;
	top: 0;
	display: flex;
	flex-direction: column;
	width: var(--panel-width);
	height: 100%;
	opacity: 0;
	transition: opacity var(--ease);
}
.left .body {
	left: 0;
}
.right .body {
	right: 0;
}
.open .body {
	opacity: 1;
}
.header {
	display: flex;
	flex-shrink: 0;
	gap: var(--tq-gap-related);
	align-items: center;
	justify-content: space-between;
	padding: 6px 6px 0;
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
.content {
	flex: 1;
	min-height: 0;
	padding: var(--tq-pane-padding);
	/* The bar has the padding on this side for itself, whether it is there or not, and
	stays off the edge. */
	padding-right: 2px;
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
