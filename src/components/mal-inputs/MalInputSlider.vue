<template>
	<div class="MalInputSlider">
		<MalExpButton
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
			class="MalInputSlider__unit"
			:class="{small: display.unit && display.unit.length >= 2}"
			>{{ display.unit }}</span
		>
		<MalExpButton
			v-if="display.isExp && !compact"
			class="MalInputSlider__exp-after"
			:value="value"
			:compact="false"
			@select="$emit('select', $event)"
		/>
	</div>
</template>

<script lang="ts" setup>
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

interface Props {
	value: MalSymbol | number | MalSeq
	min: number
	max: number
	clamped: boolean
	validator: (v: number) => number | null
	compact: boolean
	isExp: boolean
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
		return null
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

.MalInputSlider
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
