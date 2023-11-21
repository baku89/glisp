<template>
	<div class="MalInputRect2d">
		<MalExpButton
			v-if="!isValueSeparated"
			class="MalInputRect2d__exp-button"
			:value="value"
			:compact="true"
			@select="$emit('select', $event)"
		/>
		<template v-if="isValueSeparated">
			<MalInputNumber
				class="MalInputRect2d__el"
				:value="nonReactiveValues[0]"
				:compact="true"
				@input="onInputElement(0, $event)"
				@select="$emit('select', $event)"
				@end-tweak="$emit('end-tweak')"
			/>
			<MalInputNumber
				class="MalInputRect2d__el"
				:value="nonReactiveValues[1]"
				:compact="true"
				@input="onInputElement(1, $event)"
				@select="$emit('select', $event)"
				@end-tweak="$emit('end-tweak')"
			/>
			<MalInputNumber
				class="MalInputRect2d__el"
				:value="nonReactiveValues[2]"
				:compact="true"
				@input="onInputElement(2, $event)"
				@select="$emit('select', $event)"
				@end-tweak="$emit('end-tweak')"
			/>
			<MalInputNumber
				class="MalInputRect2d__el"
				:value="nonReactiveValues[3]"
				:compact="true"
				@input="onInputElement(3, $event)"
				@select="$emit('select', $event)"
				@end-tweak="$emit('end-tweak')"
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

<script lang="ts" setup>
import {toRef} from 'vue'

import {useNumericVectorUpdator} from '@/components/use'
import {MalSeq, MalSymbol, MalVal} from '@/mal/types'
import {reverseEval} from '@/mal/utils'

interface Props {
	value: MalSeq | MalSymbol
}

const props = defineProps<Props>()

const emit = defineEmits<{
	input: [MalVal]
}>()

const {
	nonReactiveValues,
	isValueSeparated,
	evaluated,
	onInputElement,
	onInputEvaluatedElement,
} = useNumericVectorUpdator(toRef(props, 'value'), emit)

function onInputTranslate(value: number[]) {
	const newValue = [...value, ...evaluated.value.slice(2)]
	const newExp = reverseEval(newValue, props.value)
	emit('input', newExp)
}
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
