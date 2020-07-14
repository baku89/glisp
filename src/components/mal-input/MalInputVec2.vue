<template>
	<div class="MalInputVec2">
		<MalExpButton
			v-if="!isValueSeparated"
			:value="value"
			:compact="true"
			@click="$emit('select', $event)"
		/>
		[
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
			<MalInputNumber
				class="MalInputVec2__el"
				:isExp="true"
				:value="getEvaluated(value)[0]"
				:compact="true"
				@input="onInputEvaluatedElement(0, $event)"
			/>
			<MalInputNumber
				class="MalInputVec2__el"
				:isExp="true"
				:value="getEvaluated(value)[1]"
				:compact="true"
				@input="onInputEvaluatedElement(0, $event)"
			/>
		</template>
		]
		<button
			class="MalInputVec2__drag"
			:class="{dragging: drag.isDragging}"
			ref="dragEl"
		/>
	</div>
</template>

<script lang="ts">
import {
	defineComponent,
	ref,
	Ref,
	PropType,
	computed
} from '@vue/composition-api'
import {getEvaluated, MalVal, isVector} from '@/mal/types'
import MalInputNumber from './MalInputNumber.vue'
import MalExpButton from './MalExpButton.vue'
import {useDraggable} from '@/components/use'
import {reverseEval} from '@/mal/utils'

export default defineComponent({
	name: 'MalInputVec2',
	components: {MalInputNumber, MalExpButton},
	props: {
		value: {
			type: [Array, Object] as PropType<MalVal>,
			required: true
		}
	},
	setup(props, context) {
		const dragEl: Ref<null | HTMLElement> = ref(null)

		const isValueSeparated = computed(
			() => isVector(props.value) && props.value.length >= 2
		)

		function onInputElement(i: number, v: number) {
			const value = [...(props.value as number[])]
			value[i] = v
			context.emit('input', value)
		}

		function onInputEvaluatedElement(i: number, v: number) {
			const value = [...(getEvaluated(props.value) as number[])]
			value[i] = v
			const newExp = reverseEval(value, props.value)
			context.emit('input', newExp)
		}

		const drag = useDraggable(dragEl, {
			onDrag({isDragging, deltaX, deltaY}) {
				if (!isDragging) return

				const newValue = [...(getEvaluated(props.value) as number[])]

				newValue[0] += deltaX
				newValue[1] += deltaY

				const newExp = reverseEval(newValue, props.value)
				context.emit('input', newExp)
			}
		})

		return {
			isValueSeparated,
			dragEl,
			onInputElement,
			onInputEvaluatedElement,
			drag,
			getEvaluated
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
		margin-right 1em

		&:last-child
			margin-right 0

	&__drag
		position relative
		margin-left 0.5rem
		width 14px
		height 14px
		border 1px solid var(--comment)
		border-radius 2px

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
			top 6px
			left 3px
			width 6px
			height 1px

		&:after
			top 3px
			left 5px
			width 1px
			height 6px
</style>
