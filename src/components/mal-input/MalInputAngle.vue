<template>
	<div class="MalInputAngle">
		<MalInputNumber
			class="MalInputAngle__input"
			:value="value"
			@input="onInput"
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
import {isList, MalNodeSeq, MalSymbol, M_EVAL} from '@/mal/types'
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
			if (typeof props.value === 'number') {
				return props.value as number
			} else if (isList(props.value) && M_EVAL in props.value) {
				return props.value[M_EVAL] as number
			}
			return 0
		})

		const onInput = (_value: number) => {
			// Executes backward evalution
			const value = reverseEval(_value, props.value)
			context.emit('input', value)
		}

		return {
			evaluated,
			onInput
		}
	}
})
</script>

<style lang="stylus" scoped>
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
