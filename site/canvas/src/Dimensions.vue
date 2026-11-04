<script setup lang="ts">
import { useElementSize } from '@vueuse/core'
import { InputNumber } from 'tweeq/InputNumber'
import { computed, nextTick, useTemplateRef, watch } from 'vue'

import type { Vec } from './graphics'
import type { Dimension } from './scene'

const props = defineProps<{
	dimensions: readonly Dimension[]
	/** Where the pointer is, on screen, to be beside. */
	at: Vec
	/** How much room there is to be in. */
	room: readonly [number, number]
	/** They are there to type in, rather than only to read as they go. */
	editing: boolean
	/** Which of them to go to first. */
	first: number
}>()

const emit = defineEmits<{
	set: [dimension: Dimension, value: number]
	/** That is that, keeping what was typed, or going back to before it. */
	done: [keep: boolean]
}>()

const OFFSET = 14
const MARGIN = 8

const $root = useTemplateRef<HTMLElement>('$root')
const { width, height } = useElementSize($root)

const place = computed(() => ({
	left: `${Math.max(MARGIN, Math.min(props.at[0] + OFFSET, props.room[0] - width.value - MARGIN))}px`,
	top: `${Math.max(MARGIN, Math.min(props.at[1] + OFFSET, props.room[1] - height.value - MARGIN))}px`,
}))

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

/** Round and round among them, as this is all that a press of Tab is about here. */
function nextInput(event: KeyboardEvent): void {
	const all = inputs()
	const here = all.indexOf(event.target as HTMLInputElement)
	const by = event.shiftKey ? -1 : 1
	all[(here + by + all.length) % all.length]?.focus()
}

function onKeydown(event: KeyboardEvent): void {
	if (!['Tab', 'Enter', 'Escape'].includes(event.key)) return
	event.preventDefault()
	event.stopPropagation()
	if (event.key === 'Tab') nextInput(event)
	else emit('done', event.key === 'Enter')
}

/** Being let go of is the same as being done with, unless it is only another window. */
function onFocusout(event: FocusEvent): void {
	if (!props.editing || !window.document.hasFocus()) return
	const to = event.relatedTarget as Node | null
	if (to === null || !$root.value?.contains(to)) emit('done', true)
}

const set = (dimension: Dimension, value: number): void => {
	if (props.editing && value !== dimension.value) emit('set', dimension, value)
}
</script>

<template>
	<div
		ref="$root"
		class="Dimensions"
		:class="{ editing }"
		:style="place"
		@keydown="onKeydown"
		@focusout="onFocusout"
	>
		<template v-for="dimension in dimensions" :key="`${dimension.route}/${dimension.index}`">
			<label class="label">{{ dimension.label }}</label>
			<InputNumber
				v-bind="dimension.options"
				:modelValue="dimension.value"
				@update:modelValue="set(dimension, $event)"
			/>
		</template>
	</div>
</template>

<style scoped>
.Dimensions {
	position: absolute;
	display: grid;
	grid-template-columns: auto 72px;
	gap: 2px 6px;
	align-items: center;
	padding: 4px 6px;
	border: 1px solid var(--tq-color-border);
	border-radius: var(--tq-radius-input);
	background: var(--tq-color-background);
	font-size: 11px;
	pointer-events: none;
}
.Dimensions.editing {
	pointer-events: auto;
}
.label {
	color: var(--tq-color-text-mute);
	white-space: nowrap;
}
</style>
