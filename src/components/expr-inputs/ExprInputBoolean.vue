<template>
	<Tq.InputCheckbox
		class="ExprInputBoolean__input"
		:class="{exp: isExp}"
		:modelValue="evaluated"
		@update:modelValue="onInput"
	/>
</template>

<script lang="ts" setup>
import Tq from 'tweeq'
import {computed} from 'vue'

import {getEvaluated} from '@/glisp'
import {useSketchStore} from '@/stores/sketch'

import {PropBase} from './types'

interface Props extends PropBase {}
const props = defineProps<Props>()

const sketch = useSketchStore()

const isExp = computed(() => typeof props.value !== 'boolean')
const evaluated = computed(() => (getEvaluated(props.value) ? true : false))

function onInput(newExpr: boolean) {
	sketch.replace(props.parent, props.value, newExpr)
}
</script>
