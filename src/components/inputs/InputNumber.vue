<template>
	<div class="InputNumber" :class="{editing}">
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
import {
	defineComponent,
	computed,
	ref,
	Ref,
	PropType
} from '@vue/composition-api'
import keycode from 'keycode'
import {useDraggable, useKeyboardState} from '../use'
import {KeyboardInputEvent} from 'electron'

export default defineComponent({
	name: 'InputNumber',
	props: {
		value: {
			type: Number,
			required: true
		},
		validator: {
			type: Function as PropType<(v: number) => number | null>,
			required: false
		}
	},
	setup(props, context) {
		// Element references
		const dragEl = ref(null)
		const inputEl: Ref<null | HTMLInputElement> = ref(null)

		const {shift, alt} = useKeyboardState()

		// Drag Events
		let startValue = 0
		useDraggable(dragEl, {
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
				let inc = deltaX / 5

				if (shift.value) {
					inc *= 10
				}
				if (alt.value) {
					inc /= 10
				}

				startValue += inc

				update(startValue)
			}
		})

		const editing = ref(false)

		const step = computed(() => {
			const float = props.value.toString().split('.')[1]
			return float !== undefined
				? Math.max(Math.pow(10, -float.length), 0.1)
				: 1
		})

		const displayValue = computed(() =>
			props.value.toFixed(2).replace(/\.?[0]+$/, '')
		)

		function onInput(e: InputEvent) {
			const str = (e.target as HTMLInputElement).value
			const val: number | null = parseFloat(str)
			update(val)
		}

		function onBlur(e: InputEvent) {
			const el = e.target as HTMLInputElement
			el.value = props.value.toString()
			editing.value = false
		}

		function onKeydown(e: KeyboardEvent) {
			const key = keycode(e)

			if (['up', 'down'].includes(key)) {
				e.preventDefault()

				let inc = 1
				if (e.altKey) {
					inc = 0.1
				} else if (e.shiftKey) {
					inc = 10
				}

				switch (key) {
					case 'up':
						update(props.value + inc)
						break
					case 'down':
						update(props.value - inc)
						break
				}
			}
		}

		function update(val: number) {
			if (!isFinite(val)) {
				return
			}

			if (props.validator) {
				const validatedVal = props.validator(val)
				if (
					typeof validatedVal !== 'number' ||
					isNaN(validatedVal) ||
					!isFinite(validatedVal)
				) {
					return
				}
				val = validatedVal
			}

			context.emit('input', val)
		}

		return {
			dragEl,
			inputEl,

			displayValue,
			step,
			editing,

			onInput,
			onBlur,
			onKeydown
		}
	}
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.InputNumber
	position relative
	width 4em
	font-monospace()

	&__drag
		position absolute
		top 0
		left 0
		z-index 100
		width 100%
		height 100%

	&.editing &__drag
		display none

	&__input
		input()
		width 100%
		color var(--syntax-constant)
		text-align right

		/* Chrome, Safari, Edge, Opera */
		&::-webkit-outer-spin-button, &::-webkit-inner-spin-button
			margin 0
			-webkit-appearance none

		/* Firefox */
		&[type=number]
			-moz-appearance textfield

	&.exp &__input
		color var(--red)
</style>
