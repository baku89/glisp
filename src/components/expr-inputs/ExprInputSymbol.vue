<template>
	<div class="ExprInputSymbol">
		<Tq.InputString
			class="ExprInputSymbol__input"
			:modelValue="displayValue"
			:validator="symbolValidator"
			@update:modelValue="onInput"
			@end-tweak="$emit('end-tweak')"
		/>
	</div>
</template>

<script lang="ts" setup>
import Tq from 'tweeq'
import {computed} from 'vue'

import {ExprSeq, ExprSymbol, getName, symbolFor} from '@/glisp'

interface Props {
	value: string | ExprSeq | ExprSymbol
	validator: (v: string) => string | null
}

const props = defineProps<Props>()
const emit = defineEmits<{
	input: [value: ExprSymbol]
	'end-tweak': []
}>()

const displayValue = computed(() => {
	return getName(props.value)
})

function symbolValidator(str: string): string {
	return str.replace(/[^a-z0-9-]/gi, '-')
}

function onInput(str: string) {
	const value = symbolFor(str)
	emit('input', value)
}
</script>

<style lang="stylus">
.ExprInputSymbol
	color var(--syntax-function)

	&__input
		color var(--syntax-function)
</style>
@/glis[/types
