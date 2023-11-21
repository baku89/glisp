<template>
	<div class="MalInputSymbol">
		<Tq.InputString
			class="MalInputSymbol__input"
			:value="displayValue"
			:validator="symbolValidator"
			@input="onInput"
			@end-tweak="$emit('end-tweak')"
		/>
	</div>
</template>

<script lang="ts" setup>
import {computed} from 'vue'

import {getName, MalSeq, ExprSymbol, symbolFor} from '@/glisp/types'

interface Props {
	value: string | MalSeq | ExprSymbol
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
.MalInputSymbol
	color var(--syntax-function)

	&__input
		color var(--syntax-function)
</style>
@/glis[/types
