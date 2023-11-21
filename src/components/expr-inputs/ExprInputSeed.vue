<template>
	<div class="ExprInputSeed">
		<ExprInputNumber
			class="ExprInputSeed__input"
			:compact="true"
			:value="value"
			:validator="validator"
			@input="onInput($event.value)"
			@select="$emit('select', $event)"
			@end-tweak="$emit('end-tweak')"
		/>
		<InputSeed class="ExprInputSeed__shuffle" @input="onInput" />
	</div>
</template>

<script lang="ts" setup>
import {ExprSeq, ExprSymbol, Expr} from '@/glisp/types'
import {reverseEval} from '@/glisp/utils'

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

function onInput(value: Expr) {
	let newExp = value
	if (typeof newExp === 'number') {
		// Executes backward evalution
		newExp = reverseEval(newExp, props.value)
	}
	emit('input', newExp)
	emit('end-tweak')
}
</script>

<style lang="stylus">
@import '../style/common.styl'

.ExprInputSeed
	display flex
	align-items center
	line-height $input-height

	&__input
		margin-right $input-horiz-margin
</style>
@/glis[/types@/glis[/utils
