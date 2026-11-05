<script setup lang="ts">
import { Icon } from 'tweeq/Icon'
import { vTooltip } from 'tweeq/Tooltip'
import { nextTick, ref, useTemplateRef, watch } from 'vue'

import type { FileTab } from './fileTabs'

const props = defineProps<{
	tabs: readonly FileTab[]
	active: string | null
}>()

const emit = defineEmits<{
	select: [id: string]
	close: [id: string]
	rename: [id: string, name: string]
	move: [id: string, to: number]
	add: []
}>()

/** Only what is in this browser is called anything here. A file's name is its own. */
const renaming = ref<string | null>(null)
const $name = ref<HTMLInputElement[]>([])

async function startRenaming(tab: FileTab): Promise<void> {
	if (tab.handle !== null) return
	renaming.value = tab.id
	await nextTick()
	$name.value[0]?.select()
}

function finishRenaming(id: string, name: string): void {
	if (renaming.value !== id) return
	renaming.value = null
	emit('rename', id, name)
}

// What is being edited can always be seen, however many there are.
const $tabs = useTemplateRef<HTMLElement>('$tabs')
watch(
	() => props.active,
	async () => {
		await nextTick()
		$tabs.value?.querySelector('.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
	}
)

const DRAG_AFTER_PX = 4
const SETTLE_MS = 120

/** Where a tab was taken from, in the strip's own coordinates, which do not change as it scrolls. */
interface Held {
	readonly id: string
	readonly el: HTMLElement
	readonly pointerId: number
	readonly fromX: number
	readonly fromLeft: number
}

let held: Held | null = null
const dragged = ref<string | null>(null)

const xAlong = (event: PointerEvent): number => event.clientX + ($tabs.value?.scrollLeft ?? 0)

function take(event: PointerEvent, tab: FileTab): void {
	if (event.button !== 0 || (event.target as Element).closest('button, input')) return
	const el = event.currentTarget as HTMLElement
	el.setPointerCapture(event.pointerId)
	held = { id: tab.id, el, pointerId: event.pointerId, fromX: xAlong(event), fromLeft: el.offsetLeft }
}

/** It follows the pointer along the strip, and the others make way once its middle passes theirs. */
async function drag(event: PointerEvent): Promise<void> {
	if (held?.pointerId !== event.pointerId || !$tabs.value) return
	const { id, el, fromX, fromLeft } = held
	const by = xAlong(event) - fromX
	if (dragged.value === null && Math.abs(by) < DRAG_AFTER_PX) return
	dragged.value = id

	const all = [...$tabs.value.querySelectorAll<HTMLElement>('.tab')]
	const others = all.filter(other => other !== el)
	const last = all[all.length - 1]!
	const left = Math.max(all[0]!.offsetLeft, Math.min(fromLeft + by, last.offsetLeft + last.offsetWidth - el.offsetWidth))
	// From where the pointer has taken it, as held to the strip it could never pass the last.
	const middle = fromLeft + by + el.offsetWidth / 2
	const to = others.filter(other => other.offsetLeft + other.offsetWidth / 2 < middle).length

	if (to !== all.indexOf(el)) {
		const before = others.map(other => other.offsetLeft)
		emit('move', id, to)
		await nextTick()
		others.forEach((other, i) => {
			const from = before[i]! - other.offsetLeft
			if (from === 0) return
			other.animate([{ transform: `translateX(${from}px)` }, { transform: 'none' }], {
				duration: SETTLE_MS,
				easing: 'ease-out',
			})
		})
	}
	el.style.transform = `translateX(${left - el.offsetLeft}px)`
	el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

function drop(): void {
	if (!held) return
	held.el.style.transform = ''
	held = null
	dragged.value = null
}

const whereItIs = (tab: FileTab): string =>
	tab.handle === null ? 'Only in this browser' : `${tab.handle.name}${tab.dirty ? ', not saved' : ''}`
</script>

<template>
	<div ref="$tabs" class="FileTabs" role="tablist">
		<div
			v-for="tab in tabs"
			:key="tab.id"
			class="tab"
			:class="{ active: tab.id === active, dragged: tab.id === dragged }"
			role="tab"
			:aria-selected="tab.id === active"
			@pointerdown="take($event, tab)"
			@pointermove="drag"
			@pointerup="drop"
			@pointercancel="drop"
			@click="emit('select', tab.id)"
			@auxclick.middle="emit('close', tab.id)"
			@dblclick="startRenaming(tab)"
		>
			<span v-tooltip="whereItIs(tab)" class="where">
				<Icon :icon="tab.handle === null ? 'ph:browser' : 'ph:hard-drive'" />
			</span>
			<input
				v-if="renaming === tab.id"
				ref="$name"
				class="name editing"
				:value="tab.name"
				@click.stop
				@dblclick.stop
				@blur="finishRenaming(tab.id, ($event.target as HTMLInputElement).value)"
				@keydown.stop.enter="($event.target as HTMLInputElement).blur()"
				@keydown.stop.esc="renaming = null"
			/>
			<span v-else class="name">{{ tab.name }}</span>
			<button
				class="close"
				:class="{ dirty: tab.dirty }"
				tabindex="-1"
				aria-label="Close"
				@click.stop="emit('close', tab.id)"
				@dblclick.stop
			>
				<Icon icon="ph:x" />
			</button>
		</div>
		<button v-tooltip="'New'" class="add" tabindex="-1" aria-label="New" @click="emit('add')">
			<Icon icon="ph:plus" />
		</button>
	</div>
</template>

<style scoped>
/* Twice over, past what the title bar says of whatever is in it: this takes what room there is,
from the top of the bar to the bottom, and what has no tab on it still moves the window. */
.FileTabs.FileTabs {
	--inset: calc((var(--titlebar-area-height) - var(--tq-input-height)) / 2);
	flex: 1 1 0;
	min-width: 0;
	display: flex;
	align-items: stretch;
	height: var(--titlebar-area-height);
	margin-block: calc(-1 * var(--inset));
	overflow-x: auto;
	scrollbar-width: none;
	-webkit-app-region: drag;
	app-region: drag;
}

.tab,
.add {
	-webkit-app-region: no-drag;
	app-region: no-drag;
}

/* What it is, by the line under it, and what is not it, by being quieter. The ink is the title
bar's, which goes by what the background is, so that it can be seen on any. */
.tab {
	position: relative;
	/* As wide as its name, so that a name is only cut short for being long, never for how many
	there are: those go along the strip, which scrolls to what is being edited. */
	flex: none;
	max-width: 16em;
	display: flex;
	align-items: center;
	gap: 5px;
	padding-inline: 9px 5px;
	cursor: default;
}
.tab > * {
	opacity: 0.55;
}
.tab:hover > *,
.tab.active > * {
	opacity: 1;
}
.tab.active {
	box-shadow: inset 0 -2px 0 currentColor;
}

/* Above the others it passes over, which show through it only as a blur. */
.tab.dragged {
	z-index: 1;
	background: color-mix(in srgb, currentColor 12%, transparent);
	backdrop-filter: blur(12px);
}

/* Between two that are not it, and not on either side of the one that is. */
.tab + .tab::before {
	content: '';
	position: absolute;
	left: 0;
	top: 30%;
	bottom: 30%;
	width: 1px;
	background: currentColor;
	opacity: 0.15;
}
.tab.active::before,
.tab.active + .tab::before {
	display: none;
}

.where {
	flex: none;
	display: flex;
}
.tab > .where {
	opacity: 0.4;
}
.tab:hover > .where,
.tab.active > .where {
	opacity: 0.7;
}

.name {
	flex: 0 1 auto;
	min-width: 0;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}
.name.editing {
	field-sizing: content;
	min-width: 1em;
	padding: 0;
	border: none;
	outline: none;
	background: none;
	color: inherit;
	font: inherit;
	user-select: text;
}

.close,
.add {
	position: relative;
	flex: none;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 0;
	border: none;
	background: none;
	color: inherit;
}
.close {
	width: 16px;
	height: 16px;
	border-radius: 50%;
}
.close:hover {
	background: color-mix(in srgb, currentColor 15%, transparent);
}
.add {
	width: 28px;
	opacity: 0.55;
}
.add:hover {
	opacity: 1;
}

/* It is there only for the tab that is under the pointer, or as a dot for what is not saved. */
.close :deep(*) {
	visibility: hidden;
	width: 12px;
	height: 12px;
}
.tab:hover .close :deep(*) {
	visibility: visible;
}
.tab > .close.dirty {
	opacity: 1;
}
.close.dirty::before {
	content: '';
	position: absolute;
	width: 6px;
	height: 6px;
	border-radius: 50%;
	background: currentColor;
}
.tab:hover .close.dirty::before {
	display: none;
}
</style>
