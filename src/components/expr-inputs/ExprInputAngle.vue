<template>
	<div class="ExprInputAngle">
		<ExprInputNumber
			class="ExprInputAngle__input"
			:compact="true"
			:value="value"
			:validator="validator"
			@input="onInput($event.value)"
			@select="$emit('select', $event)"
			@end-tweak="$emit('end-tweak')"
		/>
		<InputRotery
			class="ExprInputAngle__rotery"
			:value="evaluated"
			@input="onInput"
			@end-tweak="$emit('end-tweak')"
		/>
	</div>
</template>

<script lang="ts" setup>
import {computed} from 'vue'

import {Expr, ExprSeq, ExprSymbol, getEvaluated, reverseEval} from '@/glisp'

interface Props {
	value: number | ExprSeq | ExprSymbol
	validator: (v: number) => number | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
	input: [value: Expr]
	select: [value: Expr]
	'end-tweak': []
}>()

const evaluated = computed(() => {
	return getEvaluated(props.value) as number
})

function onInput(value: Expr) {
	let newExp = value
	if (typeof newExp === 'number') {
		// Executes backward evalution
		newExp = reverseEval(newExp, props.value)
	}
	emit('input', newExp)
}
</script>

<style lang="stylus">
@import '../style/common.styl'

.ExprInputAngle
	display flex
	align-items center
	line-height $input-height

	&__input
		margin-right $input-horiz-margin
</style>
@/glis[/types@/glis[/utils
