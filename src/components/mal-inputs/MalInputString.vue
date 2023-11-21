<template>
	<div class="MalInputString">
		<MalExpButton
			v-if="isExp"
			:value="value"
			:compact="true"
			@select="$emit('select', $event)"
		/>
		<InputString
			:value="evaluated"
			:validator="validator"
			:class="{exp: isExp}"
			:multiline="multiline"
			@input="onInput"
			@end-tweak="$emit('end-tweak')"
		/>
	</div>
</template>

<script lang="ts" setup>
import {computed} from 'vue'

import {InputString} from '@/components/inputs'
import {reconstructTree} from '@/mal/reader'
import {getEvaluated, MalSeq, MalSymbol, MalVal} from '@/mal/types'
import {reverseEval} from '@/mal/utils'

import MalExpButton from './MalExpButton.vue'

interface Props {
	value: string | MalSeq | MalSymbol
	validator: (v: string) => string | null
	multiline?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
	input: [value: MalVal]
	'end-tweak': []
}>()

const isExp = computed(() => typeof props.value !== 'string')
const evaluated = computed(() => getEvaluated(props.value))

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
