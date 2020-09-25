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

<script lang="ts">
import {defineComponent, computed, PropType} from 'vue'
import MalInputNumber from './MalInputNumber.vue'
import {InputRotery} from '@/components/inputs'
import {MalSeq, MalSymbol, MalVal, getEvaluated} from '@/mal/types'
import {reverseEval} from '@/mal/utils'
import {NonReactive, nonReactive} from '@/utils'

export default defineComponent({
	name: 'MalInputAngle',
	components: {MalInputNumber, InputRotery},
	props: {
		value: {
			type: Object as PropType<NonReactive<number | MalSeq | MalSymbol>>,
			required: true,
			validator: (x: NonReactive<number | MalSeq | MalSymbol>) =>
				x instanceof NonReactive,
		},
		validator: {
			required: false,
		},
	},
	setup(props, context) {
		const evaluated = computed(() => {
			return getEvaluated(props.value.value) as number
		})

		function onInput(value: MalVal) {
			let newExp = value
			if (typeof newExp === 'number') {
				// Executes backward evalution
				newExp = reverseEval(newExp, props.value.value)
			}
			context.emit('input', nonReactive(newExp))
		}

		return {
			evaluated,
			onInput,
		}
	},
})
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
