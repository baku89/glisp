<template>
	<div class="MalInputNumber">
		<MalExpButton
			class="MalInputNumber__exp-button"
			v-if="display.isExp && compact"
			:value="value"
			:compact="true"
			@select="$emit('select', $event)"
		/>
		<InputNumber
			:class="{
				exp: display.isExp,
			}"
			:value="displayValue"
			@input="onInput"
			@end-tweak="$emit('end-tweak', $event)"
		/>
		<span
			class="MalInputNumber__unit"
			:class="{small: display.unit && display.unit.length >= 2}"
			v-if="display.mode === 'unit'"
			>{{ display.unit }}</span
		>
		<MalExpButton
			class="MalInputNumber__exp-after"
			v-if="display.isExp && !compact"
			:value="value"
			:compact="false"
			@select="$emit('select', $event)"
		/>
	</div>
</template>

<script lang="ts">
import {defineComponent, computed, PropType} from 'vue'
import InputNumber from '@/components/inputs/InputNumber.vue'
import MalExpButton from '@/components/mal-inputs/MalExpButton.vue'
import {
	MalSeq,
	MalList,
	MalVal,
	MalSymbol,
	MalType,
	MalKeyword,
	MalNumber,
	MalMap,
	MalFunc,
} from '@/mal/types'
import {getExpByPath, getFnInfo, reverseEval, getFn} from '@/mal/utils'
import {readStr} from '@/mal'

export default defineComponent({
	name: 'MalInputNumber',
	components: {InputNumber, MalExpButton},
	props: {
		value: {
			type: Object as PropType<MalNumber | MalList | MalSymbol>,
			required: true,
		},
		validator: {
			type: Function as PropType<(v: MalNumber) => MalNumber | null>,
			required: false,
		},
		compact: {
			default: false,
		},
	},
	setup(props, context) {
		const display = computed(() => {
			if (MalNumber.is(props.value)) {
				return {mode: 'number', isExp: false}
			} else if (MalList.is(props.value) && props.value.length === 2) {
				const info = getFnInfo(props.value)

				if (info) {
					const inverseFn = getExpByPath(info.meta, 'inverse', MalType.Fn)
					const unit = getExpByPath(info.meta, 'unit', MalType.String)

					if (inverseFn && unit) {
						const isExp = !MalNumber.is(props.value.value[1])
						return {mode: 'unit', unit, inverseFn, isExp}
					}
				}
			}
			return {mode: 'exp', isExp: true}
		})

		const fn = computed(() => {
			if (display.value.mode !== 'exp') {
				return getFn(props.value) || null
			}
			return null
		})

		const displayValue = computed(() => {
			const evaluated =
				display.value.mode !== 'unit'
					? props.value.evaluated
					: (props.value as MalList).value[1].evaluated
			return MalNumber.is(evaluated) ? evaluated.value : NaN
		})

		function onInput(value: number | string) {
			let newExp: MalVal

			// Parse if necessary
			if (typeof value === 'string') {
				let ret
				try {
					ret = readStr(value)
				} catch (e) {
					return
				}
				newExp = ret
			} else {
				newExp = MalNumber.create(value)
			}

			// Validate
			if (props.validator && typeof value === 'number') {
				let validated
				if (display.value.mode === 'unit') {
					const unitValue = (fn.value as MalFunc).value(newExp) as MalNumber
					validated = (display.value.inverseFn as any)(
						MalMap.create({
							return: props.validator(unitValue),
						})
					)[0]
				} else {
					validated = props.validator(newExp)
				}
				if (validated) {
					newExp = validated
				}
			}

			// Reverse evaluation
			if (display.value.mode === 'unit') {
				const unitValue = MalNumber.is(newExp)
					? reverseEval(newExp, (props.value as MalVal[])[1])
					: newExp
				newExp = MalList.create((props.value as MalVal[])[0], unitValue)
			} else if (display.value.mode === 'exp') {
				newExp = MalNumber.is(newExp)
					? reverseEval(newExp, props.value)
					: newExp
			}

			context.emit('input', newExp)
		}

		return {
			displayValue,
			display,
			onInput,
		}
	},
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.MalInputNumber
	position relative
	display flex
	align-items center
	line-height $input-height

	&__exp-button
		position absolute
		left 0.4rem
		z-index 200

	&__unit
		padding-left 0.3em
		width 1rem
		color var(--comment)

		&.small
			height $input-height
			letter-spacing 0
			font-size 0.8em
			line-height $input-height * 1.2

	&__exp-after
		margin-left 0.3rem
</style>
