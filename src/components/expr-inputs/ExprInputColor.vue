<template>
	<Tq.InputColor :modelValue="evaluatedValue" @update:modelValue="onInput" />
</template>

<script lang="ts" setup>
import Tq from 'tweeq'
import {computed, toRaw} from 'vue'

import {useSketchStore} from '@/stores/sketch'

import {PropBase} from './types'

interface Props extends PropBase {}

const props = defineProps<Props>()

defineOptions({
	inheritAttrs: false,
})

const sketch = useSketchStore()

const literalValue = computed(() => {
	const expr = toRaw(props.value)

	if (typeof expr === 'string') {
		return expr
	}

	return null
})

const evaluatedValue = computed(() => {
	if (literalValue.value) {
		return literalValue.value
	}

	const expr = toRaw(props.value)

	if (typeof expr === 'string') {
		return expr
	}

	throw new Error('Not a string but got=' + expr)
})

function onInput(newExpr: string) {
	sketch.replace(props.parent, props.value, newExpr)
}
</script>
