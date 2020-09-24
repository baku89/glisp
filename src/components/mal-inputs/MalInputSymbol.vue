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
import {defineComponent, SetupContext, computed} from 'vue'
import {NonReactive, nonReactive} from '@/utils'
import {MalSeq, MalSymbol, getName, symbolFor} from '@/mal/types'
import {InputString} from '@/components/inputs'

interface Props {
	value: NonReactive<string | MalSeq | MalSymbol>
	validator: (v: string) => string | null
}

export default defineComponent({
	name: 'MalInputSymbol',
	components: {
		InputString,
	},
	props: {
		value: {
			required: true,
			validator: x => x instanceof NonReactive,
		},
		validator: {
			required: false,
		},
	},
	setup(props: Props, context: SetupContext) {
		const displayValue = computed(() => {
			return getName(props.value.value)
		})

		function symbolValidator(str: string): string {
			return str.replace(/[^a-z0-9-]/gi, '-')
		}

		function onInput(str: string) {
			const value = symbolFor(str)
			context.emit('input', nonReactive(value))
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
