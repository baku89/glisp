<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import { Icon } from 'tweeq/Icon'
import { useAppConfigStore } from 'tweeq/stores/appConfig'
import { computed, inject, onBeforeUnmount, onMounted, ref, useSlots, useTemplateRef } from 'vue'

import { draggedHeight, draggedSplit, draggedTop, type Height } from './floatHeight'
import { GAP, MIN_HEIGHT, type PanelBox } from './panelLayout'
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
	/** How tall it opens, if not as tall as what is in it. */
	height?: number
	/** What is wrong with what is in it, to say on its tab. */
	alert?: string | null
}>()

const open = defineModel<boolean>('open', { required: true })

const MIN_WIDTH = 200
const MARGIN = 24
/** What is in the way of taking hold of the header. */
const NOT_A_HANDLE = 'button, input, textarea, select, a, [contenteditable], .RowName'

const dock = inject(PANEL_DOCK)!
const config = useAppConfigStore()
const width = config.ref(`${props.name}.width`, props.width)
const height = config.ref<Height>(`${props.name}.fixedHeight`, props.height ?? null)
const slots = useSlots()

const $root = useTemplateRef<HTMLElement>('$root')
const resizing = ref(false)
/** The end of it being dragged has come to where it fits. */
const snapped = ref<'top' | 'along' | null>(null)
/** A drag has come up against this end of the room there is. */
const reachedWall = ref<'top' | 'bottom' | null>(null)

const box = computed<PanelBox>(
	() =>
		dock.boxes.value.get(props.name) ?? {
			side: 'left',
			inset: 0,
			top: 0,
			bottom: null,
			maxHeight: 0,
			grows: 'down',
			shown: true,
			joinedAbove: false,
			joinedBelow: false,
			flushBottom: false,
			room: 0,
			neighbor: null,
			ceiling: 0,
			above: null,
		}
)
const floating = computed(() => box.value.inset > 0)
const tabs = computed(() => dock.tabsOf(props.name))
/** What has no title of its own, or has others alongside it, says by its tabs what it is. */
const showsTabs = computed(() => tabs.value.length > 1 || slots.header === undefined)
/** On an edge it folds away toward that edge. Off of one, there is no way that it goes. */
const minimizeIcon = computed(() =>
	floating.value ? 'ph:minus' : box.value.side === 'left' ? 'ph:caret-left' : 'ph:caret-right'
)
/** Held from both ends, so that it goes from one to the other. */
const fills = computed(() => box.value.top !== null && box.value.bottom !== null)
const moving = computed(() => dock.held.value.includes(props.name))
const order = computed(() => dock.layout.value.findIndex(({ groups }) => groups.some(({ tabs }) => tabs.includes(props.name))))

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

/** The walls of the window that it is attached to, as of where a drag has brought it. */
const walls = computed<readonly string[]>(() => {
	if (resizing.value) return reachedWall.value === null ? [] : [reachedWall.value]
	if (!moving.value) return []
	const { inset, side, top, bottom } = box.value
	return [
		...(inset === 0 ? [side] : []),
		...(top === 0 ? ['top'] : []),
		...(bottom === 0 ? ['bottom'] : []),
	]
})

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
		open,
		height,
		naturalHeight: () => ($root.value === null ? 0 : natural($root.value)),
		label: () => props.label,
		icon: () => props.icon,
		alert: () => props.alert ?? null,
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
	// With no box of its own to measure, while it is behind another tab.
	if (root !== null && box.value.shown) dock.measure(props.name, { width: root.offsetWidth, height: root.offsetHeight })
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
	const { grows, room, joinedAbove, joinedBelow, neighbor } = box.value
	let reached = false
	const down = grows === 'down' ? 1 : -1
	// Only what ends its stack has nothing past it, to go on to the end of the window.
	const canReach = grows === 'down' ? !joinedBelow : !joinedAbove
	const startY = dock.stackOf(props.name)?.y
	const before = height.value
	const across = axes.y ? dock.acrossLine(props.name, grows) : null
	// Between two that are joined, it divides what they come to, and nothing else moves.
	const split =
		across === null
			? null
			: {
					sum: start.height + (across.root()?.offsetHeight ?? 0),
					natural: across.naturalHeight(),
				}
	resizing.value = true

	const onMove = (move: PointerEvent) => {
		if (axes.x) {
			const wanted = start.width + (move.clientX - clientX) * toward
			const most = parent.width - box.value.inset - MARGIN
			dock.setWidth(props.name, Math.round(Math.min(Math.max(wanted, MIN_WIDTH), most)))
		}
		if (axes.y) {
			const wanted = Math.round(start.height + (move.clientY - clientY) * down)
			if (across !== null && split !== null) {
				const divided = draggedSplit(wanted, Math.round(split.sum), fit, split.natural, MIN_HEIGHT)
				height.value = divided.height
				across.height.value = divided.other
				snapped.value = divided.snapped ? 'along' : null
				return
			}
			const dragged = draggedHeight(wanted, room, fit, MIN_HEIGHT)
			const reaches = dragged.reaches && canReach
			reached = reaches
			// Growing up to what is above, it goes on starting from the end of the window.
			if (canReach && !(grows === 'up' && neighbor !== null)) {
				dock.setFull(props.name, reaches, reaches ? undefined : startY)
				height.value = reaches ? before : dragged.height
			} else {
				height.value = dragged.height
			}
			snapped.value = dragged.snapped ? 'along' : null
			reachedWall.value = reaches ? (grows === 'down' ? 'bottom' : 'top') : null
		}
	}
	const onUp = () => {
		resizing.value = false
		snapped.value = null
		reachedWall.value = null
		if (reached && neighbor !== null) {
			height.value = before
			dock.merge(props.name, neighbor)
		}
		handle.removeEventListener('pointermove', onMove)
		handle.removeEventListener('pointerup', onUp)
		handle.removeEventListener('pointercancel', onUp)
	}
	handle.addEventListener('pointermove', onMove)
	handle.addEventListener('pointerup', onUp)
	handle.addEventListener('pointercancel', onUp)
}

