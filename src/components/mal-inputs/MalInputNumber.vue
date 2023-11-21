<template>
	<div class="MalInputNumber">
		<MalExpButton
			v-if="display.isExp && compact"
			class="MalInputNumber__exp-button"
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
			class="MalInputNumber__unit"
			:class="{small: display.unit && display.unit.length >= 2}"
			>{{ display.unit }}</span
		>
		<MalExpButton
			v-if="display.isExp && !compact"
			class="MalInputNumber__exp-after"
			:value="value"
			:compact="false"
			@select="$emit('select', $event)"
		/>
	</div>
</template>

<script lang="ts" setup>
import Tq from 'tweeq'
import {computed} from 'vue'

import {readStr} from '@/mal'
import {
	createList as L,
	getEvaluated,
	isList,
	keywordFor as K,
	MalSeq,
	MalSymbol,
	MalType,
	MalVal,
} from '@/mal/types'
import {getFn, getFnInfo, getMapValue, reverseEval} from '@/mal/utils'

import MalExpButton from './MalExpButton.vue'
interface Props {
	value: MalSymbol | number | MalSeq
	validator?: (v: number) => number | null
	compact?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
	input: [value: MalVal]
	select: [value: MalVal]
	'end-tweak': [value: MalVal]
}>()

const display = computed(() => {
	if (typeof props.value === 'number') {
		return {mode: 'number', isExp: false}
	} else if (isList(props.value) && props.value.length === 2) {
		const info = getFnInfo(props.value)

		if (info) {
			const inverseFn = getMapValue(info.meta, 'inverse', MalType.Function)
			const unit = getMapValue(info.meta, 'unit', MalType.String)

			if (inverseFn && unit) {
				const isExp = typeof (props.value as MalVal[])[1] !== 'number'
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
			return getEvaluated((props.value as MalVal[])[1]) as number
		default:
			// exp
			return getEvaluated(props.value) as number
	}
})

function onInput(value: number) {
	let newExp: MalVal = value

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
				? reverseEval(newExp, (props.value as MalVal[])[1])
				: newExp
		newExp = L((props.value as MalVal[])[0], unitValue)
	} else if (display.value.mode === 'exp') {
		newExp =
			typeof newExp === 'number' ? reverseEval(newExp, props.value) : newExp
	}

	emit('input', newExp)
}
</script>

<style lang="stylus">
@import '../style/common.styl'

.MalInputNumber
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
