<template>
	<div class="ExprInputRect2d">
		<template v-if="literalValue">
			<ExprInputNumber
				v-for="(v, i) in literalValue"
				:key="i"
				class="el"
				:value="v"
				:parent="value"
			/>
		</template>
	</div>
</template>

<script lang="ts" setup>
import {computed} from '@vue/reactivity'
import {vec4} from 'linearly'
import {toRaw} from 'vue'

import {Expr, getEvaluated, getStructType} from '@/glisp'
import {useSketchStore} from '@/stores/sketch'

import ExprInputNumber from './ExprInputNumber.vue'
import {PropBase} from './types'

interface Props extends PropBase {}

const props = defineProps<Props>()
const sketch = useSketchStore()

function isRect2d(expr: Expr): expr is vec4.Mutable {
	return getStructType(expr) === 'rect2d'
}

const literalValue = computed<vec4 | null>(() => {
	const expr = toRaw(props.value)

	if (isRect2d(expr)) {
		return expr
	}

	return null
})

const evaluatedValue = computed<vec4>(() => {
	const expr = toRaw(props.value)

	const evaluated = getEvaluated(expr)

	if (isRect2d(evaluated)) {
		return evaluated
	}

	throw new Error('Invalid vector expression')
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.ExprInputRect2d
	display flex
	align-items center
	line-height $input-height

	&__exp-button
		margin-right 0.6rem

	&__el
		margin-left 0.2em
		width 3em

		&:first-child
			margin-left 0

	&__translate
		margin-left $input-horiz-margin
</style>
@/glis[/types@/glis[/utils
