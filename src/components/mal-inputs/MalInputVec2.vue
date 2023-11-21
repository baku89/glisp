<template>
	<div class="MalInputVec2">
		<MalExpButton
			v-if="!isValueSeparated"
			class="MalInputVec2__exp-button"
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

<script lang="ts" setup>
import {toRef} from 'vue'

import InputNumber from '@/components/inputs/InputNumber.vue'
import InputTranslate from '@/components/inputs/InputTranslate.vue'
import {useNumericVectorUpdator} from '@/components/use'
import {MalSeq, MalSymbol, MalVal} from '@/mal/types'
import {reverseEval} from '@/mal/utils'

import MalExpButton from './MalExpButton.vue'
import MalInputNumber from './MalInputNumber.vue'

interface Props {
	value: MalSeq | MalSymbol
}

const props = defineProps<Props>()

const emit = defineEmits<{
	input: [value: MalVal]
	'end-tweak': []
}>()

const {
	nonReactiveValues,
	isValueSeparated,
	evaluated,
	onInputElement,
	onInputEvaluatedElement,
} = useNumericVectorUpdator(toRef(props, 'value'), emit)

function onInputTranslate(value: number[]) {
	const newExp = reverseEval(value, props.value)
	emit('input', newExp)
}
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
