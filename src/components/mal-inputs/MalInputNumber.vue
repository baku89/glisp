<template>
	<div class="MalInputNumber">
		<MalExpButton
			v-if="display.isExp && compact"
			:value="value"
			:compact="true"
			@click="$emit('select', $event)"
		/>
		<InputNumber
			:class="{
				exp: isExp || display.isExp,
				'grayed-out': display.mode === 'undefined',
			}"
			:value="displayValue"
			:validator="innerValidator"
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
			@click="$emit('select', $event)"
		/>
	</div>
</template>

<script lang="ts">
import {defineComponent, computed, SetupContext} from '@vue/composition-api'
import InputNumber from '@/components/inputs/InputNumber.vue'
import MalExpButton from '@/components/mal-input/MalExpButton.vue'
import {
	MalSeq,
	isList,
	MalVal,
	MalSymbol,
	getEvaluated,
	MalType,
	createList as L,
} from '@/mal/types'
import {getMapValue, getFnInfo, reverseEval, getFn} from '@/mal/utils'
import {NonReactive, nonReactive} from '@/utils'

interface Props {
	value: NonReactive<MalSymbol | number | MalSeq>
	validator: (v: number) => number | null
	compact: boolean
	isExp: boolean
}

export default defineComponent({
	name: 'MalInputNumber',
	components: {InputNumber, MalExpButton},
	props: {
		value: {
			required: true,
			validator: x => x instanceof NonReactive,
		},
		validator: {
			type: Function,
			required: false,
		},
		compact: {
			type: Boolean,
			default: false,
		},
		isExp: {
			type: Boolean,
			default: false,
		},
	},
	setup(props: Props, context: SetupContext) {
		const display = computed(() => {
			if (props.value.value === undefined) {
				return {mode: 'undefined', isExp: false}
			} else if (typeof props.value.value === 'number') {
				return {mode: 'number', isExp: false}
			} else if (isList(props.value.value) && props.value.value.length === 2) {
				const info = getFnInfo(props.value.value)

				if (info) {
					const inverseFn = getMapValue(info.meta, 'inverse', MalType.Function)
					const unit = getMapValue(info.meta, 'unit', MalType.String)

					if (inverseFn && unit) {
						const isExp = typeof (props.value.value as MalVal[])[1] !== 'number'
						return {mode: 'unit', unit, inverseFn, isExp}
					}
				}
			}
			return {mode: 'exp', isExp: true}
		})

		const fn = computed(() => {
			if (display.value.mode !== 'exp') {
				return getFn(props.value.value)
			} else {
				return null
			}
		})

		const displayValue = computed(() => {
			switch (display.value.mode) {
				case 'number':
					return props.value.value as number
				case 'unit':
					return getEvaluated((props.value.value as MalVal[])[1]) as number
				case 'undefined':
					return 0
				default:
					// exp
					return getEvaluated(props.value.value) as number
			}
		})

		const innerValidator = computed(() => {
			if (props.validator) {
				if (display.value.mode === 'unit') {
					return (v: number) => {
						return (display.value.inverseFn as any)(
							(props.validator as any)((fn.value as any)(v))
						)[0]
					}
				} else {
					return props.validator
				}
			}
			return undefined
		})

		function onInput(value: number) {
			let newExp: MalVal = value
			if (display.value.mode === 'unit') {
				const unitVal = reverseEval(value, (props.value.value as MalVal[])[1])
				newExp = L((props.value.value as MalVal[])[0], unitVal)
			} else if (display.value.mode === 'exp') {
				newExp = reverseEval(value, props.value.value)
			}
			context.emit('input', nonReactive(newExp))
		}

		return {
			displayValue,
			display,
			innerValidator,
			onInput,
		}
	},
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.MalInputNumber
	display flex
	align-items center
	line-height $input-height

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
