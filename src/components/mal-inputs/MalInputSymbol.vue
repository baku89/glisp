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
import {MalSeq, MalSymbol, getName, MalList} from '@/mal/types'
import {InputString} from '@/components/inputs'

export default defineComponent({
	name: 'MalInputSymbol',
	components: {
		InputString,
	},
	props: {
		value: {
			type: Object as PropType<MalSymbol | MalList | MalSymbol>,
			required: true,
		},
	},
	setup(props, context) {
		const displayValue = computed(() => {
			const evaluated = props.value.evaluated
			return MalSymbol.is(evaluated) ? evaluated.value : ''
		})

		function symbolValidator(str: string): string {
			return str.replace(/[^a-z0-9-]/gi, '-')
		}

		function onInput(str: string) {
			const value = MalSymbol.from(str)
			context.emit('input', value)
		}

		return {displayValue, symbolValidator, onInput}
	},
})
</script>

<style lang="stylus">
.MalInputSymbol
	color var(--function)

	&__input
		color var(--function)
</style>
