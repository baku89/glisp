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
import {defineComponent, SetupContext, computed} from 'vue'
import {NonReactive, nonReactive} from '@/utils'
import {MalSeq, MalSymbol, getName, keywordFor} from '@/mal/types'
import {InputString} from '@/components/inputs'

interface Props {
	value: NonReactive<string | MalSeq | MalSymbol>
	validator: (v: string) => string | null
}

export default defineComponent({
	name: 'MalInputKeyword',
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
