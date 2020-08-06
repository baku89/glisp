<template>
	<div class="InputNumber" :class="{tweaking}">
		<div class="InputNumber__drag" ref="dragEl" />
		<input
			class="InputNumber__input"
			type="text"
			:value="displayValue"
			@input="onInput"
			@blur="onBlur"
			@keydown="onKeydown"
			ref="inputEl"
		/>
	</div>
</template>

<script lang="ts">
import {defineComponent, ref, Ref, PropType, toRef} from '@vue/composition-api'
import {useDraggable, useKeyboardState} from '../use'
import {useAutoStep} from './use-number'

export default defineComponent({
	name: 'InputNumber',
	props: {
		value: {
			type: Number,
			required: true,
		},
		validator: {
			type: Function as PropType<(v: number) => number | null>,
			required: false,
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
			tweaking,
			context
		)

		return {
			dragEl,
			inputEl,

			displayValue,
			step,
			tweaking,

			onInput,
			onBlur,
			onKeydown,
			update,
		}
	},
})
</script>

<style lang="stylus">
@import './use-number.styl'

.InputNumber
	width 6rem
	use-number()
</style>
