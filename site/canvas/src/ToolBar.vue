<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import type { IconSequence } from 'bndr-js'
import { Icon } from 'tweeq/Icon'
import { Popover } from 'tweeq/Popover'
import { vTooltip } from 'tweeq/Tooltip'
import { computed, ref, shallowRef, useTemplateRef } from 'vue'

import {
	type Arrangement,
	type Bar,
	barPlaceAt,
	distanceFrom,
	type Drop,
	dropAmong,
	foldered,
	MAIN_BAR,
	mergedBars,
	movedBar,
	placed,
	separated,
	shownInFolder,
	shownOf,
	type Slot,
	stowedAway,
	toolsOf,
	withColumns,
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
/** How near a bar what is being held has to come, to mean that bar. */
const NEAR_BAR = 12
/** A tool and the gap to the next, as `.tool` and `.sortable` have them. */
const PITCH = 34

const $root = useTemplateRef<HTMLElement>('$root')
const dots = shallowRef<HTMLElement | null>(null)
const setDots = (element: unknown): void => {
	dots.value = element as HTMLElement | null
}

const byName = computed(() => new Map(props.tools.map(tool => [tool.name, tool])))
const stowedOpen = ref(false)
/** The folder whose tools are showing, and what they come out of. */
const flyout = shallowRef<{ readonly tools: readonly string[]; readonly from: HTMLElement } | null>(null)

const barElement = (id: string): HTMLElement | null =>
	$root.value?.parentElement?.querySelector<HTMLElement>(`[data-bar="${id}"]`) ?? null

const stage = (): HTMLElement => $root.value!.parentElement!

const cellsOf = (id: string): HTMLElement[] => [
	...(barElement(id)?.querySelectorAll<HTMLElement>('[data-slot]') ?? []),
]

/** What letting go of what is being held would do. */
type Target =
	| { readonly kind: 'stow' }
	| { readonly kind: 'bar'; readonly bar: string; readonly drop: Drop }
	| { readonly kind: 'off' }

/** What is being held, with what it would do, for showing that. */
const heldTool = shallowRef<{
	readonly slot: Slot
	readonly x: number
	readonly y: number
	readonly target: Target
} | null>(null)
const movingBar = shallowRef<{ readonly id: string; readonly into: string | null } | null>(null)

/** Where a tool would go, between two others. */
const caret = computed(() => {
	const held = heldTool.value
	if (held?.target.kind !== 'bar' || held.target.drop.kind !== 'at') return null
	const bar = props.arrangement.bars.find(({ id }) => held.target.kind === 'bar' && id === held.target.bar)
	if (bar === undefined) return null
	const cells = cellsOf(bar.id)
	const origin = stage().getBoundingClientRect()
	const { index } = held.target.drop
	const standing = isStanding(bar)
	const before = cells[index]?.getBoundingClientRect()
	const after = cells[index - 1]?.getBoundingClientRect()
	const cell = before ?? after
	if (cell === undefined) return null
	const onAfter = before === undefined
	return standing
		? {
				left: cell.left - origin.left,
				top: (onAfter ? cell.bottom + 1 : cell.top - 1) - origin.top - 1,
				width: cell.width,
				height: 2,
			}
		: {
				left: (onAfter ? cell.right + 1 : cell.left - 1) - origin.left - 1,
				top: cell.top - origin.top,
				width: 2,
				height: cell.height,
			}
})

const isStanding = (bar: Bar): boolean => bar.columns === 1

function targetAt(x: number, y: number, slot: Slot): Target {
	if (dots.value !== null && distanceFrom(x, y, dots.value.getBoundingClientRect()) === 0) return { kind: 'stow' }
	for (const bar of [...props.arrangement.bars].reverse()) {
		const element = barElement(bar.id)
		if (element === null) continue
		if (distanceFrom(x, y, element.getBoundingClientRect()) >= NEAR_BAR) continue
		const boxes = cellsOf(bar.id).map(cell => cell.getBoundingClientRect())
		const drop = dropAmong(boxes, x, y, isStanding(bar))
		// A place does not go into itself.
		if (drop.kind === 'into' && toolsOf(bar.slots[drop.index]!).some(name => toolsOf(slot).includes(name))) {
			return { kind: 'bar', bar: bar.id, drop: { kind: 'at', index: drop.index } }
		}
		return { kind: 'bar', bar: bar.id, drop }
	}
	return { kind: 'off' }
}

/** Follows the pointer from a press, as a drag once it has gone far enough. */
function follow(
	event: PointerEvent,
	handlers: {
		readonly begin: () => void
		readonly move: (move: PointerEvent) => void
		readonly end: (done: boolean) => void
		readonly press?: () => void
	}
): void {
	if (event.button !== 0) return
	const { clientX, clientY, pointerId } = event
	let moved = false
	const onMove = (move: PointerEvent) => {
		if (move.pointerId !== pointerId) return
		if (!moved) {
			if (Math.hypot(move.clientX - clientX, move.clientY - clientY) < DRAG_FROM) return
			moved = true
			stage().setPointerCapture(pointerId)
			handlers.begin()
		}
		handlers.move(move)
	}
	const finish = (done: boolean) => {
		window.removeEventListener('pointermove', onMove)
		window.removeEventListener('pointerup', onUp)
		window.removeEventListener('pointercancel', onCancel)
		if (!moved) return
		handlers.end(done)
		// A click comes after this, on what was only being held.
		const swallow = (click: Event) => click.stopImmediatePropagation()
		window.addEventListener('click', swallow, { capture: true, once: true })
		setTimeout(() => window.removeEventListener('click', swallow, { capture: true }))
	}
	const onUp = (up: PointerEvent) => {
		if (up.pointerId === pointerId) finish(true)
	}
	const onCancel = (cancel: PointerEvent) => {
		if (cancel.pointerId === pointerId) finish(false)
	}
	window.addEventListener('pointermove', onMove)
	window.addEventListener('pointerup', onUp)
	window.addEventListener('pointercancel', onCancel)
}

function pressSlot(event: PointerEvent, slot: Slot): void {
	follow(event, {
		begin() {
			stowedOpen.value = false
			flyout.value = null
		},
		move({ clientX: x, clientY: y }) {
			heldTool.value = { slot, x, y, target: targetAt(x, y, slot) }
		},
		end(done) {
			const held = heldTool.value
			heldTool.value = null
			if (done && held !== null) letGo(held)
		},
	})
}

function letGo({ slot, x, y, target }: NonNullable<typeof heldTool.value>): void {
	const { arrangement } = props
	if (target.kind === 'stow') {
		emit('update:arrangement', stowedAway(arrangement, slot))
	} else if (target.kind === 'bar') {
		const bar = arrangement.bars.find(({ id }) => id === target.bar)!
		emit(
			'update:arrangement',
			target.drop.kind === 'at'
				? placed(arrangement, slot, bar.id, target.drop.index)
				: foldered(arrangement, slot, toolsOf(bar.slots[target.drop.index]!)[0]!)
		)
	} else {
		const origin = stage().getBoundingClientRect()
		const place = barPlaceAt(
			x - origin.left,
			y - origin.top,
			{ width: PITCH + GRIP_WIDTH, height: PITCH + 12 },
			{ width: origin.width, height: origin.height }
		)
		emit('update:arrangement', separated(arrangement, slot, place))
	}
}

/** A bar's handle and the padding around it, more or less, for what is about to be one. */
const GRIP_WIDTH = 28

function pressBar(event: PointerEvent, bar: Bar): void {
	const element = event.currentTarget as HTMLElement
	const box = element.closest('[data-bar]')!.getBoundingClientRect()
	const grab = [event.clientX - (box.left + box.right) / 2, event.clientY - (box.top + box.bottom) / 2] as const
	follow(event, {
		begin() {
			stowedOpen.value = false
			flyout.value = null
			movingBar.value = { id: bar.id, into: null }
		},
		move({ clientX, clientY }) {
			const origin = stage().getBoundingClientRect()
			const own = barElement(bar.id)!.getBoundingClientRect()
			const place = barPlaceAt(
				clientX - grab[0] - origin.left,
				clientY - grab[1] - origin.top,
				{ width: own.width, height: own.height },
				{ width: origin.width, height: origin.height }
			)
			emit('update:arrangement', movedBar(props.arrangement, bar.id, place))
			const into =
				bar.id === MAIN_BAR
					? undefined
					: props.arrangement.bars.find(other => {
							if (other.id === bar.id) return false
							const box = barElement(other.id)?.getBoundingClientRect()
							return box !== undefined && distanceFrom(clientX, clientY, box) < NEAR_BAR
						})
			movingBar.value = { id: bar.id, into: into?.id ?? null }
		},
		end(done) {
			const moving = movingBar.value
			movingBar.value = null
			if (!done || moving?.into == null) return
			const into = props.arrangement.bars.find(({ id }) => id === moving.into)!
			emit('update:arrangement', mergedBars(props.arrangement, bar.id, into.id, into.slots.length))
		},
	})
}

/** Changes how many tools go across, by how far the corner is dragged. */
function pressShape(event: PointerEvent, bar: Bar): void {
	event.stopPropagation()
	const from = bar.columns ?? bar.slots.length
	// It grows on both sides if nothing holds it at one.
	const k = bar.wall === 'left' ? 1 : bar.wall === 'right' ? -1 : 2
	const { clientX } = event
	follow(event, {
		begin() {},
		move(move) {
			const columns = from + Math.round(((move.clientX - clientX) * k) / PITCH)
			emit('update:arrangement', withColumns(props.arrangement, bar.id, columns))
		},
		end() {},
	})
}

/** A tool goes into use, and the folder it is in opens, if it is already what is in use. */
function clickSlot(event: MouseEvent, slot: Slot): void {
	const shown = shownOf(slot, props.active)
	if (typeof slot !== 'string' && shown === props.active) {
		openFlyout(event.currentTarget as HTMLElement, slot)
		return
	}
	emit('select', shown)
}

function openFlyout(from: HTMLElement, slot: Slot): void {
	const open = flyout.value
	flyout.value = open?.from === from ? null : { tools: toolsOf(slot), from }
}

function pick(name: string): void {
	emit('select', name)
	emit('update:arrangement', shownInFolder(props.arrangement, name))
	flyout.value = null
}

function clickStowed(name: string): void {
	emit('select', name)
	stowedOpen.value = false
}

useEventListener(window, 'blur', () => (flyout.value = null))

const tooltipOf = ({ tooltip: { content, shortcut } }: Tool) => ({
	content,
	...(shortcut === undefined ? {} : { shortcut: [...shortcut] }),
})

const barStyle = (bar: Bar) => ({
	left: bar.wall === 'right' ? 'auto' : `${bar.x * 100}%`,
	right: bar.wall === 'right' ? '0' : 'auto',
	top: bar.wall === 'bottom' ? 'auto' : `${bar.y * 100}%`,
	bottom: bar.wall === 'bottom' ? '0' : 'auto',
	translate: `${bar.wall === 'left' || bar.wall === 'right' ? '0' : '-50%'} ${
		bar.wall === 'top' || bar.wall === 'bottom' ? '0' : '-50%'
	}`,
	'--columns': bar.columns ?? bar.slots.length,
})

const flyoutPlacement = computed(() => {
	const wall = props.arrangement.bars.find(bar =>
		flyout.value !== null && bar.slots.some(slot => toolsOf(slot).includes(flyout.value!.tools[0]!))
	)?.wall
	return wall === 'left' ? 'right' : wall === 'right' ? 'left' : wall === 'top' ? 'bottom' : 'top'
})

const ghost = computed(() => {
	const held = heldTool.value
	if (held === null) return null
	return {
		icon: byName.value.get(shownOf(held.slot, props.active))?.icon,
		off: held.target.kind === 'off',
		style: { left: `${held.x - 16}px`, top: `${held.y - 16}px` },
	}
})

const isHeld = (slot: Slot): boolean =>
	heldTool.value !== null && toolsOf(heldTool.value.slot).join() === toolsOf(slot).join()

const isInto = (bar: Bar, index: number): boolean => {
	const target = heldTool.value?.target
	return target?.kind === 'bar' && target.bar === bar.id && target.drop.kind === 'into' && target.drop.index === index
}
</script>

<template>
	<div ref="$root" class="anchor" />
	<div
		v-for="bar in arrangement.bars"
		:key="bar.id"
		class="tools"
		:class="[
			bar.wall ? `on-${bar.wall}` : 'floating',
			{
				standing: bar.columns === 1,
				moving: movingBar?.id === bar.id,
				'taking-in': movingBar?.into === bar.id,
			},
		]"
		:style="barStyle(bar)"
		:data-bar="bar.id"
		data-selects-rows
	>
		<button
			v-tooltip="{ content: 'Move Toolbar' }"
			class="grip"
			aria-label="Move Toolbar"
			@pointerdown="pressBar($event, bar)"
		>
			<Icon icon="ph:dots-six-vertical-bold" />
		</button>
		<div class="sortable">
			<button
				v-for="(slot, index) in bar.slots"
				:key="toolsOf(slot).join()"
				v-tooltip="tooltipOf(byName.get(shownOf(slot, active))!)"
				class="tool"
				:class="{
					active: toolsOf(slot).includes(active),
					folder: typeof slot !== 'string',
					held: isHeld(slot),
					into: isInto(bar, index),
				}"
				data-slot
				:aria-label="byName.get(shownOf(slot, active))!.tooltip.content"
				:aria-pressed="toolsOf(slot).includes(active)"
				@pointerdown="pressSlot($event, slot)"
				@click="clickSlot($event, slot)"
				@contextmenu.prevent="typeof slot !== 'string' && openFlyout($event.currentTarget as HTMLElement, slot)"
			>
				<Icon :icon="byName.get(shownOf(slot, active))!.icon" />
			</button>
		</div>
		<template v-if="bar.id === MAIN_BAR">
			<button
				:ref="setDots"
				v-tooltip="{ content: 'More Tools' }"
				class="tool"
				:class="{
					active: arrangement.stowed.includes(active),
					ready: heldTool?.target.kind === 'stow',
				}"
				aria-label="More Tools"
				:aria-expanded="stowedOpen"
				@click="stowedOpen = !stowedOpen"
			>
				<Icon
					:icon="
						arrangement.stowed.includes(active)
							? byName.get(active)!.icon
							: 'ph:dots-three-vertical-bold'
					"
				/>
			</button>
			<slot />
			<Popover
				v-if="dots"
				v-model:open="stowedOpen"
				:reference="dots"
				placement="top"
				:offset="{ mainAxis: 12 }"
			>
				<div class="stowed">
					<button
						v-for="name in arrangement.stowed"
						:key="name"
						v-tooltip="tooltipOf(byName.get(name)!)"
						class="tool"
						:class="{ active: active === name, held: isHeld(name) }"
						:aria-label="byName.get(name)!.tooltip.content"
						:aria-pressed="active === name"
						@pointerdown="pressSlot($event, name)"
						@click="clickStowed(name)"
					>
						<Icon :icon="byName.get(name)!.icon" />
					</button>
					<p v-if="arrangement.stowed.length === 0" class="hint">Drop a tool here to keep it out of the way.</p>
				</div>
			</Popover>
		</template>
		<button
			v-if="bar.slots.length > 1"
			v-tooltip="{ content: 'Change Shape' }"
			class="shape"
			aria-label="Change Shape"
			@pointerdown="pressShape($event, bar)"
		/>
	</div>
	<Popover
		v-if="flyout"
		:open="true"
		:reference="flyout.from"
		:placement="flyoutPlacement"
		:offset="{ mainAxis: 12 }"
		@update:open="$event || (flyout = null)"
	>
		<div class="stowed" :style="{ gridTemplateColumns: `repeat(${Math.min(4, flyout.tools.length)}, 32px)` }">
			<button
				v-for="name in flyout.tools"
				:key="name"
				v-tooltip="tooltipOf(byName.get(name)!)"
				class="tool"
				:class="{ active: active === name, held: isHeld(name) }"
				:aria-label="byName.get(name)!.tooltip.content"
				:aria-pressed="active === name"
				@pointerdown="pressSlot($event, name)"
				@click="pick(name)"
			>
				<Icon :icon="byName.get(name)!.icon" />
			</button>
		</div>
	</Popover>
	<div v-if="caret" class="caret" :style="{ left: `${caret.left}px`, top: `${caret.top}px`, width: `${caret.width}px`, height: `${caret.height}px` }" />
	<div v-if="ghost" class="tool ghost" :class="{ off: ghost.off }" :style="ghost.style">
		<Icon v-if="ghost.icon" :icon="ghost.icon" />
	</div>
