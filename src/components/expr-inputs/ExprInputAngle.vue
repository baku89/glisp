<template>
	<div class="ExprInputAngle">
		<ExprInputNumber :value="value" />
		<Tq.InputRotery :modelValue="evaluated" @update:modelValue="onInput" />
	</div>
</template>

<script lang="ts" setup>
import Tq from 'tweeq'
import {computed, toRaw} from 'vue'

import {Expr} from '@/glisp'
import {useSketchStore} from '@/stores/sketch'

import {PropBase} from './types'

interface Props extends PropBase {
	validator: (v: number) => number | null
}

const props = defineProps<Props>()

const sketch = useSketchStore()

const evaluated = computed(() => {
	const expr = toRaw(props.value)

	const evaluated = getEvaluated(expr)

	if (typeof evaluated === 'number') {
		return evaluated
	}

	throw new Error('Not a number')
})

function onInput(newExpr: Expr) {
	sketch.replace(props.parent, props.value, newExpr)
}
</script>

<style lang="stylus" scoped>
@import '../style/common.styl'

.ExprInputAngle
	display flex
	align-items center
</style>
