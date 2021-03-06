<template>
	<div class="MalInputVec2">
		<MalExpButton
			class="MalInputVec2__exp-button"
			v-if="!isValueSeparated"
			:value="value"
			:compact="true"
			@select="$emit('select', $event)"
		/>
		<template v-if="isValueSeparated">
			<MalInputNumber
				class="MalInputVec2__el"
				:value="nonReactiveValues[0]"
				:compact="true"
				@input="onInputElement(0, $event)"
				@select="$emit('select', $event)"
				@end-tweak="$emit('end-tweak')"
			/>
			<MalInputNumber
				class="MalInputVec2__el"
				:value="nonReactiveValues[1]"
				:compact="true"
				@input="onInputElement(1, $event)"
				@select="$emit('select', $event)"
				@end-tweak="$emit('end-tweak')"
			/>
		</template>
		<template v-else>
			<InputNumber
				class="MalInputVec2__el exp"
				:value="evaluated[0]"
				@input="onInputEvaluatedElement(0, $event)"
				@end-tweak="$emit('end-tweak')"
			/>
			<InputNumber
				class="MalInputVec2__el exp"
				:value="evaluated[1]"
				@input="onInputEvaluatedElement(1, $event)"
				@end-tweak="$emit('end-tweak')"
			/>
		</template>

		<InputTranslate
			class="MalInputVec2__translate"
			:value="evaluated"
			@input="onInputTranslate"
			@end-tweak="$emit('end-tweak')"
		/>
	</div>
</template>

<script lang="ts">
import {defineComponent, toRef, SetupContext} from '@vue/composition-api'
import {MalSeq, isSeq, MalSymbol, isSymbol} from '@/mal/types'
import MalInputNumber from './MalInputNumber.vue'
import MalExpButton from './MalExpButton.vue'
import {InputNumber, InputTranslate} from '@/components/inputs'
import {useNumericVectorUpdator} from '@/components/use'
import {reverseEval} from '@/mal/utils'
import {NonReactive, nonReactive} from '@/utils'

interface Props {
	value: NonReactive<MalSeq | MalSymbol>
}

export default defineComponent({
	name: 'MalInputVec2',
	components: {MalInputNumber, MalExpButton, InputNumber, InputTranslate},
	props: {
		value: {
			required: true,
			validator: x =>
				x instanceof NonReactive && (isSeq(x.value) || isSymbol(x.value)),
		},
	},
	setup(props: Props, context: SetupContext) {
		const {
			nonReactiveValues,
			isValueSeparated,
			evaluated,
			onInputElement,
			onInputEvaluatedElement,
		} = useNumericVectorUpdator(toRef(props, 'value'), context)

		function onInputTranslate(value: number[]) {
			const newExp = reverseEval(value, props.value.value)
			context.emit('input', nonReactive(newExp))
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
@import '../style/common.styl'

.MalInputVec2
	display flex
	align-items center
	line-height $input-height

	&__el, &__exp-button
		margin-right 0.6rem
</style>
