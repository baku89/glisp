<template>
	<div class="MalInputSize2d">
		<MalExpButton
			class="MalInputSize2d__exp-button"
			v-if="!isValueSeparated"
			:value="size"
			:compact="true"
			@select="$emit('select', $event)"
		/>
		<template v-if="isValueSeparated">
			<MalInputNumber
				class="MalInputSize2d__el"
				:value="nonReactiveValues[0]"
				:compact="true"
				@input="(...$event) => onInputElement(0, ...$event)"
				@select="$emit('select', $event)"
				@end-tweak="$emit('end-tweak')"
			/>
			<MalInputNumber
				class="MalInputSize2d__el"
				:value="nonReactiveValues[1]"
				:compact="true"
				@input="(...$event) => onInputElement(1, ...$event)"
				@select="$emit('select', $event)"
				@end-tweak="$emit('end-tweak')"
			/>
		</template>
		<template v-else>
			<InputNumber
				class="MalInputSize2d__el exp"
				:value="evaluated[0]"
				@input="onInputEvaluatedElement(0, $event)"
				@end-tweak="$emit('end-tweak')"
			/>
			<InputNumber
				class="MalInputSize2d__el exp"
				:value="evaluated[1]"
				@input="onInputEvaluatedElement(1, $event)"
				@end-tweak="$emit('end-tweak')"
			/>
		</template>
		<button
			class="MalInputSize2d__link-button fas"
			:class="{'fa-link': ratio !== false, 'fa-unlink': ratio === false}"
			@click="onClickLinkButton"
		/>
	</div>
</template>

<script lang="ts">
import {computed, defineComponent, PropType} from 'vue'

import {InputNumber} from '@/components/inputs'
import {
	MalBoolean,
	MalList,
	MalNumber,
	MalSeq,
	MalSymbol,
	MalVal,
	MalVector,
} from '@/mal/types'
import {reverseEval} from '@/mal/utils'

import MalExpButton from './MalExpButton.vue'
import MalInputNumber from './MalInputNumber.vue'

export default defineComponent({
	name: 'MalInputSize2d',
	components: {MalInputNumber, MalExpButton, InputNumber},
	props: {
		value: {
			type: Object as PropType<MalSeq | MalSymbol>,
			required: true,
		},
	},
	setup(props, context) {
		const isSizeFunc = computed(
			() =>
				MalList.is(props.value) &&
				MalSymbol.isFor(props.value.value[0], 'vec2/size')
		)

		const size = computed(() => {
			const value = props.value
			if (isSizeFunc.value) {
				return (value as MalList).value[1]
			} else {
				return props.value
			}
		})

		const ratio = computed(() => {
			const value = props.value
			if (isSizeFunc.value) {
				return (value as MalList).value[2].value
			} else {
				return false
			}
		})

		const isValueSeparated = computed(() => MalVector.is(size.value))

		const nonReactiveValues = computed(() => {
			if (!isValueSeparated.value) {
				return []
			} else {
				return Array.from(size.value as MalSeq)
			}
		})

		const evaluated = computed(() => size.value.evaluated)

		function onInputElement(index: number, v: MalVal, num: number) {
			if (!isValueSeparated.value) {
				return
			}

			const newSize = size.value.clone()
			newSize[index] = v

			const r = evaluated.value[1] / evaluated.value[0]

			if (ratio.value !== false) {
				const anotherIndex = index === 0 ? 1 : 0

				let anotherValue: MalVal = evaluated.value[anotherIndex]
				if (r === 0) {
					anotherValue = anotherIndex === 0 ? anotherValue : 0
				} else if (Math.abs(r) === Infinity) {
					anotherValue = anotherIndex === 0 ? 0 : anotherValue
				} else {
					anotherValue = anotherIndex === 0 ? (1 / r) * num : r * num
				}

				anotherValue = reverseEval(anotherValue, newSize[anotherIndex])
				newSize[anotherIndex] = anotherValue
			}

			const newExp = MalList.from(
				MalSymbol.from('vec2/size'),
				newSize,
				ratio.value === false ? MalBoolean.from(false) : MalNumber.from(r)
			)
			context.emit('input', newExp)
		}

		function onInputEvaluatedElement(index: number, v: number) {
			const newSize = [...evaluated.value]
			newSize[index] = v

			const r = evaluated.value[1] / evaluated.value[0]

			if (ratio.value !== false) {
				const anotherIndex = index === 0 ? 1 : 0

				let anotherValue: number = newSize[anotherIndex]
				if (r === 0) {
					anotherValue = anotherIndex === 0 ? anotherValue : 0
				} else if (Math.abs(r) === Infinity) {
					anotherValue = anotherIndex === 0 ? 0 : anotherValue
				} else {
					anotherValue = anotherIndex === 0 ? (1 / r) * v : r * v
				}
				newSize[anotherIndex] = anotherValue
			}

			const newSizeExp = reverseEval(newSize, size.value)

			const newExp = MalList.from(
				MalSymbol.from('vec2/size'),
				newSizeExp,
				ratio.value === false ? MalBoolean.from(false) : MalNumber.from(r)
			)
			context.emit('input', newExp)
		}

		function onClickLinkButton() {
			const newRatio =
				ratio.value === false
					? MalNumber.from(evaluated.value[1] / evaluated.value[0])
					: MalBoolean.from(false)

			const newExp = MalList.from(
				MalSymbol.from('vec2/size'),
				size.value,
				newRatio
			)

			context.emit('input', newExp)
		}

		return {
			size,
			ratio,
			nonReactiveValues,
			isValueSeparated,
			evaluated,
			onInputElement,
			onInputEvaluatedElement,
			onClickLinkButton,
		}
	},
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.MalInputSize2d
	display flex
	align-items center
	line-height $input-height

	&__el, &__exp-button
		margin-right 0.6rem

	&__link-button
		padding 0
		width $button-height
		height @width !important
		color var(--base02)
</style>
