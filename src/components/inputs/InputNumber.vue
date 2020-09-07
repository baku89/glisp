<template>
	<div class="InputNumber" :class="{tweaking}">
		<div class="InputNumber__drag" ref="dragEl" />
		<input
			class="InputNumber__input"
			type="text"
			:value="displayValue"
			@blur="onBlur"
			@keydown="onKeydown"
			ref="inputEl"
		/>
	</div>
</template>

<script lang="ts">
import {defineComponent, ref, Ref, PropType, toRef} from '@vue/composition-api'
import {useDraggable, useKeyboardState} from '../use'
import useNumberInput from './use-number-input'

export default defineComponent({
	name: 'InputNumber',
	props: {
		value: {
			type: Number,
			required: true,
		},
	},
	setup(props, context) {
		// Element references
		const dragEl = ref(null)
		const inputEl: Ref<null | HTMLInputElement> = ref(null)

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
				context.emit('end-tweak')
			},
		})

		const tweaking = toRef(drag, 'isDragging')

		const {step, displayValue, onBlur, onKeydown, update} = useNumberInput(
			toRef(props, 'value'),
			tweaking,
			context
		)

		return {
			dragEl,
			inputEl,

			displayValue,
			step,
			tweaking,

			onBlur,
			onKeydown,
			update,
		}
	},
})
</script>

<style lang="stylus">
@import './use-number-input.styl'

.InputNumber
	width 6rem
	use-number()
</style>
