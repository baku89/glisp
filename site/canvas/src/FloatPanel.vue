<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import { Icon } from 'tweeq/Icon'
import { InputButton } from 'tweeq/InputButton'
import { useAppConfigStore } from 'tweeq/stores/appConfig'
import { computed, inject, onBeforeUnmount, onMounted, ref, useSlots, useTemplateRef } from 'vue'

import { draggedHeight, draggedSplit, draggedTop, type Height } from './floatHeight'
import { GAP, isUpright, MIN_HEIGHT, type PanelBox } from './panelLayout'
import { PANEL_DOCK } from './usePanelLayout'

/**
 * What floats over the canvas, from an edge or away from them, alone or joined to others. It
 * is the one thing, a tab that grows into a panel and goes back. It is as tall as what is in
 * it, until it has been made otherwise. Where it is, the layout says.
 *
 * It is the same on each edge: what goes down an edge at the side goes across one at the top or
 * the bottom, and its width there is how long it is along that edge, as its height is at a side.
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
/** A drag along an edge at the top or bottom has no length of its own to come to rest at. */
const NO_FIT = -1e9

const dock = inject(PANEL_DOCK)!
const config = useAppConfigStore()
const width = config.ref(`${props.name}.width`, props.width)
const height = config.ref<Height>(`${props.name}.fixedHeight`, props.height ?? null)
const slots = useSlots()

const $root = useTemplateRef<HTMLElement>('$root')
const resizing = ref(false)
/** The end of it being dragged has come to where it fits. */
const snapped = ref<'start' | 'end' | 'across' | null>(null)
/** A drag has come up against this wall of the window. */
const reachedWall = ref<string | null>(null)

const box = computed<PanelBox>(
	() =>
		dock.boxes.value.get(props.name) ?? {
			side: 'left',
			inset: 0,
			start: 0,
			end: null,
			most: 0,
			grows: 'forward',
			shown: true,
			joinedBefore: false,
			joinedAfter: false,
			flushStart: false,
			flushEnd: false,
			room: 0,
			neighbor: null,
			ceiling: 0,
			before: null,
			folded: false,
		}
)
/** On an edge at the side, rather than lying along the top or the bottom. */
const upright = computed(() => isUpright(box.value.side))
const floating = computed(() => box.value.inset > 0)
/** Minimized among others it is joined to, as no more than its header. */
const folded = computed(() => box.value.folded && !open.value)
const tabs = computed(() => dock.tabsOf(props.name))
/** What has no title of its own, or has others alongside it, says by its tabs what it is. */
const showsTabs = computed(() => tabs.value.length > 1 || slots.header === undefined)
/** On an edge it folds away toward that edge, or among others to its header. Off of one, there is no way it goes. */
const minimizeIcon = computed(() => {
	if (box.value.joinedBefore || box.value.joinedAfter) return upright.value ? 'ph:caret-up' : 'ph:caret-left'
	if (floating.value) return 'ph:minus'
	return { left: 'ph:caret-left', right: 'ph:caret-right', top: 'ph:caret-up', bottom: 'ph:caret-down' }[box.value.side]
})
/** Held from both ends, so that it goes from one to the other. */
const fills = computed(() => box.value.start !== null && box.value.end !== null)
const moving = computed(() => dock.held.value.includes(props.name))
/** Another in its stack is being resized, which it goes along with at once. */
const following = computed(() => !resizing.value && dock.resizing.value.includes(props.name))
const order = computed(() => dock.layout.value.findIndex(({ groups }) => groups.some(({ tabs }) => tabs.includes(props.name))))

const px = (value: number | null): string => (value === null ? 'auto' : `${value}px`)

const style = computed(() => ({
	'--panel-width': upright.value || !fills.value ? `${width.value}px` : 'auto',
	'--panel-height': (upright.value && fills.value) || height.value === null ? 'auto' : `${height.value}px`,
	'--panel-most': `${box.value.most}px`,
	'--panel-start': px(box.value.start),
	'--panel-end': px(box.value.end),
	'--panel-inset': `${box.value.inset}px`,
	zIndex: order.value + 1,
}))

