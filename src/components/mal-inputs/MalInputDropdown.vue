<template>
	<InputDropdown
		:value="value"
		:values="values"
		:labels="labels"
		@input="onInput"
	/>
</template>

<script lang="ts" setup>
import {PropType} from 'vue'

import {Expr} from '@/glisp/types'

interface Props {
	value: Expr
	values: PropType<string[] | number[]>
	labels: string[]
}

defineProps<Props>()
const emit = defineEmits<{
	input: [Expr]
	'end-tweak': []
}>()

function onInput(value: string) {
	emit('input', value)
	emit('end-tweak')
}
</script>
@/glis[/types
