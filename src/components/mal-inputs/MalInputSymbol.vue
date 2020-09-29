<template>
	<div class="MalInputSymbol">
		<InputString
			class="MalInputSymbol__input"
			:value="displayValue"
			:validator="symbolValidator"
			@input="onInput"
			@end-tweak="$emit('end-tweak')"
		/>
	</div>
</template>

<script lang="ts">
import {defineComponent, PropType, computed} from 'vue'
import {MalSeq, MalSymbol, getName, symbolFor} from '@/mal/types'
import {InputString} from '@/components/inputs'

export default defineComponent({
	name: 'MalInputSymbol',
	components: {
		InputString,
	},
	props: {
		value: {
			type: [String, Object, MalSymbol] as PropType<
				string | MalSeq | MalSymbol
			>,
			required: true,
		},
		validator: {
			type: Function as PropType<(v: string) => string | null>,
			required: false,
		},
	},
	setup(props, context) {
		const displayValue = computed(() => {
			return getName(props.value)
		})

		function symbolValidator(str: string): string {
			return str.replace(/[^a-z0-9-]/gi, '-')
		}

		function onInput(str: string) {
			const value = symbolFor(str)
			context.emit('input', value)
		}

		return {displayValue, symbolValidator, onInput}
	},
})
</script>

<style lang="stylus">
.MalInputSymbol
	color var(--syntax-function)

	&__input
		color var(--syntax-function)
</style>
