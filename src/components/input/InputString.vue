<template>
	<input
		class="InputString"
		type="text"
		:value="value"
		@input="onInput"
		@blur="onBlur"
	/>
</template>

<script lang="ts">
import {defineComponent} from '@vue/composition-api'

interface Props {
	value: string
	validator?: (v: string) => string | null
}

export default defineComponent({
	props: {
		value: {
			type: String,
			required: true
		},
		validator: {
			type: Function,
			required: false
		}
	},
	setup(props: Props, context) {
		const onInput = (e: InputEvent) => {
			let val: string | null = (e.target as HTMLInputElement).value

			if (props.validator) {
				val = props.validator(val)
				if (val === null) return
			}

			context.emit('input', val)
		}

		const onBlur = (e: InputEvent) => {
			const el = e.target as HTMLInputElement
			el.value = props.value
		}

		return {
			onInput,
			onBlur
		}
	}
})
</script>

<style lang="stylus" scoped>
@import './common.styl'

.InputString
	input()
	color var(--green)
</style>
