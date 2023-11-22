<template>
	<div class="ExprInputSlider">
		<ExprSelectButton
			v-if="display.isExp && compact"
			:value="value"
			:compact="true"
			@select="$emit('select', $event)"
		/>
		<InputSlider
			:class="{
				exp: display.isExp,
			}"
			:value="displayValue"
			:max="innerMax"
			:min="innerMin"
			:clamped="clamped"
			@input="onInput"
			@end-tweak="$emit('end-tweak', $event)"
		/>
		<span
			v-if="display.mode === 'unit'"
			class="ExprInputSlider__unit"
			:class="{small: display.unit && display.unit.length >= 2}"
			>{{ display.unit }}</span
		>
		<ExprSelectButton
			v-if="display.isExp && !compact"
			class="ExprInputSlider__exp-after"
			:value="value"
			:compact="false"
			@select="$emit('select', $event)"
		/>
	</div>
</template>

<script lang="ts" setup>
import {computed, toRaw} from 'vue'

import {readStr} from '@/glisp'
import {
	createList as L,
	Expr,
	ExprSeq,
	ExprSymbol,
	getEvaluated,
	getFn,
	getFnInfo,
	getMapValue,
	isList,
	keywordFor as K,
	reverseEval,
} from '@/glisp'

interface Props {
	value: ExprSymbol | number | ExprSeq
	min: number
	max: number
	clamped: boolean
	validator: (v: number) => number | null
	compact: boolean
	isExp: boolean
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
		const info = getFnInfo(toRaw(props.value))

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
		return null
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

const innerMin = computed(() => {
	if (display.value.mode === 'unit') {
		return (display.value.inverseFn as any)({
			[K('return')]: props.min,
		})[0]
	} else {
		return props.min
	}
})

const innerMax = computed(() => {
	if (display.value.mode === 'unit') {
		return (display.value.inverseFn as any)({
			[K('return')]: props.max,
		})[0]
	} else {
		return props.max
	}
})

function onInput(value: number | string) {
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

.ExprInputSlider
	display flex
	align-items center
	line-height $input-height

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
