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
import {computed, defineComponent, PropType} from 'vue'

import {InputString} from '@/components/inputs'
import {MalKeyword, MalList, MalSymbol, MalType} from '@/mal/types'

export default defineComponent({
	name: 'MalInputKeyword',
	components: {
		InputString,
	},
	props: {
		value: {
			type: [Object] as PropType<MalList | MalKeyword | MalSymbol>,
			required: true,
		},
		validator: {
			required: false,
		},
	},
	setup(props, context) {
		const displayValue = computed(() => {
			const evaluated = props.value.evaluated
			return evaluated.type === MalType.Keyword ? evaluated.value : ''
		})

		function keywordValidator(str: string): string {
			return str.replace(/[^a-z0-9-]/gi, '-')
		}

		function onInput(str: string) {
			const value = MalKeyword.from(str)
			context.emit('input', value)
		}

		return {displayValue, keywordValidator, onInput}
	},
})
</script>

<style lang="stylus">
.MalInputKeyword
	color var(--keyword)

	&__input
		color var(--keyword)
</style>
