<template>
	<div class="MalInputSeed">
		<MalInputNumber
			class="MalInputSeed__input"
			:compact="true"
			:value="value"
			@input="onInput($event.value)"
			@select="$emit('select', $event)"
			:validator="validator"
		/>
		<InputSeed class="MalInputSeed__shuffle" @input="onInput" />
	</div>
</template>

<script lang="ts">
import {defineComponent, SetupContext} from '@vue/composition-api'
import MalInputNumber from './MalInputNumber.vue'
import {InputSeed} from '@/components/inputs'
import {MalSeq, MalSymbol, MalVal} from '@/mal/types'
import {reverseEval} from '@/mal/utils'
import {NonReactive, nonReactive} from '@/utils'

interface Props {
	value: NonReactive<number | MalSeq | MalSymbol>
	validator: (v: number) => number | null
}

export default defineComponent({
	name: 'MalInputSeed',
	components: {MalInputNumber, InputSeed},
	props: {
		value: {
			required: true,
			validator: x => x instanceof NonReactive,
		},
		validator: {
			required: false,
		},
	},
	setup(props: Props, context: SetupContext) {
		function onInput(value: MalVal) {
			let newExp = value
			if (typeof newExp === 'number') {
				// Executes backward evalution
				newExp = reverseEval(newExp, props.value.value)
			}
			context.emit('input', nonReactive(newExp))
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
		margin-right 0.5em

	&__shuffle
		margin-left 0.5rem
</style>
