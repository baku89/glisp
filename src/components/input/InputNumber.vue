<template>
	<input
		class="InputNumber"
		type="number"
		:value="value"
		:step="step"
		@input="onInput"
	/>
</template>

<script lang="ts">
import {defineComponent, computed} from '@vue/composition-api'

interface Props {
	value: number
	validator?: (v: number) => number | null
}

export default defineComponent({
	name: 'InputNumber',
	props: {
		value: {
			type: Number,
			required: true
		},
		validator: {
			type: Function,
			required: false
		}
	},
	setup(props: Props, context) {
		const step = computed(() => {
			const float = props.value.toString().split('.')[1]
			return float !== undefined
				? Math.min(Math.pow(10, -float.length), 0.1)
				: 1
		})

		const onInput = (e: InputEvent) => {
			const str = (e.target as HTMLInputElement).value
			let val: number | null = parseFloat(str)

			if (isNaN(val)) {
				return
			}

			if (props.validator) {
				val = props.validator(val)
				if (typeof val !== 'number' || isNaN(val)) {
					return
				}
			}

			context.emit('input', val)
		}

		const onBlur = (e: InputEvent) => {
			const el = e.target as HTMLInputElement
			el.value = props.value.toString()
		}

		return {
			step,
			onInput,
			onBlur
		}
	}
})
</script>

<style lang="stylus" scoped>
@import './common.styl'

.InputNumber
	input()
	color var(--orange)
	text-align right
</style>
