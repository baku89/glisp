<template>
	<div class="ExprInputNumber">
		<ExprSelectButton
			v-if="display.isExp && compact"
			class="ExprInputNumber__exp-button"
			:value="value"
			:compact="true"
			@select="$emit('select', $event)"
		/>
		<Tq.InputNumber
			:class="{
				exp: display.isExp,
			}"
			:modelValue="displayValue"
			@update:modelValue="onInput"
			@end-tweak="$emit('end-tweak', $event)"
		/>
		<span
			v-if="display.mode === 'unit'"
			class="ExprInputNumber__unit"
			:class="{small: display.unit && display.unit.length >= 2}"
			>{{ display.unit }}</span
		>
		<ExprSelectButton
			v-if="display.isExp && !compact"
			class="ExprInputNumber__exp-after"
			:value="value"
			:compact="false"
			@select="$emit('select', $event)"
		/>
	</div>
</template>

<script lang="ts" setup>
import Tq from 'tweeq'
import {computed} from 'vue'

import {readStr} from '@/glisp'
import {
	createList as L,
	getEvaluated,
	isList,
	keywordFor as K,
	ExprSeq,
	ExprSymbol,
	Expr,
} from '@/glisp/types'
import {getFn, getFnInfo, getMapValue, reverseEval} from '@/glisp/utils'

import ExprSelectButton from './ExprSelectButton.vue'
interface Props {
	value: ExprSymbol | number | ExprSeq
	validator?: (v: number) => number | null
	compact?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
	input: [value: Expr]
	select: [value: Expr]
	'end-tweak': [value: Expr]
}>()

const display = computed(() => {
	if (typeof props.value === 'number') {
		return {mode: 'number', isExp: false}
	} else if (isList(props.value) && props.value.length === 2) {
		const info = getFnInfo(props.value)

		if (info) {
			const inverseFn = getMapValue(info.meta, 'inverse', 'fn')
			const unit = getMapValue(info.meta, 'unit', 'string')

			if (inverseFn && unit) {
				const isExp = typeof (props.value as Expr[])[1] !== 'number'
				return {mode: 'unit', unit, inverseFn, isExp}
			}
		}
	}
	return {mode: 'exp', isExp: true}
})

const fn = computed(() => {
	if (display.value.mode !== 'exp') {
		return getFn(props.value)
	} else {
		return undefined
	}
})

const displayValue = computed(() => {
	switch (display.value.mode) {
		case 'number':
			return props.value as number
		case 'unit':
			return getEvaluated((props.value as Expr[])[1]) as number
		default:
			// exp
			return getEvaluated(props.value) as number
	}
})

function onInput(value: number) {
	let newExp: Expr = value

	// Parse if necessary
	if (typeof value === 'string') {
		let ret
		try {
			ret = readStr(value)
		} catch (e) {
			return
		}
		newExp = ret
	}

	// Validate
	if (props.validator && typeof value === 'number') {
		let validated
		if (display.value.mode === 'unit') {
			const unitValue = (fn.value as any)(value as any)
			validated = (display.value.inverseFn as any)({
				[K('return')]: props.validator(unitValue),
			})[0]
		} else {
			validated = props.validator(value)
		}
		if (typeof validated === 'number') {
			newExp = validated
		}
	}

	// Reverse evaluation
	if (display.value.mode === 'unit') {
		const unitValue =
			typeof newExp === 'number'
				? reverseEval(newExp, (props.value as Expr[])[1])
				: newExp
		newExp = L((props.value as Expr[])[0], unitValue)
	} else if (display.value.mode === 'exp') {
		newExp =
			typeof newExp === 'number' ? reverseEval(newExp, props.value) : newExp
	}

	emit('input', newExp)
}
</script>

<style lang="stylus">
@import '../style/common.styl'

.ExprInputNumber
	position relative
	display flex
	align-items center
	line-height $input-height

	&__exp-button
		position absolute
		left 0.4rem
		z-index 200

	&__unit
		padding-left 0.3em
		width 1rem
		color var(--comment)

		&.small
			height $input-height
			letter-spacing 0
			font-size 0.8em
			line-height $input-height * 1.2

	&__exp-after
		margin-left 0.3rem
</style>
@/glis[@/glis[/types@/glis[/utils
