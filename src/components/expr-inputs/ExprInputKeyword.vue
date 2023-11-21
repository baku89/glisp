<template>
	<div class="ExprInputKeyword">
		:
		<Tq.InputString
			class="ExprInputKeyword__input"
			:value="displayValue"
			:validator="keywordValidator"
			@input="onInput"
			@end-tweak="$emit('end-tweak')"
		/>
	</div>
</template>

<script lang="ts" setup>
import {computed} from 'vue'

import {getName, keywordFor, ExprSeq, ExprSymbol} from '@/glisp/types'

interface Props {
	value: string | ExprSeq | ExprSymbol
	validator: (v: string) => string | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
	input: [value: string]
	'end-tweak': []
}>()

const displayValue = computed(() => {
	return getName(props.value)
})

function keywordValidator(str: string): string {
	return str.replace(/[^a-z0-9-]/gi, '-')
}

function onInput(str: string) {
	const value = keywordFor(str)
	emit('input', value)
}
</script>

<style lang="stylus">
.ExprInputKeyword
	color var(--syntax-keyword)

	&__input
		color var(--syntax-keyword)
</style>
@/glis[/types
