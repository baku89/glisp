<template>
	<div class="InputNumber" :class="{editing}">
		<div class="InputNumber__drag" ref="dragEl" />
		<input
			class="InputNumber__input"
			type="number"
			:value="value"
			:step="step"
			@input="onInput"
			@blur="onBlur"
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
import {useDraggable, useKeyboardState} from '../use'

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
		useDraggable(dragEl, {
			onClick() {
				editing.value = true
				if (inputEl.value) {
					inputEl.value.focus()
					inputEl.value.select()
				}
			},
			onDrag({deltaX}) {
				let inc = deltaX

				if (shift.value) {
					inc *= 10
				}
				if (alt.value) {
					inc /= 10
				}

				update(props.value + inc)
			}
		})

		function aaa(e: KeyboardEvent) {
			console.log(e)
		}

		const editing = ref(false)

		const step = computed(() => {
			const float = props.value.toString().split('.')[1]
			return float !== undefined
				? Math.min(Math.pow(10, -float.length), 0.1)
				: 1
		})

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

		function update(val: number) {
			if (!isFinite(val)) {
				return
			}

			if (props.validator) {
				const validatedVal = props.validator(val)
				if (typeof validatedVal !== 'number' || !isFinite(validatedVal)) {
					return
				}
				val = validatedVal
			}

			context.emit('input', val)
		}

		return {
			dragEl,
			inputEl,

			step,
			editing,
			aaa,

			onInput,
			onBlur
		}
	}
})
</script>

<style lang="stylus" scoped>
@import './common.styl'

.InputNumber
	position relative
	width 6em

	&__drag
		position absolute
		top 0
		left 0
		width 100%
		height 100%
		z-index 100

	&.editing &__drag
		display none

	&__input
		input()
		width 100%
		color var(--orange)
		text-align right
</style>
