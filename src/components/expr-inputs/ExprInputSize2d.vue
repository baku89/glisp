<template>
	<div class="ExprInputSize2d">
		<ExprSelectButton
			v-if="!isValueSeparated"
			class="ExprInputSize2d__exp-button"
			:value="size"
			:compact="true"
			@select="$emit('select', $event)"
		/>
		<template v-if="isValueSeparated">
			<ExprInputNumber
				class="ExprInputSize2d__el"
				:value="nonReactiveValues[0]"
				:compact="true"
				@input="(...$event) => onInputElement(0, ...$event)"
				@select="$emit('select', $event)"
				@end-tweak="$emit('end-tweak')"
			/>
			<ExprInputNumber
				class="ExprInputSize2d__el"
				:value="nonReactiveValues[1]"
				:compact="true"
				@input="(...$event) => onInputElement(1, ...$event)"
				@select="$emit('select', $event)"
				@end-tweak="$emit('end-tweak')"
			/>
		</template>
		<template v-else>
			<Tq.InputNumber
				class="ExprInputSize2d__el exp"
				:modelValue="evaluated[0]"
				@update:modelValue="onInputEvaluatedElement(0, $event)"
				@end-tweak="$emit('end-tweak')"
			/>
			<Tq.InputNumber
				class="ExprInputSize2d__el exp"
				:modelValue="evaluated[1]"
				@update:modelValue="onInputEvaluatedElement(1, $event)"
				@end-tweak="$emit('end-tweak')"
			/>
		</template>
		<button
			class="ExprInputSize2d__link-button fas"
			:class="{'fa-link': ratio !== false, 'fa-unlink': ratio === false}"
			@click="onClickLinkButton"
		/>
	</div>
</template>

<script lang="ts" setup>
import Tq from 'tweeq'
import {computed} from 'vue'

import {
	cloneExpr,
	createList,
	Expr,
	ExprSeq,
	ExprSymbol,
	getEvaluated,
	isList,
	isSymbolFor,
	isVector,
	reverseEval,
	symbolFor,
} from '@/glisp'

interface Props {
	value: ExprSeq | ExprSymbol
}

const props = defineProps<Props>()

const emit = defineEmits<{
	input: [value: Expr]
	select: [value: Expr]
	'end-tweak': []
}>()

const isSizeFunc = computed(
	() => isList(props.value) && isSymbolFor(props.value[0], 'vec2/size')
)

const size = computed(() => {
	const value = props.value
	if (isSizeFunc.value) {
		return value as ExprSeq[1]
	} else {
		return props.value
	}
})

const ratio = computed(() => {
	const value = props.value
	if (isSizeFunc.value) {
		return (value as ExprSeq)[2] as number | false
	} else {
		return false
	}
})

const isValueSeparated = computed(() => isVector(size.value))

const nonReactiveValues = computed(() => {
	if (!isValueSeparated.value) {
		return []
	} else {
		return Array.from(size.value as ExprSeq)
	}
})

const evaluated = computed(() => getEvaluated(size.value) as number[])

function onInputElement(index: number, v: Expr, num: number) {
	if (!isValueSeparated.value) {
		return
	}

	const newSize = cloneExpr(size.value as ExprSeq)
	newSize[index] = v

	const r = evaluated.value[1] / evaluated.value[0]

	if (ratio.value !== false) {
		const anotherIndex = index === 0 ? 1 : 0

		let anotherValue: Expr = evaluated.value[anotherIndex]
		if (r === 0) {
			anotherValue = anotherIndex === 0 ? anotherValue : 0
		} else if (Math.abs(r) === Infinity) {
			anotherValue = anotherIndex === 0 ? 0 : anotherValue
		} else {
			anotherValue = anotherIndex === 0 ? (1 / r) * num : r * num
		}

		anotherValue = reverseEval(anotherValue, newSize[anotherIndex])
		newSize[anotherIndex] = anotherValue
	}

	const newExp = createList(
		symbolFor('vec2/size'),
		newSize,
		ratio.value === false ? false : r
	)
	emit('input', newExp)
}

function onInputEvaluatedElement(index: number, v: number) {
	const newSize = [...evaluated.value]
	newSize[index] = v

	const r = evaluated.value[1] / evaluated.value[0]

	if (ratio.value !== false) {
		const anotherIndex = index === 0 ? 1 : 0

		let anotherValue: number = newSize[anotherIndex]
		if (r === 0) {
			anotherValue = anotherIndex === 0 ? anotherValue : 0
		} else if (Math.abs(r) === Infinity) {
			anotherValue = anotherIndex === 0 ? 0 : anotherValue
		} else {
			anotherValue = anotherIndex === 0 ? (1 / r) * v : r * v
		}
		newSize[anotherIndex] = anotherValue
	}

	const newSizeExp = reverseEval(newSize, size.value)

	const newExp = createList(
		symbolFor('vec2/size'),
		newSizeExp,
		ratio.value === false ? false : r
	)
	emit('input', newExp)
}

function onClickLinkButton() {
	const newRatio =
		ratio.value === false ? evaluated.value[1] / evaluated.value[0] : false

	const newExp = createList(symbolFor('vec2/size'), size.value, newRatio)

	emit('input', newExp)
}
</script>

<style lang="stylus">
@import '../style/common.styl'

.ExprInputSize2d
	display flex
	align-items center
	line-height $input-height

	&__el, &__exp-button
		margin-right 0.6rem

	&__link-button
		padding 0
		width $button-height
		height @width !important
		color var(--button)
</style>
@/glis[/types@/glis[/utils
