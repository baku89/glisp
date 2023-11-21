<template>
	<div class="MalInputBoolean">
		<InputBoolean
			class="MalInputBoolean__input"
			:class="{exp: isExp}"
			:value="evaluated"
			@input="onInput"
		/>
		<MalExpButton
			v-if="isExp"
			:value="value"
			@select="$emit('select', $event)"
		/>
	</div>
</template>

<script lang="ts" setup>
import {computed} from 'vue'

import {InputBoolean} from '@/components/inputs'
import {markParent} from '@/glisp/reader'
import {getEvaluated, MalSeq, ExprSymbol, Expr} from '@/glisp/types'
import {reverseEval} from '@/glisp/utils'

import MalExpButton from './MalExpButton.vue'

interface Props {
	value: boolean | MalSeq | ExprSymbol
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
.MalInputBoolean
	display flex

	&__input
		margin-right 0.5rem
</style>
@/glis[/reader@/glis[/types@/glis[/utils
