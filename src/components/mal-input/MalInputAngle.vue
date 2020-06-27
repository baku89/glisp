<template>
	<div class="MalInputAngle">
		<MalInputNumber
			class="MalInputAngle__input"
			:compact="true"
			:value="value"
			@input="onInput"
			@select="$emit('select', $event)"
			:validator="validator"
		/>
		<InputRotery
			class="MalInputAngle__rotery"
			:value="evaluated"
			@input="onInput"
		/>
	</div>
</template>

<script lang="ts">
import {defineComponent, PropType, computed} from '@vue/composition-api'
import MalInputNumber from './MalInputNumber.vue'
import InputComponents from '@/components/inputs'
import {MalNodeSeq, MalSymbol, MalVal, getEvaluated} from '@/mal/types'
import {reverseEval} from '@/mal-utils'

export default defineComponent({
	name: 'MalInputAngle',
	components: {MalInputNumber, InputRotery: InputComponents.InputRotery},
	props: {
		value: {
			type: [Number, Array, Object] as PropType<
				number | MalNodeSeq | MalSymbol
			>,
			required: true
		},
		validator: {
			type: Function as PropType<(v: number) => number | null>,
			required: false
		}
	},
	setup(props, context) {
		const evaluated = computed(() => {
			return getEvaluated(props.value) as number
		})

		const onInput = (_value: MalVal) => {
			let value = _value
			if (typeof value === 'number') {
				// Executes backward evalution
				value = reverseEval(_value, props.value)
			}
			context.emit('input', value)
		}

		return {
			evaluated,
			onInput
		}
	}
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.MalInputAngle
	display flex
	align-items center
	line-height $input-height

	&__input
		margin-right 0.5em

	&__rotery
		margin-left 0.5rem
</style>
