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

<script lang="ts">
import {defineComponent, PropType} from 'vue'
import MalInputNumber from './MalInputNumber.vue'
import {InputSeed} from '@/components/inputs'
import {MalSeq, MalSymbol, MalVal} from '@/mal/types'
import {reverseEval} from '@/mal/utils'

export default defineComponent({
	name: 'MalInputSeed',
	components: {MalInputNumber, InputSeed},
	props: {
		value: {
			type: [Number, Object] as PropType<number | MalSeq | MalSymbol>,
			required: true,
		},
		validator: {
			required: false,
		},
	},
	setup(props, context) {
		function onInput(value: MalVal) {
			let newExp = value
			if (typeof newExp === 'number') {
				// Executes backward evalution
				newExp = reverseEval(newExp, props.value)
			}
			context.emit('input', newExp)
			context.emit('end-tweak')
		}

		return {
			onInput,
		}
	},
})
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
