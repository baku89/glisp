<template>
	<div class="ExprInputNumber">
		<ExprSelectButton
			v-if="display.isExp && compact"
			class="exp-button"
			:value="value"
			:compact="true"
			@select="$emit('select', $event)"
		/>
		<Tq.InputNumber
			:class="{
				exp: display.isExp,
			}"
			:modelValue="literalValue"
			@update:modelValue="onInput"
		/>
	</div>
</template>

<script lang="ts" setup>
import Tq from 'tweeq'
import {computed, toRaw} from 'vue'

import {Expr, getEvaluated, getFnInfo, getMapValue, isList} from '@/glisp'
import {useSketchStore} from '@/stores/sketch'

import ExprSelectButton from './ExprSelectButton.vue'
import {PropBase} from './types'

interface Props extends PropBase {
	validator?: (v: number) => number | null
	compact?: boolean
}

const props = defineProps<Props>()

const sketch = useSketchStore()

const display = computed(() => {
	const expr = toRaw(props.value)

	if (typeof expr === 'number') {
		return {mode: 'number', isExp: false}
	} else if (isList(expr) && expr.length === 2) {
		const info = getFnInfo(expr)

		if (info) {
			const inverseFn = getMapValue(info.meta, 'inverse', 'fn')
			const unit = getMapValue(info.meta, 'unit', 'string')

			if (inverseFn && unit) {
				const isExp = typeof (expr as Expr[])[1] !== 'number'
				return {mode: 'unit', unit, inverseFn, isExp}
			}
		}
	}
	return {mode: 'exp', isExp: true}
})

const literalValue = computed(() => {
	const expr = toRaw(props.value)
	if (typeof expr === 'number') {
		return expr
	}

	const evaluated = getEvaluated(expr)
	if (typeof evaluated === 'number') {
		return evaluated
	}

	throw new Error('Nota number but got=' + evaluated)
})

function onInput(newExpr: number) {
	sketch.replace(props.parent, props.value, newExpr)
	// Parse if necessary
	// if (typeof value === 'string') {
	// 	let ret
	// 	try {
	// 		ret = readStr(value)
	// 	} catch (e) {
	// 		return
	// 	}
	// 	newExp = ret
	// }
	// // Validate
	// if (props.validator && typeof value === 'number') {
	// 	let validated
	// 	if (display.value.mode === 'unit') {
	// 		const unitValue = (fn.value as any)(value as any)
	// 		validated = (display.value.inverseFn as any)({
	// 			[K('return')]: props.validator(unitValue),
	// 		})[0]
	// 	} else {
	// 		validated = props.validator(value)
	// 	}
	// 	if (typeof validated === 'number') {
	// 		newExp = validated
	// 	}
	// }
	// // Reverse evaluation
	// if (display.value.mode === 'unit') {
	// 	const unitValue =
	// 		typeof newExp === 'number'
	// 			? reverseEval(newExp, (props.expr as Expr[])[1])
	// 			: newExp
	// 	newExp = L((props.expr as Expr[])[0], unitValue)
	// } else if (display.value.mode === 'exp') {
	// 	newExp =
	// 		typeof newExp === 'number' ? reverseEval(newExp, props.expr) : newExp
	// }
}
</script>

<style lang="stylus" scoped>
@import '../style/common.styl'

.ExprInputNumber
	position relative
	display flex
	align-items center
	line-height $input-height

.exp-button
	position absolute
	left 0.4rem
	z-index 200

.unit
	padding-left 0.3em
	width 1rem
	color var(--comment)

	&.small
		height $input-height
		letter-spacing 0
		font-size 0.8em
		line-height $input-height * 1.2

.exp-after
	margin-left 0.3rem
</style>
@/glis[@/glis[/types@/glis[/utils
