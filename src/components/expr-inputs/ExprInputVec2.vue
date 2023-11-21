<template>
	<div class="ExprInputVec2">
		<ExprSelectButton
			v-if="!isValueSeparated"
			class="ExprInputVec2__exp-button"
			:value="value"
			:compact="true"
			@select="$emit('select', $event)"
		/>
		<template v-if="isValueSeparated">
			<ExprInputNumber
				class="ExprInputVec2__el"
				:value="nonReactiveValues[0]"
				:compact="true"
				@input="onInputElement(0, $event)"
				@select="$emit('select', $event)"
				@end-tweak="$emit('end-tweak')"
			/>
			<ExprInputNumber
				class="ExprInputVec2__el"
				:value="nonReactiveValues[1]"
				:compact="true"
				@input="onInputElement(1, $event)"
				@select="$emit('select', $event)"
				@end-tweak="$emit('end-tweak')"
			/>
		</template>
		<template v-else>
			<Tq.InputNumber
				class="ExprInputVec2__el exp"
				:modelValue="evaluated[0]"
				@update:modelValue="onInputEvaluatedElement(0, $event)"
				@end-tweak="$emit('end-tweak')"
			/>
			<Tq.InputNumber
				class="ExprInputVec2__el exp"
				:modelValue="evaluated[1]"
				@update:modelValue="onInputEvaluatedElement(1, $event)"
				@end-tweak="$emit('end-tweak')"
			/>
		</template>

		<InputTranslate
			class="ExprInputVec2__translate"
			:value="evaluated"
			@input="onInputTranslate"
			@end-tweak="$emit('end-tweak')"
		/>
	</div>
</template>

<script lang="ts" setup>
import Tq from 'tweeq'
import {toRef} from 'vue'

import InputTranslate from '@/components/inputs/InputTranslate.vue'
import {useNumericVectorUpdator} from '@/components/use'
import {ExprSeq, ExprSymbol, Expr} from '@/glisp/types'
import {reverseEval} from '@/glisp/utils'

import ExprSelectButton from './ExprSelectButton.vue'
import ExprInputNumber from './ExprInputNumber.vue'

interface Props {
	value: ExprSeq | ExprSymbol
}

const props = defineProps<Props>()

const emit = defineEmits<{
	input: [value: Expr]
	'end-tweak': []
}>()

const {
	nonReactiveValues,
	isValueSeparated,
	evaluated,
	onInputElement,
	onInputEvaluatedElement,
} = useNumericVectorUpdator(toRef(props, 'value'), emit)

function onInputTranslate(value: number[]) {
	const newExp = reverseEval(value, props.value)
	emit('input', newExp)
}
</script>

<style lang="stylus">
@import '../style/common.styl'

.ExprInputVec2
	display flex
	align-items center
	line-height $input-height

	&__el, &__exp-button
		margin-right 0.6rem
</style>
@/glis[/types@/glis[/utils
