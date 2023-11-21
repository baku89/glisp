<template>
	<div class="MalInputAngle">
		<MalInputNumber
			class="MalInputAngle__input"
			:compact="true"
			:value="value"
			:validator="validator"
			@input="onInput($event.value)"
			@select="$emit('select', $event)"
			@end-tweak="$emit('end-tweak')"
		/>
		<InputRotery
			class="MalInputAngle__rotery"
			:value="evaluated"
			@input="onInput"
			@end-tweak="$emit('end-tweak')"
		/>
	</div>
</template>

<script lang="ts" setup>
import {computed} from 'vue'

import {getEvaluated, MalSeq, MalSymbol, MalVal} from '@/mal/types'
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

const evaluated = computed(() => {
	return getEvaluated(props.value) as number
})

function onInput(value: MalVal) {
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

.MalInputAngle
	display flex
	align-items center
	line-height $input-height

	&__input
		margin-right $input-horiz-margin
</style>
