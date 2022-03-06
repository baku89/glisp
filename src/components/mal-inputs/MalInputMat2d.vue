<template>
	<div class="MalInputMat2d">
		<MalExpButton
			v-if="!isValueSeparated"
			:value="value"
			@select="$emit('select', $event)"
		/>
		<div class="MalInputMat2d__value" v-if="isValueSeparated">
			<MalInputNumber
				class="MalInputMat2d__el"
				:value="nonReactiveValues[0]"
				:compact="true"
				@input="onInputElement(0, $event)"
				@select="$emit('select', $event)"
				@end-tweak="$emit('end-tweak')"
			/>
			<MalInputNumber
				class="MalInputMat2d__el"
				:value="nonReactiveValues[2]"
				:compact="true"
				@input="onInputElement(2, $event)"
				@select="$emit('select', $event)"
				@end-tweak="$emit('end-tweak')"
			/>
			<MalInputNumber
				class="MalInputMat2d__el t"
				:value="nonReactiveValues[4]"
				:compact="true"
				@input="onInputElement(4, $event)"
				@select="$emit('select', $event)"
				@end-tweak="$emit('end-tweak')"
			/>
			<MalInputNumber
				class="MalInputMat2d__el"
				:value="nonReactiveValues[1]"
				:compact="true"
				@input="onInputElement(1, $event)"
				@select="$emit('select', $event)"
				@end-tweak="$emit('end-tweak')"
			/>
			<MalInputNumber
				class="MalInputMat2d__el"
				:value="nonReactiveValues[3]"
				:compact="true"
				@input="onInputElement(3, $event)"
				@select="$emit('select', $event)"
				@end-tweak="$emit('end-tweak')"
			/>
			<MalInputNumber
				class="MalInputMat2d__el t"
				:value="nonReactiveValues[5]"
				:compact="true"
				@input="onInputElement(5, $event)"
				@select="$emit('select', $event)"
				@end-tweak="$emit('end-tweak')"
			/>
		</div>
		<InputTranslate
			v-if="isValueSeparated"
			:value="evaluated.slice(4)"
			@input="onInputTranslate"
			@end-tweak="$emit('end-tweak')"
		/>
	</div>
</template>

<script lang="ts">
import {defineComponent, PropType, toRef} from 'vue'

import {InputTranslate} from '@/components/inputs'
import {useNumericVectorUpdator} from '@/components/use'
import {MalSeq, MalSymbol} from '@/mal/types'
import {reverseEval} from '@/mal/utils'

import MalExpButton from './MalExpButton.vue'
import MalInputNumber from './MalInputNumber.vue'

export default defineComponent({
	name: 'MalInputMat2d',
	components: {MalInputNumber, MalExpButton, InputTranslate},
	props: {
		value: {
			type: Object as PropType<MalSeq | MalSymbol>,
			required: true,
		},
	},
	setup(props, context) {
		const {
			nonReactiveValues,
			isValueSeparated,
			evaluated,
			onInputElement,
			onInputEvaluatedElement,
		} = useNumericVectorUpdator(toRef(props, 'value'), context)

		function onInputTranslate(value: number[]) {
			const newValue = [...evaluated.value.slice(0, 4), ...value]
			const newExp = reverseEval(newValue, props.value)
			context.emit('input', newExp)
		}

		return {
			nonReactiveValues,
			isValueSeparated,
			evaluated,
			onInputElement,
			onInputEvaluatedElement,
			onInputTranslate,
		}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'

.MalInputMat2d
	display flex
	align-items center
	line-height $input-height

	&__value
		position relative
		display grid
		margin-right $input-horiz-margin
		grid-template-columns auto auto auto
		grid-row-gap 0.4rem
		grid-column-gap 0.3rem

	&__el
		width 4rem
</style>
