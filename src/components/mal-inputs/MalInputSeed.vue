<template>
	<div class="MalInputSeed">
		<MalInputNumber
			class="MalInputSeed__input"
			:compact="true"
			:value="value"
			:validator="validator"
			@input="onInput($event.value)"
			@select="$emit('select', $event)"
			@end-tweak="$emit('end-tweak')"
		/>
		<InputSeed class="MalInputSeed__shuffle" @input="onInput" />
	</div>
</template>

<script lang="ts" setup>
import {MalSeq, MalSymbol, MalVal} from '@/mal/types'
import {reverseEval} from '@/mal/utils'

interface Props {
	value: number | MalSeq | MalSymbol
	validator: (v: number) => number | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
	input: [value: MalVal]
	select: [value: MalVal]
	'end-tweak': []
}>()

function onInput(value: MalVal) {
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

.MalInputSeed
	display flex
	align-items center
	line-height $input-height

	&__input
		margin-right $input-horiz-margin
</style>
