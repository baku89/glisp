<template>
	<div class="MalInputRect2d">
		<MalExpButton
			v-if="!isValueSeparated"
			:value="value"
			:compact="true"
			@click="$emit('select', $event)"
		/>[
		<template v-if="isValueSeparated">
			<MalInputNumber
				class="MalInputRect2d__el"
				:value="nonReactiveValues[0]"
				@input="onInputElement(0, $event)"
				@select="$emit('select', $event)"
				:compact="true"
			/>
			<MalInputNumber
				class="MalInputRect2d__el"
				:value="nonReactiveValues[1]"
				@input="onInputElement(1, $event)"
				@select="$emit('select', $event)"
				:compact="true"
			/>
			<MalInputNumber
				class="MalInputRect2d__el"
				:value="nonReactiveValues[2]"
				@input="onInputElement(2, $event)"
				@select="$emit('select', $event)"
				:compact="true"
			/>
			<MalInputNumber
				class="MalInputRect2d__el"
				:value="nonReactiveValues[3]"
				@input="onInputElement(3, $event)"
				@select="$emit('select', $event)"
				:compact="true"
			/>
		</template>
		<template v-else>
			<InputNumber
				class="MalInputRect2d__el exp"
				:value="evaluated[0]"
				@input="onInputEvaluatedElement(0, $event)"
			/>
			<InputNumber
				class="MalInputRect2d__el exp"
				:value="evaluated[1]"
				@input="onInputEvaluatedElement(1, $event)"
			/>
			<InputNumber
				class="MalInputRect2d__el exp"
				:value="evaluated[2]"
				@input="onInputEvaluatedElement(2, $event)"
			/>
			<InputNumber
				class="MalInputRect2d__el exp"
				:value="evaluated[3]"
				@input="onInputEvaluatedElement(3, $event)"
			/>
		</template>]
		<InputTranslate :value="evaluated.slice(0, 2)" @input="onInputTranslate" />
	</div>
</template>

<script lang="ts">
import {
	defineComponent,
	ref,
	Ref,
	watch,
	PropType,
	computed,
	isReactive,
	toRef,
	SetupContext
} from '@vue/composition-api'
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
				x instanceof NonReactive && (isSeq(x.value) || isSymbol(x.value))
		}
	},
	setup(props: Props, context: SetupContext) {
		const {
			nonReactiveValues,
			isValueSeparated,
			evaluated,
			onInputElement,
			onInputEvaluatedElement
		} = useNumericVectorUpdator(toRef(props, 'value'), context)

		console.log(nonReactiveValues)

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
			onInputTranslate
		}
	}
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.MalInputRect2d
	display flex
	line-height $input-height

	&__el
		margin 0 0.3em
		width 3em

	&__drag
		position relative
		margin-left 0.5rem
		width 1.2rem
		height @width
		border 1px solid var(--comment)

		&:hover, &.dragging
			background var(--comment)

			&:before, &:after
				background var(--background)

		&:before, &:after
			position absolute
			display block
			background var(--comment)
			content ''

		&:before
			top 2px
			left calc(50% - 0.5px)
			width 1px
			height calc(100% - 4px)

		&:after
			top calc(50% - 0.5px)
			left 2px
			width calc(100% - 4px)
			height 1px
</style>
