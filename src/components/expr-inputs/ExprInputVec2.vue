<template>
	<div class="ExprInputVec2">
		<template v-if="literalValue">
			<ExprInputNumber class="el" :value="literalValue[0]" :parent="value" />
			<ExprInputNumber class="el" :value="literalValue[1]" :parent="value" />
		</template>
		<template v-else>
			<Tq.InputNumber
				class="el"
				:modelValue="evaluatedValue[0]"
				@update:modelValue="onInputElement(0, $event)"
			/>
			<Tq.InputNumber
				class="el"
				:modelValue="evaluatedValue[1]"
				@update:modelValue="onInputElement(1, $event)"
			/>
		</template>
	</div>
</template>

<script lang="ts" setup>
import {vec2} from 'linearly'
import Tq from 'tweeq'
import {computed, toRaw} from 'vue'

import {Expr, getEvaluated, isVector} from '@/glisp'
import {useSketchStore} from '@/stores/sketch'

import ExprInputNumber from './ExprInputNumber.vue'
import {PropBase} from './types'

interface Props extends PropBase {}

const props = defineProps<Props>()

const sketch = useSketchStore()

function isVec2(expr: Expr): expr is vec2.Mutable {
	return isVector(expr) && expr.length === 2
}

const literalValue = computed<vec2 | null>(() => {
	const expr = toRaw(props.value)

	if (isVec2(expr)) {
		return expr
	}

	return null
})

const evaluatedValue = computed<vec2>(() => {
	const expr = toRaw(props.value)

	const evaluated = getEvaluated(expr)

	if (isVec2(evaluated)) {
		return evaluated
	}

	throw new Error('Invalid vector expression')
})

function onInputElement(index: number, value: number) {
	const newExpr = vec2.clone(evaluatedValue.value)

	newExpr[index] = value

	sketch.replace(props.parent, props.value, newExpr)
}
</script>

<style lang="stylus" scoped>
@import '../style/common.styl'

.ExprInputVec2
	display flex
	align-items center
	line-height $input-height

.el, .exp-button
	margin-right 0.6rem
</style>
@/glis[/types@/glis[/utils
