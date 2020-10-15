<template>
	<div class="InputSlider" :class="{tweaking}">
		<div class="InputSlider__drag" ref="dragEl" />
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
</template>

<script lang="ts">
import {defineComponent, computed, ref, toRef} from 'vue'
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
				startValue = props.modelValue
			},
			onDrag({delta}) {
				if (!dragEl.value) return

				let inc =
					((props.max - props.min) * delta[0]) / dragEl.value.clientWidth

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
				context.emit('end-tweak')
			},
		})

		const tweaking = toRef(drag, 'isDragging')

		const {step, displayValue, onBlur, onKeydown, update} = useNumberInput(
			toRef(props, 'modelValue'),
			tweaking,
			context
		)

		const sliderStyle = computed(() => {
			const t = (props.modelValue - props.min) / (props.max - props.min)
			const borderRadius = t < 1 ? 0 : '2px'
			return {
				width: `${t * 100}%`,
				borderTopRightRadius: borderRadius,
				borderButtonRightRadius: borderRadius,
			}
		})

		return {
			dragEl,
			inputEl,

			displayValue,
			step,
			tweaking,

			onBlur,
			onKeydown,
			update,

			sliderStyle,
		}
	},
})
</script>

<style lang="stylus">
@import './use-number-input.styl'

.InputSlider
	width 12.6rem
	use-number()

	&__slider-wrapper
		position absolute
		top 0
		left 0
		overflow hidden
		width 100%
		height 100%
		border-radius $border-radius

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
			border-right-color var(--highlight)

			&:after
				opacity 0.1
</style>
