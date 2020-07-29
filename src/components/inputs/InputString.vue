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
import {defineComponent, PropType} from '@vue/composition-api'

export default defineComponent({
	name: 'InputString',
	props: {
		value: {
			type: String,
			required: true,
		},
		validator: {
			type: Function as PropType<(v: string) => string | null>,
			required: false,
		},
	},
	setup(props, context) {
		function onInput(e: InputEvent) {
			let val: string | null = (e.target as HTMLInputElement).value

			if (props.validator) {
				val = props.validator(val)
				if (val === null) return
			}

			context.emit('input', val)
		}

		function onBlur(e: InputEvent) {
			const el = e.target as HTMLInputElement
			el.value = props.value
			context.emit('end-tweak')
		}

		return {
			onInput,
			onBlur,
		}
	},
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.InputString
	input()
	color var(--syntax-string)
</style>
