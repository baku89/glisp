<template>
	<div class="InputNumber" :class="{tweaking}">
		<div ref="dragEl" class="InputNumber__drag" />
		<input
			ref="inputEl"
			class="InputNumber__input"
			type="text"
			:value="displayValue"
			@blur="onBlur"
			@keydown="onKeydown"
		/>
	</div>
</template>

<script lang="ts" setup>
import {useKeyModifier} from '@vueuse/core'
import {Ref, ref, toRef} from 'vue'

import {useDraggable} from '../use'
import useNumberInput from './use-number-input'

const props = defineProps<{
	value: number
	step?: number
	validator?: (v: number) => number | null
}>()

const emit = defineEmits<{
	input: [value: number]
	'end-tweak': []
}>()

// Element references
const dragEl = ref(null)
const inputEl: Ref<null | HTMLInputElement> = ref(null)

const alt = useKeyModifier('Alt')
const shift = useKeyModifier('Shift')

// Drag Events
let startValue = 0
const drag = useDraggable(dragEl, {
	onClick() {
		if (inputEl.value) {
			inputEl.value.focus()
			inputEl.value.select()
		}
	},
	onDragStart() {
		startValue = props.value
	},
	onDrag({deltaX}) {
		let inc = deltaX / 5

		if (shift.value) {
			inc *= 10
		}
		if (alt.value) {
			inc /= 10
		}

		startValue += inc

		update(startValue)
	},
	onDragEnd() {
		emit('end-tweak')
	},
})

const tweaking = toRef(drag, 'isDragging')

const {displayValue, onBlur, onKeydown, update} = useNumberInput(
	toRef(props, 'value'),
	tweaking,
	emit
)
</script>

<style lang="stylus">
@import './use-number-input.styl'

.InputNumber
	width 6rem
	use-number()
</style>
