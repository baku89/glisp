<template>
	<div class="ExprInputBoolean">
		<InputBoolean
			class="ExprInputBoolean__input"
			:class="{exp: isExp}"
			:value="evaluated"
			@input="onInput"
		/>
		<ExprSelectButton
			v-if="isExp"
			:value="value"
			@select="$emit('select', $event)"
		/>
	</div>
</template>

<script lang="ts" setup>
import {computed} from 'vue'

import {InputBoolean} from '@/components/inputs'
import {
	Expr,
	ExprSeq,
	ExprSymbol,
	getEvaluated,
	markParent,
	reverseEval,
} from '@/glisp'

import ExprSelectButton from './ExprSelectButton.vue'

interface Props {
	value: boolean | ExprSeq | ExprSymbol
}
const props = defineProps<Props>()

const emit = defineEmits<{
	input: [value: Expr]
	select: [value: Expr]
	'end-tweak': []
}>()

const isExp = computed(() => typeof props.value !== 'boolean')
const evaluated = computed(() => (getEvaluated(props.value) ? true : false))

function onInput(value: boolean) {
	let newValue: Expr = value

	if (isExp.value) {
		newValue = reverseEval(value, props.value)
		markParent(newValue)
	}

	emit('input', newValue)
	emit('end-tweak')
}
</script>

<style lang="stylus">
.ExprInputBoolean
	display flex

	&__input
		margin-right 0.5rem
</style>
@/glis[/reader@/glis[/types@/glis[/utils
