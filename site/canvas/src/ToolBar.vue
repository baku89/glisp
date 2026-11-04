<script setup lang="ts">
import type { IconSequence } from 'bndr-js'
import { Icon } from 'tweeq/Icon'
import { Popover } from 'tweeq/Popover'
import { vTooltip } from 'tweeq/Tooltip'
import { computed, onBeforeUnmount, ref, shallowRef, useTemplateRef } from 'vue'

import {
	type Arrangement,
	distanceFrom,
	isThrown,
	placed,
	slotAt,
	stowedAway,
} from './toolbar'

interface Tool {
	readonly name: string
	readonly icon: string
	readonly tooltip: { readonly content: string; readonly shortcut?: IconSequence | undefined }
}

const props = defineProps<{
	tools: readonly Tool[]
	active: string
	arrangement: Arrangement
}>()

const emit = defineEmits<{
	select: [name: string]
	'update:arrangement': [arrangement: Arrangement]
}>()

/** A press does nothing but press, until it has gone this far. */
const DRAG_FROM = 4
/** A tool and the gap to the next, as `.tool` and `.tools` have them. */
const PITCH = 34
/** How long ago the pointer is looked back at, to tell how fast it is going. */
const SPEED_OVER = 80
const FLIGHT = 200
/** How far off the bar something being held is shown as coming off. */
const OFF_WHILE_HELD = 24

const $bar = useTemplateRef<HTMLElement>('$bar')
const $tools = useTemplateRef<HTMLElement>('$tools')
const $dots = useTemplateRef<HTMLElement>('$dots')

const byName = computed(() => new Map(props.tools.map(tool => [tool.name, tool])))
const open = ref(false)

interface Hold {
	readonly name: string
	readonly pointer: number
	readonly start: readonly [number, number]
	/** Where in the tool it was taken, for it to stay under the pointer. */
	readonly grab: readonly [number, number]
	moved: boolean
	/** How far it was from the bar, lately, and when. */
	trail: { readonly distance: number; readonly at: number }[]
}
let hold: Hold | null = null

/** What is being dragged, where it is now, and which place on the bar it is over. */
const dragging = shallowRef<{
	readonly name: string
	readonly x: number
	readonly y: number
	readonly slot: number | null
} | null>(null)
/** What was let go of, on its way behind the dots. */
const flying = shallowRef<{
	readonly name: string
	readonly x: number
	readonly y: number
	readonly gone: boolean
} | null>(null)

/** The bar as it would be if it were let go of now. */
const shown = computed(() => {
	const drag = dragging.value
	const { arrangement } = props
	if (drag === null) return arrangement.shown
	return drag.slot === null
		? arrangement.shown.filter(name => name !== drag.name)
		: placed(arrangement, drag.name, drag.slot).shown
})
const stowed = computed(() => props.arrangement.stowed)

const offTheBar = computed(() => dragging.value !== null && dragging.value.slot === null)

/** What is in use from behind the dots, which they then show instead. */
const activeStowed = computed(() =>
	stowed.value.includes(props.active) ? byName.value.get(props.active) : undefined
)

function press(event: PointerEvent, name: string): void {
	if (event.button !== 0) return
	const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
	hold = {
		name,
		pointer: event.pointerId,
		start: [event.clientX, event.clientY],
		grab: [event.clientX - rect.left, event.clientY - rect.top],
		moved: false,
		trail: [],
	}
}

const barBox = () => $bar.value!.getBoundingClientRect()

/** Which place on the bar a pointer is over, or none if it is off it, or at the dots. */
function slotFor(x: number, y: number, name: string): number | null {
	if (distanceFrom(x, y, barBox()) >= OFF_WHILE_HELD) return null
	const dots = $dots.value!.getBoundingClientRect()
	if (x >= dots.left) return null
	const count = props.arrangement.shown.filter(other => other !== name).length + 1
	const left = $tools.value!.getBoundingClientRect().left
	return slotAt(x, left, PITCH, count)
}

