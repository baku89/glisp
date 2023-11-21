<template>
	<div class="MalInputString">
		<MalExpButton
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
			@input="onInput"
			@end-tweak="emit('end-tweak')"
		/>
	</div>
</template>

<script lang="ts" setup>
import Tq from 'tweeq'
import {computed} from 'vue'

import {reconstructTree} from '@/mal/reader'
import {getEvaluated, MalSeq, MalSymbol, MalVal} from '@/mal/types'
import {reverseEval} from '@/mal/utils'

import MalExpButton from './MalExpButton.vue'

interface Props {
	value: string | MalSeq | MalSymbol
	validator: (v: string) => string | undefined
	multiline?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
	input: [value: MalVal]
	select: [value: MalVal]
	'end-tweak': []
}>()

const isExp = computed(() => typeof props.value !== 'string')
const evaluated = computed(() => {
	const ret = getEvaluated(props.value)

	if (typeof ret !== 'string') throw new Error('Expected string')

	return ret
})

function onInput(value: string) {
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
.MalInputString
	display flex
</style>
