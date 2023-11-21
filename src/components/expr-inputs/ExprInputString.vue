<template>
	<div class="ExprInputString">
		<ExprSelectButton
			v-if="isExp"
			:value="value"
			:compact="true"
			@select="emit('select', $event)"
		/>
		<Tq.InputString
			:modelValue="evaluated"
			:validator="validator"
			:class="{exp: isExp}"
			:multiline="multiline"
			@update:modelValue="onInput"
			@end-tweak="emit('end-tweak')"
		/>
	</div>
</template>

<script lang="ts" setup>
import Tq from 'tweeq'
import {computed} from 'vue'

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
	value: string | ExprSeq | ExprSymbol
	validator: (v: string) => string | undefined
	multiline?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
	input: [value: Expr]
	select: [value: Expr]
	'end-tweak': []
}>()

const isExp = computed(() => typeof props.value !== 'string')
const evaluated = computed(() => {
	const ret = getEvaluated(props.value)

	if (typeof ret !== 'string') throw new Error('Expected string')

	return ret
})

function onInput(value: string) {
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
.ExprInputString
	display flex
</style>
@/glis[/reader@/glis[/types@/glis[/utils
