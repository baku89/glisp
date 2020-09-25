<template>
	<div class="MalInputKeyword">
		:
		<InputString
			class="MalInputKeyword__input"
			:value="displayValue"
			:validator="keywordValidator"
			@input="onInput"
			@end-tweak="$emit('end-tweak')"
		/>
	</div>
</template>

<script lang="ts">
import {defineComponent, computed, PropType} from 'vue'
import {NonReactive, nonReactive} from '@/utils'
import {MalSeq, MalSymbol, getName, keywordFor} from '@/mal/types'
import {InputString} from '@/components/inputs'

export default defineComponent({
	name: 'MalInputKeyword',
	components: {
		InputString,
	},
	props: {
		value: {
			type: Object as PropType<NonReactive<string | MalSeq | MalSymbol>>,
			required: true,
			validator: (x: NonReactive<string | MalSeq | MalSymbol>) =>
				x instanceof NonReactive,
		},
		validator: {
			required: false,
		},
	},
	setup(props, context) {
		const displayValue = computed(() => {
			return getName(props.value.value)
		})

		function keywordValidator(str: string): string {
			return str.replace(/[^a-z0-9-]/gi, '-')
		}

		function onInput(str: string) {
			const value = keywordFor(str)
			context.emit('input', nonReactive(value))
		}

		return {displayValue, keywordValidator, onInput}
	},
})
</script>

<style lang="stylus">
.MalInputKeyword
	color var(--syntax-keyword)

	&__input
		color var(--syntax-keyword)
</style>
