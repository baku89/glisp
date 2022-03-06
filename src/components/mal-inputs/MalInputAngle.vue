<template>
	<div class="MalInputAngle">
		<MalInputNumber
			class="MalInputAngle__input"
			:compact="true"
			:value="value"
			:validator="validator"
			@input="$emit('input', $event)"
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

<script lang="ts">
import {computed, defineComponent, PropType} from 'vue'

import {InputRotery} from '@/components/inputs'
import {MalList, MalNumber, MalSymbol, MalVal} from '@/mal/types'
import {reverseEval} from '@/mal/utils'

import MalInputNumber from './MalInputNumber.vue'

export default defineComponent({
	name: 'MalInputAngle',
	components: {MalInputNumber, InputRotery},
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
		const evaluated = computed(() => {
			const evaluated = props.value.evaluated
			return MalNumber.is(evaluated) ? evaluated : NaN
		})

		function onInput(value: MalVal) {
			let newExp: MalVal = value
			if (typeof newExp === 'number') {
				// Executes backward evalution
				newExp = reverseEval(newExp, props.value)
			}
			context.emit('input', newExp)
		}

		return {
			evaluated,
			onInput,
		}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'

.MalInputAngle
	display flex
	align-items center
	line-height $input-height

	&__input
		margin-right $input-horiz-margin
</style>
