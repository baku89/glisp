<template>
	<div class="MalInputMat2d">
		<MalExpButton
			v-if="!isValueSeparated"
			:value="value"
			@select="$emit('select', $event)"
		/>
		<div class="MalInputMat2d__value" v-if="isValueSeparated">
			<div class="MalInputMat2d__split">
				⎥
				<br />⎥ <br />⎥
			</div>
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
import {defineComponent, toRef, SetupContext} from '@vue/composition-api'
import {InputNumber, InputTranslate} from '@/components/inputs'
import MalInputNumber from './MalInputNumber.vue'
import MalExpButton from './MalExpButton.vue'
import {useNumericVectorUpdator} from '@/components/use'
import {reverseEval} from '@/mal/utils'
import {NonReactive, nonReactive} from '@/utils'
import {isSeq, MalSeq, isSymbol, MalSymbol} from '@/mal/types'

interface Props {
	value: NonReactive<MalSeq | MalSymbol>
}

export default defineComponent({
	name: 'MalInputMat2d',
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
			const newValue = [...evaluated.value.slice(0, 4), ...value]
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

.MalInputMat2d
	display flex
	align-items center
	line-height $input-height

	&__value
		position relative
		display grid
		padding 0 0.9rem
		grid-template-columns auto auto auto
		grid-row-gap 0.3rem
		grid-column-gap 0.6rem

		&:before, &:after, ~/__split
			position absolute
			top 0.2rem
			display block
			font-size 1rem
			line-height 1rem
			font-monospace()

		&:before
			left 0
			content '⎡\a⎢\a⎣'
			white-space pre

		&:after
			right 0
			content '⎤\a⎥\a⎦'
			white-space pre

		~/__split
			right 3.9rem
			text-align center
			transform scaleY(0.9)

	&__el
		width 3rem

		&.t
			margin-left 0.3rem

	&__drag
		position relative
		margin-left 0.5rem
		width 1.1rem
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
