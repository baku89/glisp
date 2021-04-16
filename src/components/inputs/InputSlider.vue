<template>
	<div class="InputSlider" :class="{tweaking}" ref="dragEl" v-bind="$attrs">
		<input
			class="InputSlider__input"
			type="text"
			:value="displayValue"
			@blur="onBlur"
			@keydown="onKeydown"
			ref="inputEl"
		/>
		<div class="InputSlider__slider-wrapper">
			<div class="InputSlider__slider" :style="sliderStyle" />
		</div>
	</div>
	<teleport to="body">
		<div
			v-if="tweaking"
			class="InputNumber__overlay-label"
			:style="{
				top: absolutePos[1] + 'px',
				left: absolutePos[0] + 'px',
				opacity: showTweakLabel ? 1 : 0,
			}"
		>
			{{ overlayLabel }}
		</div>
	</teleport>
</template>

<script lang="ts">
import _, {clamp} from 'lodash'
import {computed, defineComponent, ref, toRef} from 'vue'

import useDraggable from '../use/use-draggable'
import useKeyboardState from '../use/use-keyboard-state'
import useNumberInput from './use-number-input'

export default defineComponent({
	name: 'InputSlider',
	props: {
		modelValue: {
			type: Number,
			required: true,
		},
		min: {
			type: Number,
			default: 0,
		},
		max: {
			type: Number,
			default: 1,
		},
		clamped: {
			type: Boolean,
			default: false,
		},
	},
	setup(props, context) {
		// Element references
		const dragEl = ref<null | HTMLElement>(null)
		const inputEl = ref<null | HTMLInputElement>(null)

		const {shift, alt} = useKeyboardState()

		const tweakMode = ref<'relative' | 'absolute'>('relative')

		// Drag Events
		let startValue = ref(0)
		let alreadyEmitted = false

		const {isDragging: tweaking, absolutePos} = useDraggable(dragEl, {
			onClick() {
				if (inputEl.value) {
					inputEl.value.focus()
					inputEl.value.select()
				}
			},
			onDragStart({left, right, pos}) {
				const cursorT = (pos[0] - left) / (right - left)
				const valueT = (props.modelValue - props.min) / (props.max - props.min)

				tweakMode.value =
					Math.abs(cursorT - valueT) < 0.1 ? 'relative' : 'absolute'

				if (tweakMode.value === 'absolute') {
					const newValue = props.min + cursorT * (props.max - props.min)
					context.emit('update:modelValue', newValue)

					alreadyEmitted = true
					startValue.value = newValue
				} else {
					startValue.value = props.modelValue
				}
			},
			onDrag({delta, right, left}) {
				if (alreadyEmitted) {
					alreadyEmitted = false
					return
				}

				let inc = ((props.max - props.min) * delta[0]) / (right - left)

				if (shift.value) {
					inc *= 10
				}
				if (alt.value) {
					inc /= 10
				}

				let newValue = props.modelValue + inc

				if (props.clamped) {
					newValue = clamp(newValue, props.min, props.max)
				}
				update(newValue)
			},
			onDragEnd() {
				context.emit('end-tweak')
			},
		})

		const showTweakLabel = computed(() => {
			if (!dragEl.value || !tweaking.value) return false

			const {left, right, top, bottom} = dragEl.value.getBoundingClientRect()
			const [x, y] = absolutePos.value
			return x < left || right < x || y < top || bottom < y
		})

		const {
			step,
			displayValue,
			onBlur,
			onKeydown,
			update,
			overlayLabel,
		} = useNumberInput(
			toRef(props, 'modelValue'),
			startValue,
			tweaking,
			context
		)

		const sliderStyle = computed(() => {
			const t = (props.modelValue - props.min) / (props.max - props.min)
			return {
				width: `${_.clamp(t, 0, 1) * 100}%`,
			}
		})

		return {
			dragEl,
			inputEl,

			displayValue,
			step,
			tweaking,
			absolutePos,
			overlayLabel,
			showTweakLabel,

			onBlur,
			onKeydown,
			update,

			sliderStyle,
		}
	},
	inheritAttrs: false,
})
</script>

<style lang="stylus">
@import './use-number-input.styl'

.InputSlider
	width 12.6rem
	height $input-height
	background var(--base01)
	use-number()

	&__input
		position absolute
		top 0
		left 0
		z-index 10
		width 100%
		height 100%
		background transparent

	&__slider-wrapper
		position relative
		overflow hidden
		width 100%
		height 100%
		border-radius $border-radius

	&__slider
		position relative
		height 100%
		input-transition(border-right-color)

		~/.tweaking &
			&:after
				background var(--highlight)
				opacity 1

		&:after
			position absolute
			top 0
			left 0
			width 100%
			height 100%
			background var(--base03)
			content ''
			input-transition(all)
</style>
