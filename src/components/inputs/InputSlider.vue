<template>
	<div class="InputSlider" :class="{tweaking}">
		<div ref="dragEl" class="InputSlider__drag" />
		<input
			ref="inputEl"
			class="InputSlider__input"
			type="text"
			:value="displayValue"
			@blur="onBlur"
			@keydown="onKeydown"
		/>
		<div class="InputSlider__slider" :style="sliderStyle" />
	</div>
</template>

<script lang="ts" setup>
import {useKeyModifier} from '@vueuse/core'
import {computed, Ref, ref, toRef} from 'vue'

import {useDraggable} from '../use'
import useNumberInput from './use-number-input'

const props = defineProps<{
	value: number
	min: number
	max: number
	step?: number
	validator?: (v: number) => number | null
}>()

const emit = defineEmits<{
	input: [value: number | string]
	'end-tweak': []
}>()

// Element references
const dragEl: Ref<null | HTMLElement> = ref(null)
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
		if (!dragEl.value) return

		let inc = ((props.max - props.min) * deltaX) / dragEl.value.clientWidth

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

const sliderStyle = computed(() => {
	const t = (props.value - props.min) / (props.max - props.min)
	const borderRadius = t < 1 ? 0 : '2px'
	return {
		width: `${t * 100}%`,
		borderTopRightRadius: borderRadius,
		borderButtonRightRadius: borderRadius,
	}
})
</script>

<style lang="stylus">
@import './use-number-input.styl'

.InputSlider
	width 12.6rem
	use-number()
	overflow hidden

	&__slider
		position absolute
		top 0
		left 0
		z-index -1
		height 100%
		border-right 3px solid transparent
		input-transition(border-right-color)

		&:after
			position absolute
			top 0
			left 0
			width 100%
			height 100%
			background var(--bwbase)
			content ''
			opacity 0.07
			input-transition(opacity)

		~/.tweaking &
			border-right-color var(--hover)

			&:after
				opacity 0.1
</style>
