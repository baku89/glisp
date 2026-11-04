<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { nextTick, useTemplateRef, watch } from 'vue'

import DimensionField from './DimensionField.vue'
import { isForElsewhere } from './dimensionKeys'
import type { Vec } from './graphics'
import type { Dimension, PlacedDimension } from './scene'

const props = defineProps<{
	dimensions: readonly PlacedDimension[]
	/** How much room there is to be in. */
	room: Vec
	/** They are there to type in, rather than only to read as they go. */
	editing: boolean
	/** Which of them to go to first. */
	first: number
	/** What comes of typing something other than a number, and what is wrong with it. */
	expression: (dimension: Dimension, text: string) => string | null
}>()

const emit = defineEmits<{
	set: [dimension: Dimension, value: number]
	/** That is that, keeping what was typed, or going back to before it. */
	done: [keep: boolean]
}>()

const $root = useTemplateRef<HTMLElement>('$root')

const inputs = (): HTMLInputElement[] => [...($root.value?.querySelectorAll('input') ?? [])]

watch(
	() => props.editing,
	async editing => {
		if (!editing) return
		await nextTick()
		inputs()[props.first]?.focus()
	},
	{ immediate: true }
)

/** Round and round among them, wherever on the shape each one is. */
function nextInput(event: KeyboardEvent): void {
	const all = inputs()
	const here = all.indexOf(event.target as HTMLInputElement)
	const by = event.shiftKey ? -1 : 1
	all[(here + by + all.length) % all.length]?.focus()
}

/** Before an input hears of it, or it would be typed. */
function onKeydownFirst(event: KeyboardEvent): void {
	if (!isForElsewhere(event, event.target as HTMLInputElement)) return
	event.preventDefault()
	event.stopPropagation()
	emit('done', true)
	// Shortcuts had already passed it over as being typed, so it goes round again.
	window.document.body.dispatchEvent(new KeyboardEvent('keydown', event))
}

function onKeydown(event: KeyboardEvent): void {
	if (!['Tab', 'Enter', 'Escape'].includes(event.key)) return
	event.preventDefault()
	if (event.key === 'Tab') {
		// Tab lets go of the selected inputs once it gets to the window, as it has to before
		// focus moves, or going back with Shift would select all that are on the way.
		setTimeout(() => nextInput(event))
		return
	}
	event.stopPropagation()
	emit('done', event.key === 'Enter')
}

/**
 * A press on one of them lets go of the one that had focus before it has any itself, so
 * it would look like going elsewhere.
 */
let pressedHere = false
useEventListener(window, 'pointerup', () => (pressedHere = false), { capture: true })
useEventListener(window, 'pointercancel', () => (pressedHere = false), { capture: true })

// Having been dragged by, one has no focus to let go of when something else is pressed.
useEventListener(
	window,
	'pointerdown',
	(event: PointerEvent) => {
		if (props.editing && !$root.value?.contains(event.target as Node)) emit('done', true)
	},
	{ capture: true }
)

/** Being let go of is the same as being done with, unless it is only another window. */
function onFocusout(event: FocusEvent): void {
	if (pressedHere || !props.editing || !window.document.hasFocus()) return
	const to = event.relatedTarget as Node | null
	if (to === null || !$root.value?.contains(to)) emit('done', true)
}

const set = (dimension: Dimension, value: number): void => {
	if (props.editing && value !== dimension.value) emit('set', dimension, value)
}
</script>

<template>
	<div ref="$root" class="Dimensions" @keydown.capture="onKeydownFirst" @keydown="onKeydown" @focusout="onFocusout" @pointerdown.capture="pressedHere = true">
		<DimensionField
			v-for="placed in dimensions"
			:key="`${placed.dimensions[0]!.route}/${placed.dimensions[0]!.index}`"
			:placed="placed"
			:room="room"
			:editing="editing"
			:expression="expression"
			@set="set"
		/>
	</div>
</template>

<style scoped>
/* All over the canvas, for each to go where it goes, and over the panels as well. */
.Dimensions {
	position: absolute;
	inset: 0;
	z-index: 100;
	pointer-events: none;
}
</style>