/** Moves its top, with its bottom staying where it is. */
function resizeTop(event: PointerEvent): void {
	const root = $root.value
	if (event.button !== 0 || !root) return
	event.preventDefault()
	const handle = event.currentTarget as HTMLElement
	handle.setPointerCapture(event.pointerId)
	const { clientY } = event
	const start = root.getBoundingClientRect()
	const parent = root.parentElement!.getBoundingClientRect()
	const { ceiling, above } = box.value
	// What takes up the room left has no height of its own to set, or to fit.
	const filling = fills.value
	const fit = filling ? Infinity : natural(root)
	let reached = false
	resizing.value = true

	const onMove = (move: PointerEvent) => {
		const wanted = Math.round(start.top - parent.top + move.clientY - clientY)
		const dragged = draggedTop(wanted, Math.round(start.bottom - parent.top), ceiling, fit, MIN_HEIGHT)
		reached = dragged.reaches
		dock.setY(props.name, dragged.y)
		if (!filling) height.value = dragged.height
		snapped.value = dragged.snapped ? 'top' : null
		reachedWall.value = dragged.reaches ? 'top' : null
	}
	const onUp = () => {
		resizing.value = false
		snapped.value = null
		reachedWall.value = null
		if (reached && above !== null) {
			// Its top goes on up over the gap and onto the line it comes to share.
			if (!filling && height.value !== null) height.value += GAP + 1
			dock.joinUnder(props.name, above)
		}
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
	dock.grab(props.name, event)
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
				behind: !box.shown,
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
		<div class="clip">
			<button
				class="tab"
				:inert="open"
				:aria-label="`Show ${label}`"
				data-selects-rows
				@pointerdown="dock.grab(name, $event)"
				@click="dock.setOpen(name, true)"
			>
				<Icon class="tab-icon" :icon="icon" />
				<span class="tab-label">{{ label }}</span>
			</button>
			<div class="body" :inert="!open">
				<header class="header" data-selects-rows @pointerdown="grabHeader">
					<div v-if="showsTabs" class="strip" role="tablist">
						<button
							v-for="tab in tabs"
							:key="tab.name"
							class="strip-tab"
							:class="{ active: tab.active }"
							role="tab"
							:aria-selected="tab.active"
							@pointerdown="dock.grab(tab.name, $event, { byTab: true })"
							@click="dock.activate(tab.name)"
						>
							<Icon :icon="tab.icon" />
							<span class="strip-label" :data-label="tab.label">{{ tab.label }}</span>
							<span v-if="tab.alert" class="alert" :aria-label="tab.alert" />
						</button>
					</div>
					<slot v-else name="header" />
					<button class="toggle" :aria-label="`Minimize ${label}`" @click="dock.setOpen(name, false)">
						<Icon :icon="minimizeIcon" />
					</button>
				</header>
				<div
					v-if="showsTabs && slots.header"
					class="header below-tabs"
					data-selects-rows
					@pointerdown="grabHeader"
				>
					<slot name="header" />
				</div>
				<div class="content">
					<slot />
				</div>
			</div>
		</div>
		<div v-for="wall in walls" :key="wall" class="wall" :class="wall" />
		<template v-if="open">
			<div class="edge side" data-selects-rows @pointerdown="resize($event, { x: true })" />
			<div
				v-if="box.grows === 'down' && !box.joinedAbove"
				class="edge top"
				:class="{ snapped: snapped === 'top' }"
				data-selects-rows
				@pointerdown="resizeTop"
			/>
			<div
				v-if="!(fills && box.joinedBelow)"
				class="edge along"
				:class="{ snapped: snapped === 'along' }"
				data-selects-rows
				@pointerdown="resize($event, { y: true })"
			/>
			<div
				v-if="!(fills && box.joinedBelow)"
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
/* Behind what is in it, as a blur only sees through to the canvas from outside of anything
else that blurs. */
.FloatPanel::before {
	content: '';
	position: absolute;
	inset: -1px;
	z-index: -1;
	box-sizing: border-box;
	border: 1px solid var(--tq-color-border);
	border-radius: inherit;
	background: var(--tq-color-surface);
	backdrop-filter: blur(var(--tq-popup-blur));
	box-shadow: var(--tq-shadow-popup);
	pointer-events: none;
}
.FloatPanel.left:not(.floating)::before {
	left: 0;
	border-left: none;
}
.FloatPanel.right:not(.floating)::before {
	right: 0;
	border-right: none;
}
.FloatPanel.flush-bottom::before {
	border-bottom: none;
}
/* What is next to it casts nothing onto it. */
.FloatPanel.joined-above::before {
	clip-path: inset(0 -64px -64px -64px);
}
.FloatPanel.joined-below::before {
	clip-path: inset(-64px -64px 0 -64px);
}
.FloatPanel.joined-above.joined-below::before {
	clip-path: inset(0 -64px 0 -64px);
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
/* What is in it stays in it. */
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
/* Behind another tab. */
.FloatPanel.behind {
	display: none;
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
/* What is being dragged, with what it says about that, is over what it is joined to. */
.FloatPanel.resizing,
.FloatPanel.moving {
	z-index: 60 !important;
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
/* A boundary that can be dragged lights up, as that of a split view does. */
.edge::before {
	content: '';
	position: absolute;
	background: var(--tq-color-accent);
	opacity: 0;
	pointer-events: none;
	transition: opacity var(--tq-hover-transition-duration) ease;
}
.edge.side::before {
	top: 0;
	bottom: 0;
	width: 3px;
}
.left .edge.side::before {
	right: -1px;
}
.right .edge.side::before {
	left: -1px;
}
.edge.along::before,
.edge.top::before {
	right: 0;
	left: 0;
	height: 3px;
}
.down .edge.along::before {
	bottom: -1px;
}
.up .edge.along::before,
.edge.top::before {
	top: -1px;
}
.edge:is(.side, .along, .top):hover::before,
.edge:is(.side, .along, .top):active::before,
.FloatPanel:has(.edge.corner:hover, .edge.corner:active) .edge:is(.side, .along)::before {
	opacity: 1;
}
/* Where it would fit is a mark on the way, so it is dashed, and says so. */
.edge.snapped::before {
	height: 2px;
	background: repeating-linear-gradient(to right, var(--tq-color-accent) 0 6px, transparent 6px 10px);
	opacity: 1;
	transition: none;
}
.edge.snapped::after {
	content: 'Fit';
	position: absolute;
	top: 50%;
	left: 50%;
	translate: -50% -50%;
	padding-inline: 6px;
	border-radius: 9999px;
	background: var(--tq-color-accent);
	color: var(--tq-color-on-accent, white);
	font-size: 10px;
	line-height: 16px;
	pointer-events: none;
}
/* Coming onto a wall of the window is a thing of its own: it glows, from that wall. */
.wall {
	--glow: 16px;
	position: absolute;
	z-index: 3;
	pointer-events: none;
	animation: wall-on 120ms ease-out;
}
@keyframes wall-on {
	from {
		opacity: 0;
	}
}
.wall.left,
.wall.right {
	top: -1px;
	bottom: -1px;
	width: var(--glow);
}
.wall.top,
.wall.bottom {
	right: -1px;
	left: -1px;
	height: var(--glow);
}
.wall.left {
	left: 0;
	border-left: 3px solid var(--tq-color-accent);
	background: linear-gradient(to right, var(--wall-tint), transparent);
}
.wall.right {
	right: 0;
	border-right: 3px solid var(--tq-color-accent);
	background: linear-gradient(to left, var(--wall-tint), transparent);
}
.wall.top {
	top: -1px;
	border-top: 3px solid var(--tq-color-accent);
	background: linear-gradient(to bottom, var(--wall-tint), transparent);
}
.wall.bottom {
	bottom: -1px;
	border-bottom: 3px solid var(--tq-color-accent);
	background: linear-gradient(to top, var(--wall-tint), transparent);
}
.wall {
	--wall-tint: color-mix(in srgb, var(--tq-color-accent) 35%, transparent);
	box-sizing: border-box;
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
.edge.top {
	top: 0;
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
.strip {
	display: flex;
	gap: 2px;
	min-width: 0;
	overflow: hidden;
}
.strip-tab {
	display: flex;
	flex: none;
	gap: var(--tq-gap-related);
	align-items: center;
	height: 24px;
	padding-inline: 6px;
	border: none;
	background: none;
	color: var(--tq-color-text-mute);
	cursor: pointer;
}
.strip-tab:hover {
	color: var(--tq-color-text);
}
/* As the tabs of files say which one it is. */
.strip-tab.active {
	box-shadow: inset 0 -2px 0 currentColor;
	color: var(--tq-color-text);
}
.strip-tab.active .strip-label {
	font-weight: 600;
}
/* As wide as it is when bold, whether it is or not, so that the tabs stay where they are. */
.strip-label {
	display: inline-grid;
}
.strip-label::after {
	content: attr(data-label);
	visibility: hidden;
	overflow: hidden;
	height: 0;
	font-weight: 600;
}
.alert {
	width: 6px;
	height: 6px;
	border-radius: 50%;
	background: var(--tq-color-error);
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
