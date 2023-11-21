<template>
	<div class="MalInputSize2d">
		<MalExpButton
			v-if="!isValueSeparated"
			class="MalInputSize2d__exp-button"
			:value="size"
			:compact="true"
			@select="$emit('select', $event)"
		/>
		<template v-if="isValueSeparated">
			<MalInputNumber
				class="MalInputSize2d__el"
				:value="nonReactiveValues[0]"
				:compact="true"
				@input="(...$event) => onInputElement(0, ...$event)"
				@select="$emit('select', $event)"
				@end-tweak="$emit('end-tweak')"
			/>
			<MalInputNumber
				class="MalInputSize2d__el"
				:value="nonReactiveValues[1]"
				:compact="true"
				@input="(...$event) => onInputElement(1, ...$event)"
				@select="$emit('select', $event)"
				@end-tweak="$emit('end-tweak')"
			/>
		</template>
		<template v-else>
			<Tq.InputNumber
				class="MalInputSize2d__el exp"
				:modelValue="evaluated[0]"
				@update:modelValue="onInputEvaluatedElement(0, $event)"
				@end-tweak="$emit('end-tweak')"
			/>
			<Tq.InputNumber
				class="MalInputSize2d__el exp"
				:modelValue="evaluated[1]"
				@update:modelValue="onInputEvaluatedElement(1, $event)"
				@end-tweak="$emit('end-tweak')"
			/>
		</template>
		<button
			class="MalInputSize2d__link-button fas"
			:class="{'fa-link': ratio !== false, 'fa-unlink': ratio === false}"
			@click="onClickLinkButton"
		/>
	</div>
</template>

<script lang="ts" setup>
import Tq from 'tweeq'
import {computed} from 'vue'

import {
	cloneExp,
	createList,
	getEvaluated,
	isList,
	isSymbolFor,
	isVector,
	MalSeq,
	MalSymbol,
	MalVal,
	symbolFor,
} from '@/mal/types'
import {reverseEval} from '@/mal/utils'

interface Props {
	value: MalSeq | MalSymbol
}

const props = defineProps<Props>()

const emit = defineEmits<{
	input: [value: MalVal]
	select: [value: MalVal]
	'end-tweak': []
}>()

const isSizeFunc = computed(
	() => isList(props.value) && isSymbolFor(props.value[0], 'vec2/size')
)

const size = computed(() => {
	const value = props.value
	if (isSizeFunc.value) {
		return value as MalSeq[1]
	} else {
		return props.value
	}
})

const ratio = computed(() => {
	const value = props.value
	if (isSizeFunc.value) {
		return (value as MalSeq)[2] as number | false
	} else {
		return false
	}
})

const isValueSeparated = computed(() => isVector(size.value))

const nonReactiveValues = computed(() => {
	if (!isValueSeparated.value) {
		return []
	} else {
		return Array.from(size.value as MalSeq)
	}
})

const evaluated = computed(() => getEvaluated(size.value) as number[])

function onInputElement(index: number, v: MalVal, num: number) {
	if (!isValueSeparated.value) {
		return
	}

	const newSize = cloneExp(size.value as MalSeq)
	newSize[index] = v

	const r = evaluated.value[1] / evaluated.value[0]

	if (ratio.value !== false) {
		const anotherIndex = index === 0 ? 1 : 0

		let anotherValue: MalVal = evaluated.value[anotherIndex]
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

.MalInputSize2d
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