/** The walls of the window that it is attached to, as of where a drag has brought it. */
const walls = computed<readonly string[]>(() => {
	if (resizing.value) return reachedWall.value === null ? [] : [reachedWall.value]
	if (!moving.value) return []
	const { inset, side, start, end } = box.value
	return [
		...(inset === 0 ? [side] : []),
		...(start === 0 ? [upright.value ? 'top' : 'left'] : []),
		...(end === 0 ? [upright.value ? 'bottom' : 'right'] : []),
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

/** Follows a drag from a press on one of its edges, until it is let go of. */
function dragFrom(event: PointerEvent, handlers: { move: (move: PointerEvent) => void; up?: () => void }): void {
	const handle = event.currentTarget as HTMLElement
	handle.setPointerCapture(event.pointerId)
	resizing.value = true
	dock.resize(props.name)
	const onUp = () => {
		resizing.value = false
		dock.resize(null)
		snapped.value = null
		reachedWall.value = null
		handlers.up?.()
		handle.removeEventListener('pointermove', handlers.move)
		handle.removeEventListener('pointerup', onUp)
		handle.removeEventListener('pointercancel', onUp)
	}
	handle.addEventListener('pointermove', handlers.move)
	handle.addEventListener('pointerup', onUp)
	handle.addEventListener('pointercancel', onUp)
}

/** How long it is along its edge, which is its height at a side and its width at the top or bottom. */
const lengthOf = (rect: { width: number; height: number }): number => (upright.value ? rect.height : rect.width)

/** Sets how long a panel is along its edge, with `null` for as tall as what is in it, at a side. */
function setLength(handle: { width: { value: number }; height: { value: Height } }, length: Height, was: number): void {
	if (upright.value) handle.height.value = length
	else handle.width.value = Math.round(length ?? was)
}
const own = { width, height }

function resize(event: PointerEvent, axes: { across?: boolean; along?: boolean }): void {
	const root = $root.value
	if (event.button !== 0 || !root) return
	event.preventDefault()
	const { clientX, clientY } = event
	const start = root.getBoundingClientRect()
	const parent = root.parentElement!.getBoundingClientRect()
	const toward = box.value.side === 'left' || box.value.side === 'top' ? 1 : -1
	const fit = axes.along ? (upright.value ? natural(root) : NO_FIT) : 0
	const fitAcross = axes.across && !upright.value ? natural(root) : 0
	const { grows, room, joinedBefore, joinedAfter, neighbor } = box.value
	let reached = false
	const forward = grows === 'forward' ? 1 : -1
	// Only what ends its stack has nothing past it, to go on to the end of the edge.
	const canReach = grows === 'forward' ? !joinedAfter : !joinedBefore
	const startAlong = dock.stackOf(props.name)?.along
	// Going on to the end, it starts where it is now, even from the middle.
	const fullFrom = typeof startAlong === 'number' ? startAlong : (box.value.start ?? undefined)
	const before = upright.value ? height.value : width.value
	const across = axes.along ? dock.acrossLine(props.name, grows) : null
	const otherRect = across?.root()?.getBoundingClientRect()
	// Between two that are joined, it divides what they come to, and nothing else moves.
	const split =
		across === null || otherRect === undefined
			? null
			: { sum: lengthOf(start) + lengthOf(otherRect), natural: upright.value ? across.naturalHeight() : NO_FIT }
	const endWall = upright.value ? (grows === 'forward' ? 'bottom' : 'top') : grows === 'forward' ? 'right' : 'left'

	dragFrom(event, {
		move(move) {
			const [dx, dy] = [move.clientX - clientX, move.clientY - clientY]
			if (axes.across) {
				if (upright.value) {
					const wanted = start.width + dx * toward
					const most = parent.width - box.value.inset - MARGIN
					dock.setWidth(props.name, Math.round(Math.min(Math.max(wanted, MIN_WIDTH), most)))
				} else {
					// How tall it is, for each that it is joined to, as how wide is at a side.
					const most = parent.height - box.value.inset - MARGIN
					const dragged = draggedHeight(Math.round(start.height + dy * toward), most, fitAcross, MIN_HEIGHT)
					dock.setHeight(props.name, dragged.reaches ? Math.round(most) : dragged.height)
					snapped.value = dragged.snapped ? 'across' : null
				}
			}
			if (axes.along) {
				const wanted = Math.round(lengthOf(start) + (upright.value ? dy : dx) * forward)
				if (across !== null && split !== null) {
					const divided = draggedSplit(wanted, Math.round(split.sum), fit, split.natural, MIN_HEIGHT)
					setLength(own, divided.height, lengthOf(start))
					setLength(across, divided.other, split.sum - wanted)
					snapped.value = divided.snapped ? 'end' : null
					return
				}
				const dragged = draggedHeight(wanted, room, fit, MIN_HEIGHT)
				const reaches = dragged.reaches && canReach
				reached = reaches
				// Growing back to what is before it, it goes on starting from the end of the edge.
				if (canReach && !(grows === 'back' && neighbor !== null)) {
					dock.setFull(props.name, reaches, reaches ? fullFrom : startAlong)
					setLength(own, reaches ? before : dragged.height, lengthOf(start))
				} else {
					setLength(own, dragged.height, lengthOf(start))
				}
				snapped.value = dragged.snapped ? 'end' : null
				reachedWall.value = reaches ? endWall : null
			}
		},
		up() {
			if (reached && neighbor !== null) {
				setLength(own, before, lengthOf(start))
				dock.merge(props.name, neighbor)
			}
		},
	})
}

/** Moves its start, with its end staying where it is. */
function resizeStart(event: PointerEvent): void {
	const root = $root.value
	if (event.button !== 0 || !root) return
	event.preventDefault()
	const { clientX, clientY } = event
	const start = root.getBoundingClientRect()
	const parent = root.parentElement!.getBoundingClientRect()
	const { ceiling, before } = box.value
	const [from, to] = upright.value
		? [start.top - parent.top, start.bottom - parent.top]
		: [start.left - parent.left, start.right - parent.left]
	// What takes up the room left has no length of its own to set, or to fit.
	const filling = fills.value
	const fit = filling ? Infinity : upright.value ? natural(root) : NO_FIT
	let reached = false

	dragFrom(event, {
		move(move) {
			const wanted = Math.round(from + (upright.value ? move.clientY - clientY : move.clientX - clientX))
			const dragged = draggedTop(wanted, Math.round(to), ceiling, fit, MIN_HEIGHT)
			reached = dragged.reaches
			dock.setAlong(props.name, dragged.y)
			if (!filling) setLength(own, dragged.height, to - dragged.y)
			snapped.value = dragged.snapped ? 'start' : null
			reachedWall.value = dragged.reaches ? (upright.value ? 'top' : 'left') : null
		},
		up() {
			if (reached && before !== null) {
				// Its start goes on back over the gap and onto the line it comes to share.
				if (!filling) {
					if (upright.value && height.value !== null) height.value += GAP + 1
					if (!upright.value) width.value += GAP + 1
				}
				dock.joinUnder(props.name, before)
			}
		},
	})
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
			upright ? 'upright' : 'lying',
			{
				behind: !box.shown,
				open,
				folded,
				floating,
				fills,
				moving,
				resizing,
				following,
				fitting: !fills && height === null,
				'joined-before': box.joinedBefore,
				'joined-after': box.joinedAfter,
				'flush-start': box.flushStart,
				'flush-end': box.flushEnd,
			},
		]"
		:style="style"
		:data-panel="name"
		@pointerdown.capture="dock.raise(name)"
	>
		<div class="clip">
			<button
				class="tab"
				:inert="open || (folded && upright)"
				:aria-label="`Show ${label}`"
				data-selects-rows
				@pointerdown="dock.grab(name, $event)"
				@click="dock.setOpen(name, true)"
			>
				<Icon class="tab-icon" :icon="icon" />
				<span class="tab-label">{{ label }}</span>
			</button>
			<div class="body" :inert="!open && !(folded && upright)">
				<header class="header" data-selects-rows @pointerdown="grabHeader">
					<div v-if="showsTabs" class="strip" :class="{ alone: tabs.length === 1 }" role="tablist">
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
					<InputButton
						v-if="folded"
						class="toggle"
						icon="ph:caret-down"
						ghost
						:aria-label="`Show ${label}`"
						@click="dock.setOpen(name, true)"
					/>
					<InputButton
						v-else
						class="toggle"
						:icon="minimizeIcon"
						ghost
						:aria-label="`Minimize ${label}`"
						@click="dock.setOpen(name, false)"
					/>
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
			<div
				class="edge across"
				:class="{ snapped: snapped === 'across' }"
				data-selects-rows
				@pointerdown="resize($event, { across: true })"
			/>
			<div
				v-if="box.grows === 'forward' && !box.joinedBefore"
				class="edge start"
				:class="{ snapped: snapped === 'start' }"
				data-selects-rows
				@pointerdown="resizeStart"
			/>
			<div
				v-if="!(fills && box.joinedAfter)"
				class="edge along"
				:class="{ snapped: snapped === 'end' }"
				data-selects-rows
				@pointerdown="resize($event, { along: true })"
			/>
			<div
				v-if="!(fills && box.joinedAfter)"
				class="edge corner"
				data-selects-rows
				@pointerdown="resize($event, { across: true, along: true })"
			/>
		</template>
	</aside>
</template>

<style scoped>
.FloatPanel {
	--ease: 240ms cubic-bezier(0.2, 0, 0, 1);
	--tab-width: 32px;
	--tab-height: 112px;
	--corner-tl: var(--tq-radius-pane);
	--corner-tr: var(--tq-radius-pane);
	--corner-br: var(--tq-radius-pane);
	--corner-bl: var(--tq-radius-pane);
	position: absolute;
	isolation: isolate;
	display: flex;
	flex-direction: column;
	box-sizing: border-box;
	border: 1px solid transparent;
	border-radius: var(--corner-tl) var(--corner-tr) var(--corner-br) var(--corner-bl);
	interpolate-size: allow-keywords;
	transition:
		width var(--ease),
		height var(--ease);
}
/* Where it is: kept from its wall, and along that wall from where it starts or ends. */
.FloatPanel.upright {
	top: var(--panel-start);
	bottom: var(--panel-end);
	width: var(--tab-width);
	height: var(--tab-height);
}
.FloatPanel.lying {
	right: var(--panel-end);
	left: var(--panel-start);
	width: var(--tab-height);
	height: var(--tab-width);
}
.FloatPanel.left {
	left: var(--panel-inset);
}
.FloatPanel.right {
	right: var(--panel-inset);
}
.FloatPanel.top {
	top: var(--panel-inset);
}
.FloatPanel.bottom {
	bottom: var(--panel-inset);
}
/* On its wall, it goes straight into it. */
.FloatPanel.left:not(.floating) {
	--corner-tl: 0px;
	--corner-bl: 0px;
	border-left: none;
}
.FloatPanel.right:not(.floating) {
	--corner-tr: 0px;
	--corner-br: 0px;
	border-right: none;
}
.FloatPanel.top:not(.floating) {
	--corner-tl: 0px;
	--corner-tr: 0px;
	border-top: none;
}
.FloatPanel.bottom:not(.floating) {
	--corner-bl: 0px;
	--corner-br: 0px;
	border-bottom: none;
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
.FloatPanel.top:not(.floating)::before {
	top: 0;
	border-top: none;
}
.FloatPanel.bottom:not(.floating)::before {
	bottom: 0;
	border-bottom: none;
}
/* At the start of its edge it meets the title bar, or the wall, and goes straight into it. */
.FloatPanel.upright.flush-start::before {
	top: 0;
	border-top: none;
}
.FloatPanel.lying.flush-start::before {
	left: 0;
	border-left: none;
}
.FloatPanel.upright.flush-end::before {
	border-bottom: none;
}
.FloatPanel.lying.flush-end::before {
	border-right: none;
}
/* What is next to it casts nothing onto it, and nothing goes onto the title bar or the wall it starts from. */
.FloatPanel.upright:is(.joined-before, .flush-start)::before {
	clip-path: inset(0 -64px -64px -64px);
}
.FloatPanel.upright.joined-after::before {
	clip-path: inset(-64px -64px 0 -64px);
}
.FloatPanel.upright:is(.joined-before, .flush-start).joined-after::before {
	clip-path: inset(0 -64px 0 -64px);
}
.FloatPanel.lying:is(.joined-before, .flush-start)::before {
	clip-path: inset(-64px -64px -64px 0);
}
.FloatPanel.lying.joined-after::before {
	clip-path: inset(-64px 0 -64px -64px);
}
.FloatPanel.lying:is(.joined-before, .flush-start).joined-after::before {
	clip-path: inset(-64px 0 -64px 0);
}
/* Where it meets another, or either end of its edge, it goes straight on. */
.FloatPanel.upright:is(.joined-before, .flush-start) {
	--corner-tl: 0px;
	--corner-tr: 0px;
}
.FloatPanel.upright:is(.joined-after, .flush-end) {
	--corner-bl: 0px;
	--corner-br: 0px;
}
.FloatPanel.lying:is(.joined-before, .flush-start) {
	--corner-tl: 0px;
	--corner-bl: 0px;
}
.FloatPanel.lying:is(.joined-after, .flush-end) {
	--corner-tr: 0px;
	--corner-br: 0px;
}
.FloatPanel.open {
	width: var(--panel-width);
	height: var(--panel-height);
}
.FloatPanel.upright.open {
	max-height: var(--panel-most);
}
.FloatPanel.lying.open {
	max-width: var(--panel-most);
}
/* It goes between where it is held from, rather than being of any length of its own. */
.FloatPanel.upright.open.fills {
	height: auto;
	max-height: none;
}
.FloatPanel.lying.open.fills {
	width: auto;
	max-width: none;
}
/* Minimized among others, at a side it is no more than its header, as wide as they are. */
.FloatPanel.upright.folded {
	width: var(--panel-width);
	height: auto;
}
/* And across the top or the bottom, no more than its tab, standing up. */
.FloatPanel.lying.folded {
	width: var(--tab-width);
	height: var(--tab-height);
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
.left .clip,
.lying .clip {
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
.FloatPanel.bottom.open.measuring {
	top: auto;
	bottom: var(--panel-inset);
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
/* It goes by the pointer, rather than following it, and so does what is joined to it. */
.FloatPanel.resizing,
.FloatPanel.following,
.FloatPanel.moving {
	transition: none;
	user-select: none;
}
.FloatPanel.moving .header,
.FloatPanel.moving .tab {
	cursor: grabbing;
}
/* A boundary that can be dragged lights up, as that of a split view does. */
.edge {
	position: absolute;
	z-index: 2;
	touch-action: none;
}
.edge::before {
	content: '';
	position: absolute;
	background: var(--tq-color-accent);
	opacity: 0;
	pointer-events: none;
	transition: opacity var(--tq-hover-transition-duration) ease;
}
/* An edge that goes up and down, and one that goes across. */
.upright .edge.across,
.lying .edge:is(.along, .start) {
	top: 0;
	bottom: 0;
	width: 6px;
	cursor: ew-resize;
}
.lying .edge.across,
.upright .edge:is(.along, .start) {
	right: 0;
	left: 0;
	height: 6px;
	cursor: ns-resize;
}
.upright .edge.across::before,
.lying .edge:is(.along, .start)::before {
	top: 0;
	bottom: 0;
	width: 3px;
}
.lying .edge.across::before,
.upright .edge:is(.along, .start)::before {
	right: 0;
	left: 0;
	height: 3px;
}
/* How thick it is, at the side away from its wall. */
.left .edge.across {
	right: 0;
}
.left .edge.across::before {
	right: -1px;
}
.right .edge.across {
	left: 0;
}
.right .edge.across::before {
	left: -1px;
}
.top .edge.across {
	bottom: 0;
}
.top .edge.across::before {
	bottom: -1px;
}
.bottom .edge.across {
	top: 0;
}
.bottom .edge.across::before {
	top: -1px;
}
/* How long it is, at the end that it grows from, and where it starts. */
.upright.forward .edge.along {
	bottom: 0;
}
.upright.forward .edge.along::before {
	bottom: -1px;
}
.upright.back .edge.along,
.upright .edge.start {
	top: 0;
}
.upright.back .edge.along::before,
.upright .edge.start::before {
	top: -1px;
}
.lying.forward .edge.along {
	right: 0;
}
.lying.forward .edge.along::before {
	right: -1px;
}
.lying.back .edge.along,
.lying .edge.start {
	left: 0;
}
.lying.back .edge.along::before,
.lying .edge.start::before {
	left: -1px;
}
.edge.corner {
	width: 14px;
	height: 14px;
}
.left .edge.corner,
.lying.forward .edge.corner {
	right: 0;
}
.right .edge.corner,
.lying.back .edge.corner {
	left: 0;
}
.top .edge.corner,
.upright.forward .edge.corner {
	bottom: 0;
}
.bottom .edge.corner,
.upright.back .edge.corner {
	top: 0;
}
.left.forward .edge.corner,
.right.back .edge.corner,
.top.forward .edge.corner,
.bottom.back .edge.corner {
	cursor: nwse-resize;
}
.right.forward .edge.corner,
.left.back .edge.corner,
.top.back .edge.corner,
.bottom.forward .edge.corner {
	cursor: nesw-resize;
}
.edge:is(.across, .along, .start):hover::before,
.edge:is(.across, .along, .start):active::before,
.FloatPanel:has(.edge.corner:hover, .edge.corner:active) .edge:is(.across, .along)::before {
	opacity: 1;
}
/* Where it would fit is a mark on the way, so it is dashed, and says so. */
.edge.snapped::before {
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
	--wall-tint: color-mix(in srgb, var(--tq-color-accent) 35%, transparent);
	position: absolute;
	z-index: 3;
	box-sizing: border-box;
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
.tab {
	position: absolute;
	top: 0;
	left: 0;
	display: flex;
	gap: 6px;
	align-items: center;
	border: none;
	background: none;
	color: var(--tq-color-text-mute);
	cursor: pointer;
	transition: opacity var(--ease);
}
/* Standing up along an edge at the side, and among others across the top or the bottom. */
.upright .tab,
.lying.folded .tab {
	flex-direction: column;
	width: var(--tab-width);
	height: var(--tab-height);
	padding-block: 8px;
}
.lying:not(.folded) .tab {
	width: var(--tab-height);
	height: var(--tab-width);
	padding-inline: 8px;
}
.upright.back .tab {
	top: auto;
	bottom: 0;
}
.right .tab,
.lying.back:not(.folded) .tab {
	right: 0;
	left: auto;
}
.bottom .tab {
	top: auto;
	bottom: 0;
}
.tab:hover {
	color: var(--tq-color-text);
}
.tab-icon {
	flex: none;
	font-size: 18px;
}
.tab-label {
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}
.upright .tab-label,
.lying.folded .tab-label {
	writing-mode: vertical-rl;
}
.open .tab,
.upright.folded .tab {
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
.lying.fills .body {
	width: 100%;
}
/* It goes in toward where it folds away to, the corner that the tab is in. */
.left .body,
.top.forward .body {
	transform-origin: left top;
}
.right .body,
.top.back .body {
	transform-origin: right top;
}
.left.back .body,
.bottom.forward .body {
	transform-origin: left bottom;
}
.right.back .body,
.bottom.back .body {
	transform-origin: right bottom;
}
.fitting .body {
	flex: 0 1 auto;
}
.open .body,
.upright.folded .body {
	opacity: 1;
	scale: 1;
}
/* Folded, there is nothing to it but its header. */
.folded :is(.content, .below-tabs) {
	display: none;
}
.upright.folded .header {
	padding-bottom: 6px;
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
/* As the tabs of files say which one it is, which there is no need for with only the one. */
.strip-tab.active {
	box-shadow: inset 0 -2px 0 currentColor;
	color: var(--tq-color-text);
}
.strip.alone .strip-tab {
	box-shadow: none;
	cursor: inherit;
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
	flex: none;
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