function move(event: PointerEvent): void {
	if (hold === null || event.pointerId !== hold.pointer) return
	const [x, y] = [event.clientX, event.clientY]
	if (!hold.moved) {
		if (Math.hypot(x - hold.start[0], y - hold.start[1]) < DRAG_FROM) return
		hold.moved = true
		open.value = false
		$bar.value?.setPointerCapture(event.pointerId)
	}
	const now = event.timeStamp
	hold.trail = [
		...hold.trail.filter(({ at }) => now - at <= SPEED_OVER),
		{ distance: distanceFrom(x, y, barBox()), at: now },
	]
	dragging.value = { name: hold.name, x, y, slot: slotFor(x, y, hold.name) }
}

/** How fast it was leaving the bar when let go of, which is not at all if it had stopped. */
function leavingSpeed(trail: Hold['trail'], now: number): number {
	// While it is still over the bar it is not leaving, however fast it goes.
	const recent = trail.filter(({ at, distance }) => now - at <= SPEED_OVER && distance > 0)
	const [first] = recent
	const last = recent.at(-1)
	if (first === undefined || last === undefined || last.at === first.at) return 0
	return (last.distance - first.distance) / (last.at - first.at)
}

let justDragged = false
let flight: ReturnType<typeof setTimeout> | undefined

function stow(name: string, x: number, y: number): void {
	const dots = $dots.value!.getBoundingClientRect()
	const [left, top] = [x - (hold?.grab[0] ?? 0), y - (hold?.grab[1] ?? 0)]
	flying.value = { name, x: left, y: top, gone: false }
	requestAnimationFrame(() => {
		if (flying.value !== null) flying.value = { name, x: dots.left, y: dots.top, gone: true }
	})
	clearTimeout(flight)
	flight = setTimeout(() => (flying.value = null), FLIGHT)
	emit('update:arrangement', stowedAway(props.arrangement, name))
}

function release(event: PointerEvent): void {
	if (hold === null || event.pointerId !== hold.pointer) return
	const drag = dragging.value
	if (drag !== null) {
		justDragged = true
		// A click comes after this, on what it was let go of over.
		setTimeout(() => (justDragged = false))
		const [x, y] = [event.clientX, event.clientY]
		const distance = distanceFrom(x, y, barBox())
		const dots = $dots.value!.getBoundingClientRect()
		const onDots = distanceFrom(x, y, dots) === 0
		const wasThere = props.arrangement.shown.includes(drag.name)
		const thrown = onDots || isThrown(distance, leavingSpeed(hold.trail, event.timeStamp))
		if (thrown) {
			if (wasThere) stow(drag.name, x, y)
		} else if (drag.slot !== null) {
			emit('update:arrangement', placed(props.arrangement, drag.name, drag.slot))
		} else if (!wasThere) {
			// Let go of just short of the bar, it comes to the end. What was on it stays where it was.
			emit('update:arrangement', placed(props.arrangement, drag.name, props.arrangement.shown.length))
		}
	}
	dragging.value = null
	hold = null
}

function cancel(): void {
	dragging.value = null
	hold = null
}

function click(name: string): void {
	if (justDragged) return
	emit('select', name)
}

function clickStowed(name: string): void {
	if (justDragged) return
	emit('select', name)
	open.value = false
}

onBeforeUnmount(() => clearTimeout(flight))

const tooltipOf = ({ tooltip: { content, shortcut } }: Tool) => ({
	content,
	...(shortcut === undefined ? {} : { shortcut: [...shortcut] }),
})
const ghost = computed(() => {
	const drag = dragging.value
	if (drag !== null) {
		return {
			icon: byName.value.get(drag.name)?.icon,
			style: { left: `${drag.x - (hold?.grab[0] ?? 0)}px`, top: `${drag.y - (hold?.grab[1] ?? 0)}px` },
			off: offTheBar.value,
			gone: false,
		}
	}
	const flown = flying.value
	if (flown === null) return null
	return {
		icon: byName.value.get(flown.name)?.icon,
		style: { left: `${flown.x}px`, top: `${flown.y}px` },
		off: true,
		gone: flown.gone,
	}
})
</script>

