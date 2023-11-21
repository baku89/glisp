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

import {MalVal} from '@/mal/types'

interface Props {
	value: MalVal
	values: PropType<string[] | number[]>
	labels: string[]
}

defineProps<Props>()
const emit = defineEmits<{
	input: [MalVal]
	'end-tweak': []
}>()

function onInput(value: string) {
	emit('input', value)
	emit('end-tweak')
}
</script>
