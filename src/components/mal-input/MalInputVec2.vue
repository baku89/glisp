<template>
	<div class="MalInputVec2">
		<MalExpButton
			v-if="!isValueSeparated"
			:value="value"
			:compact="true"
			@click="$emit('select', $event)"
		/>[
		<template v-if="isValueSeparated">
			<MalInputNumber
				class="MalInputVec2__el"
				:value="value[0]"
				:compact="true"
				@input="onInputElement(0, $event)"
				@select="$emit('select', $event)"
			/>
			<MalInputNumber
				class="MalInputVec2__el"
				:value="value[1]"
				:compact="true"
				@input="onInputElement(1, $event)"
				@select="$emit('select', $event)"
			/>
		</template>
		<template v-else>
			<InputNumber
				class="MalInputVec2__el exp"
				:value="evaluated[0]"
				@input="onInputEvaluatedElement(0, $event)"
			/>
			<InputNumber
				class="MalInputVec2__el exp"
				:value="evaluated[1]"
				@input="onInputEvaluatedElement(1, $event)"
			/>
		</template>
		]
		<InputTranslate :value="evaluated" @input="onInputTranslate" />
	</div>
</template>

<script lang="ts">
import {
	defineComponent,
	ref,
	Ref,
	PropType,
	computed,
	toRef
} from '@vue/composition-api'
import {getEvaluated, MalVal, isVector, MalSeq} from '@/mal/types'
import MalInputNumber from './MalInputNumber.vue'
import MalExpButton from './MalExpButton.vue'
import {InputNumber, InputTranslate} from '@/components/inputs'
import {useDraggable, useNumericVectorUpdator} from '@/components/use'
import {reverseEval} from '@/mal/utils'

export default defineComponent({
	name: 'MalInputVec2',
	components: {MalInputNumber, MalExpButton, InputNumber, InputTranslate},
	props: {
		value: {
			type: [Array, Object] as PropType<MalVal>,
			required: true
		}
	},
	setup(props, context) {
		const {
			isValueSeparated,
			evaluated,
			onInputElement,
			onInputEvaluatedElement
		} = useNumericVectorUpdator(toRef(props, 'value'), context)

		function onInputTranslate(value: number[]) {
			const newExp = reverseEval(value, props.value)
			context.emit('input', newExp)
		}

		return {
			isValueSeparated,
			evaluated,
			onInputElement,
			onInputEvaluatedElement,
			onInputTranslate
		}
	}
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.MalInputVec2
	display flex
	line-height $input-height

	&__el
		margin 0 0.3rem
</style>