<template>
	<div
		ref="$bar"
		class="tools"
		data-selects-rows
		@pointermove="move"
		@pointerup="release"
		@pointercancel="cancel"
	>
		<div ref="$tools" class="sortable">
			<TransitionGroup name="tool">
				<button
					v-for="name in shown"
					:key="name"
					v-tooltip="tooltipOf(byName.get(name)!)"
					class="tool"
					:class="{ active: active === name, held: dragging?.name === name }"
					:aria-label="byName.get(name)!.tooltip.content"
					:aria-pressed="active === name"
					@pointerdown="press($event, name)"
					@click="click(name)"
				>
					<Icon :icon="byName.get(name)!.icon" />
				</button>
			</TransitionGroup>
		</div>
		<button
			ref="$dots"
			v-tooltip="{ content: 'More Tools' }"
			class="tool"
			:class="{ active: activeStowed !== undefined, ready: offTheBar }"
			aria-label="More Tools"
			:aria-expanded="open"
			@click="open = !open"
		>
			<Icon :icon="activeStowed?.icon ?? 'ph:dots-three-bold'" />
		</button>
		<slot />
		<Popover
			v-model:open="open"
			:reference="$dots"
			placement="top"
			:offset="{ mainAxis: 12 }"
		>
			<div class="stowed">
				<button
					v-for="name in stowed"
					:key="name"
					v-tooltip="tooltipOf(byName.get(name)!)"
					class="tool"
					:class="{ active: active === name }"
					:aria-label="byName.get(name)!.tooltip.content"
					:aria-pressed="active === name"
					@pointerdown="press($event, name)"
					@pointermove="move"
					@pointerup="release"
					@click="clickStowed(name)"
				>
					<Icon :icon="byName.get(name)!.icon" />
				</button>
				<p v-if="stowed.length === 0" class="hint">Throw a tool off the bar to keep it here.</p>
			</div>
		</Popover>
	</div>
	<div
		v-if="ghost !== null"
		class="tool ghost"
		:class="{ off: ghost.off, gone: ghost.gone }"
		:style="ghost.style"
	>
		<Icon v-if="ghost.icon" :icon="ghost.icon" />
	</div>
</template>

<style scoped>
.tools {
	--padding: 6px;
	--radius: 6px;
	position: absolute;
	bottom: 16px;
	left: 50%;
	translate: -50% 0;
	display: flex;
	gap: 2px;
	padding: var(--padding);
	border: 1px solid var(--tq-color-border);
	border-radius: calc(var(--radius) + var(--padding));
	background: var(--tq-color-surface);
	backdrop-filter: blur(var(--tq-popup-blur));
	box-shadow: var(--tq-shadow-popup);
	touch-action: none;
	user-select: none;
}
.sortable {
	display: flex;
	gap: 2px;
}
.tool,
:slotted(.tool) {
	--radius: 6px;
	display: grid;
	place-items: center;
	width: 32px;
	height: 32px;
	border: none;
	border-radius: var(--radius);
	background: none;
	color: var(--tq-color-text);
	font-size: 18px;
	cursor: pointer;
}
.tool:hover,
:slotted(.tool:hover) {
	background: var(--tq-color-input-hover);
}
.tool.active,
:slotted(.tool.active) {
	background: var(--tq-color-accent);
	color: var(--tq-color-on-accent, white);
}
.tool.ready {
	outline: 2px solid var(--tq-color-accent);
	outline-offset: -2px;
}
.tool.held {
	visibility: hidden;
}
.tool-move {
	transition: transform 0.15s ease;
}
.ghost {
	position: fixed;
	z-index: 10;
	border-radius: 6px;
	background: var(--tq-color-surface);
	box-shadow: var(--tq-shadow-popup);
	pointer-events: none;
	cursor: grabbing;
}
.ghost.off {
	opacity: 0.6;
}
.ghost.gone {
	opacity: 0;
	scale: 0.5;
	transition:
		left 0.2s ease-in,
		top 0.2s ease-in,
		opacity 0.2s ease-in,
		scale 0.2s ease-in;
}
.stowed {
	display: grid;
	grid-template-columns: repeat(4, 32px);
	gap: 2px;
	padding: 6px;
	border: 1px solid var(--tq-color-border);
	border-radius: 12px;
	background: var(--tq-color-surface);
	backdrop-filter: blur(var(--tq-popup-blur));
	box-shadow: var(--tq-shadow-popup);
	touch-action: none;
}
.hint {
	grid-column: 1 / -1;
	margin: 0;
	padding: 4px;
	color: var(--tq-color-text-mute);
	font-size: 12px;
}
</style>