</template>

<style scoped>
.anchor {
	display: none;
}
.tools {
	--padding: 6px;
	--radius: 6px;
	/* Around the same centers as the corners of the buttons in it. */
	--corner: calc(var(--radius) + var(--padding) + 1px);
	position: absolute;
	z-index: 40;
	display: flex;
	gap: 2px;
	align-items: flex-start;
	padding: var(--padding);
	border: 1px solid transparent;
	border-radius: var(--corner);
	isolation: isolate;
	touch-action: none;
	user-select: none;
}
.tools.standing {
	flex-direction: column;
}
/* Behind what is in it, as a blur only sees through to the canvas from outside of anything
else that blurs. */
.tools::before {
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
/* On a wall, it goes straight into it. */
.on-bottom {
	border-bottom-right-radius: 0;
	border-bottom-left-radius: 0;
}
.on-bottom::before {
	border-bottom: none;
}
.on-top {
	border-top-left-radius: 0;
	border-top-right-radius: 0;
}
.on-top::before {
	border-top: none;
}
.on-left {
	border-top-left-radius: 0;
	border-bottom-left-radius: 0;
}
.on-left::before {
	border-left: none;
}
.on-right {
	border-top-right-radius: 0;
	border-bottom-right-radius: 0;
}
.on-right::before {
	border-right: none;
}
/* While it is moved, it says so of the wall it would be on, as a panel does. */
.moving {
	z-index: 61;
}
.moving.on-bottom::before {
	border-bottom: 3px solid var(--tq-color-accent);
}
.moving.on-top::before {
	border-top: 3px solid var(--tq-color-accent);
}
.moving.on-left::before {
	border-left: 3px solid var(--tq-color-accent);
}
.moving.on-right::before {
	border-right: 3px solid var(--tq-color-accent);
}
.taking-in::before {
	outline: 2px solid var(--tq-color-accent);
}
.grip {
	display: grid;
	flex: none;
	place-items: center;
	width: 16px;
	height: 32px;
	padding: 0;
	border: none;
	background: none;
	color: var(--tq-color-text-mute);
	font-size: 12px;
	cursor: grab;
}
.standing .grip {
	width: 32px;
	height: 16px;
	rotate: 90deg;
}
.moving .grip {
	cursor: grabbing;
}
.sortable {
	display: grid;
	grid-template-columns: repeat(var(--columns), 32px);
	gap: 2px;
}
.tool,
:slotted(.tool) {
	--radius: 6px;
	position: relative;
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
/* That there is more in it, in the corner, as a tool group has it. */
.tool.folder::after {
	content: '';
	position: absolute;
	right: 2px;
	bottom: 2px;
	border-width: 0 0 5px 5px;
	border-style: solid;
	border-color: transparent transparent currentColor;
}
.tool.ready,
.tool.into {
	outline: 2px solid var(--tq-color-accent);
	outline-offset: -2px;
}
.tool.held {
	opacity: 0.25;
}
.standing :slotted(.tools-divider) {
	width: 20px;
	height: 1px;
	margin-block: 4px;
	margin-inline: 6px;
}
.shape {
	position: absolute;
	top: -1px;
	right: -1px;
	width: 12px;
	height: 12px;
	padding: 0;
	border: none;
	border-radius: 0 var(--corner) 0 0;
	background: none;
	cursor: ew-resize;
	opacity: 0;
}
.on-right .shape {
	right: auto;
	left: -1px;
	border-radius: var(--corner) 0 0 0;
}
.tools:hover .shape {
	opacity: 1;
	background: linear-gradient(to bottom left, var(--tq-color-accent) 50%, transparent 50%);
}
.on-right:hover .shape {
	background: linear-gradient(to bottom right, var(--tq-color-accent) 50%, transparent 50%);
}
.caret {
	position: absolute;
	z-index: 62;
	background: var(--tq-color-accent);
	pointer-events: none;
}
.ghost {
	position: fixed;
	z-index: 63;
	border-radius: 6px;
	background: var(--tq-color-surface);
	box-shadow: var(--tq-shadow-popup);
	pointer-events: none;
	cursor: grabbing;
}
.ghost.off {
	outline: 1px solid var(--tq-color-border);
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
