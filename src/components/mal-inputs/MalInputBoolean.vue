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
import {reconstructTree} from '@/mal/reader'
import {getEvaluated, MalSeq, MalSymbol, MalVal} from '@/mal/types'
import {reverseEval} from '@/mal/utils'

import MalExpButton from './MalExpButton.vue'

interface Props {
	value: boolean | MalSeq | MalSymbol
}
const props = defineProps<Props>()

const emit = defineEmits<{
	input: [value: MalVal]
	select: [value: MalVal]
	'end-tweak': []
}>()

const isExp = computed(() => typeof props.value !== 'boolean')
const evaluated = computed(() => (getEvaluated(props.value) ? true : false))

function onInput(value: boolean) {
	let newValue: MalVal = value

	if (isExp.value) {
		newValue = reverseEval(value, props.value)
		reconstructTree(newValue)
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
