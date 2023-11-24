<template>
	<Tq.InputDropdown
		:modelValue="value"
		:options="values"
		:labels="labels"
		@update:modelValue="onInput"
	/>
</template>

<script lang="ts" setup>
import Tq from 'tweeq'

import {Expr} from '@/glisp'
import {useSketchStore} from '@/stores/sketch'

import {PropBase} from './types'

interface Props extends PropBase {
	values: string[] | number[]
	labels: string[]
}

const props = defineProps<Props>()

const sketch = useSketchStore()

function onInput(newExpr: Expr) {
	sketch.replace(props.parent, props.value, newExpr)
}
</script>
