<template>
	<div class="InputSlider" :class="{editing}">
		<div class="InputSlider__drag" ref="dragEl" />
		<input
			class="InputSlider__input"
			type="text"
			:value="displayValue"
			@input="onInput"
			@blur="onBlur"
			@keydown="onKeydown"
			ref="inputEl"
		/>
		<div class="InputSlider__slider" :style="sliderStyle" />
	</div>
</template>

<script lang="ts">
import {
	defineComponent,
	computed,
	ref,
	Ref,
	PropType,
	toRef,
} from '@vue/composition-api'
import {useDraggable, useKeyboardState} from '../use'
import {useAutoStep} from './use-number'

export default defineComponent({
	name: 'InputSlider',
	props: {
		value: {
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
		validator: {
			type: Function as PropType<(v: number) => number | null>,
			required: false,
		},
	},
	setup(props, context) {
		// Element references
		const dragEl: Ref<null | HTMLElement> = ref(null)
		const inputEl: Ref<null | HTMLInputElement> = ref(null)

		const {shift, alt} = useKeyboardState()

		// Drag Events
		let startValue = 0
		const drag = useDraggable(dragEl, {
			onClick() {
				editing.value = true
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
				context.emit('end-tweak')
			},
		})

		const editing = ref(false)

		const {
			step,
			displayValue,
			onInput,
			onBlur,
			onKeydown,
			update,
		} = useAutoStep(
			toRef(props, 'value'),
			toRef(props, 'validator'),
			toRef(drag, 'isDragging'),
			editing,
			context
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

		return {
			dragEl,
			inputEl,

			displayValue,
			step,
			editing,

			onInput,
			onBlur,
			onKeydown,
			update,

			sliderStyle,
		}
	},
})
</script>

<style lang="stylus">
@import './use-number.styl'

.InputSlider
	width 12.6rem
	use-number()
	overflow hidden

	&__slider
		position absolute
		top 0
		left 0
		height 100%
		border-radius 2px
		background var(--input)
</style>
