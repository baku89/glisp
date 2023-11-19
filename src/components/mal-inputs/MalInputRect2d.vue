<template>
	<div class="MalInputRect2d">
		<MalExpButton
			class="MalInputRect2d__exp-button"
			v-if="!isValueSeparated"
			:value="value"
			:compact="true"
			@select="$emit('select', $event)"
		/>
		<template v-if="isValueSeparated">
			<MalInputNumber
				class="MalInputRect2d__el"
				:value="nonReactiveValues[0]"
				@input="onInputElement(0, $event)"
				@select="$emit('select', $event)"
				@end-tweak="$emit('end-tweak')"
				:compact="true"
			/>
			<MalInputNumber
				class="MalInputRect2d__el"
				:value="nonReactiveValues[1]"
				@input="onInputElement(1, $event)"
				@select="$emit('select', $event)"
				@end-tweak="$emit('end-tweak')"
				:compact="true"
			/>
			<MalInputNumber
				class="MalInputRect2d__el"
				:value="nonReactiveValues[2]"
				@input="onInputElement(2, $event)"
				@select="$emit('select', $event)"
				@end-tweak="$emit('end-tweak')"
				:compact="true"
			/>
			<MalInputNumber
				class="MalInputRect2d__el"
				:value="nonReactiveValues[3]"
				@input="onInputElement(3, $event)"
				@select="$emit('select', $event)"
				@end-tweak="$emit('end-tweak')"
				:compact="true"
			/>
		</template>
		<template v-else>
			<InputNumber
				class="MalInputRect2d__el exp"
				:value="evaluated[0]"
				@input="onInputEvaluatedElement(0, $event)"
				@end-tweak="$emit('end-tweak')"
			/>
			<InputNumber
				class="MalInputRect2d__el exp"
				:value="evaluated[1]"
				@input="onInputEvaluatedElement(1, $event)"
				@end-tweak="$emit('end-tweak')"
			/>
			<InputNumber
				class="MalInputRect2d__el exp"
				:value="evaluated[2]"
				@input="onInputEvaluatedElement(2, $event)"
				@end-tweak="$emit('end-tweak')"
			/>
			<InputNumber
				class="MalInputRect2d__el exp"
				:value="evaluated[3]"
				@input="onInputEvaluatedElement(3, $event)"
				@end-tweak="$emit('end-tweak')"
			/>
		</template>
		<InputTranslate
			class="MalInputRect2d__translate"
			:value="evaluated.slice(0, 2)"
			@input="onInputTranslate"
			@end-tweak="$emit('end-tweak')"
		/>
	</div>
</template>

<script lang="ts">
import {defineComponent, toRef, SetupContext} from 'vue'
import {InputNumber, InputTranslate} from '@/components/inputs'
import MalInputNumber from './MalInputNumber.vue'
import MalExpButton from './MalExpButton.vue'
import {useNumericVectorUpdator} from '@/components/use'
import {reverseEval} from '@/mal/utils'
import {NonReactive, nonReactive} from '@/utils'
import {isSeq, MalSeq, MalSymbol, isSymbol} from '@/mal/types'

interface Props {
	value: NonReactive<MalSeq | MalSymbol>
}

export default defineComponent({
	name: 'MalInputRect2d',
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
			const newValue = [...value, ...evaluated.value.slice(2)]
			const newExp = reverseEval(newValue, props.value.value)
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

.MalInputRect2d
	display flex
	align-items center
	line-height $input-height

	&__exp-button
		margin-right 0.6rem

	&__el
		margin-left 0.2em
		width 3em

		&:first-child
			margin-left 0

	&__translate
		margin-left $input-horiz-margin
</style>
