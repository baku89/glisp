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

import {InputSeed} from '@/components/inputs'
import {MalList, MalNumber, MalSymbol, MalVal} from '@/mal/types'
import {reverseEval} from '@/mal/utils'

import MalInputNumber from './MalInputNumber.vue'

export default defineComponent({
	name: 'MalInputSeed',
	components: {MalInputNumber, InputSeed},
	props: {
		value: {
			type: Object as PropType<MalNumber | MalList | MalSymbol>,
			required: true,
		},
		validator: {
			required: false,
		},
	},
	setup(props, context) {
		function onInput(value: MalVal) {
			let newExp: MalVal = value

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
