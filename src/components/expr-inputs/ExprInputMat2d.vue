<template>
	<div class="ExprInputMat2d">
		<ExprSelectButton
			v-if="!isValueSeparated"
			:value="value"
			@select="$emit('select', $event)"
		/>
		<div v-if="isValueSeparated" class="ExprInputMat2d__value">
			<ExprInputNumber
				class="ExprInputMat2d__el"
				:value="nonReactiveValues[0]"
				:compact="true"
				@input="onInputElement(0, $event)"
				@select="$emit('select', $event)"
				@end-tweak="$emit('end-tweak')"
			/>
			<ExprInputNumber
				class="ExprInputMat2d__el"
				:value="nonReactiveValues[2]"
				:compact="true"
				@input="onInputElement(2, $event)"
				@select="$emit('select', $event)"
				@end-tweak="$emit('end-tweak')"
			/>
			<ExprInputNumber
				class="ExprInputMat2d__el t"
				:value="nonReactiveValues[4]"
				:compact="true"
				@input="onInputElement(4, $event)"
				@select="$emit('select', $event)"
				@end-tweak="$emit('end-tweak')"
			/>
			<ExprInputNumber
				class="ExprInputMat2d__el"
				:value="nonReactiveValues[1]"
				:compact="true"
				@input="onInputElement(1, $event)"
				@select="$emit('select', $event)"
				@end-tweak="$emit('end-tweak')"
			/>
			<ExprInputNumber
				class="ExprInputMat2d__el"
				:value="nonReactiveValues[3]"
				:compact="true"
				@input="onInputElement(3, $event)"
				@select="$emit('select', $event)"
				@end-tweak="$emit('end-tweak')"
			/>
			<ExprInputNumber
				class="ExprInputMat2d__el t"
				:value="nonReactiveValues[5]"
				:compact="true"
				@input="onInputElement(5, $event)"
				@select="$emit('select', $event)"
				@end-tweak="$emit('end-tweak')"
			/>
		</div>
		<InputTranslate
			v-if="isValueSeparated"
			:value="evaluated.slice(4)"
			@input="onInputTranslate"
			@end-tweak="$emit('end-tweak')"
		/>
	</div>
</template>

<script lang="ts" setup>
import {toRef} from 'vue'

import {useNumericVectorUpdator} from '@/components/use'
import {Expr, ExprSeq, ExprSymbol, reverseEval} from '@/glisp'

interface Props {
	value: ExprSeq | ExprSymbol
}

const props = defineProps<Props>()

const emit = defineEmits<{
	input: [value: Expr]
	select: [value: ExprSeq | ExprSymbol]
	'end-tweak': []
}>()

const {nonReactiveValues, isValueSeparated, evaluated, onInputElement} =
	useNumericVectorUpdator(toRef(props, 'value'), emit)

function onInputTranslate(value: number[]) {
	const newValue = [...evaluated.value.slice(0, 4), ...value]
	const newExp = reverseEval(newValue, props.value)
	emit('input', newExp)
}
</script>

<style lang="stylus">
@import '../style/common.styl'

.ExprInputMat2d
	display flex
	align-items center
	line-height $input-height

	&__value
		position relative
		display grid
		margin-right $input-horiz-margin
		grid-template-columns auto auto auto
		grid-row-gap 0.4rem
		grid-column-gap 0.3rem

	&__el
		width 4rem
</style>
@/glis[/types@/glis[/utils
