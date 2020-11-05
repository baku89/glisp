<template>
	<div class="MalInputSlider">
		<MalExpButton
			v-if="display.isExp && compact"
			:value="value"
			:compact="true"
			@select="$emit('select', $event)"
		/>
		<InputSlider
			:class="{
				exp: display.isExp,
			}"
			:value="displayValue"
			:max="innerMax"
			:min="innerMin"
			:clamped="clamped"
			@input="onInput"
			@end-tweak="$emit('end-tweak', $event)"
		/>
		<span
			class="MalInputSlider__unit"
			:class="{small: display.unit && display.unit.length >= 2}"
			v-if="display.mode === 'unit'"
			>{{ display.unit }}</span
		>
		<MalExpButton
			class="MalInputSlider__exp-after"
			v-if="display.isExp && !compact"
			:value="value"
			:compact="false"
			@select="$emit('select', $event)"
		/>
	</div>
</template>

<script lang="ts">
import {computed, defineComponent, PropType} from 'vue'

import InputSlider from '@/components/inputs/InputSlider.vue'
import MalExpButton from '@/components/mal-inputs/MalExpButton.vue'
import {readStr} from '@/mal'
import {
	MalKeyword,
	MalList,
	MalNumber,
	MalSymbol,
	MalType,
	MalVal,
} from '@/mal/types'
import {getExpByPath, getFn, getFnInfo, reverseEval} from '@/mal/utils'

export default defineComponent({
	name: 'MalInputSlider',
	components: {InputSlider, MalExpButton},
	props: {
		value: {
			type: Object as PropType<MalSymbol | MalNumber | MalList>,
			required: true,
		},

		validator: {
			type: Function as PropType<(v: MalNumber) => MalNumber | null>,
			required: false,
		},
		compact: {
			type: Boolean,
			default: false,
		},
		min: {
			type: Number,
			default: 0,
		},
		max: {
			type: Number,
			default: 1,
		},
		clamped: {
			type: Boolean,
			default: false,
		},
	},
	setup(props, context) {
		const display = computed(() => {
			if (typeof props.value === 'number') {
				return {mode: 'number', isExp: false}
			} else if (MalList.is(props.value) && props.value.length === 2) {
				const info = getFnInfo(props.value)

				if (info) {
					const inverseFn = getExpByPath(info.meta, 'inverse', MalType.Fn)
					const unit = getExpByPath(info.meta, 'unit', MalType.String)

					if (inverseFn && unit) {
						const isExp = typeof (props.value as MalVal[])[1] !== 'number'
						return {mode: 'unit', unit, inverseFn, isExp}
					}
				}
			}
			return {mode: 'exp', isExp: true}
		})

		const fn = computed(() => {
			if (display.value.mode !== 'exp') {
				return getFn(props.value)
			} else {
				return null
			}
		})

		const displayValue = computed(() => {
			switch (display.value.mode) {
				case 'number':
					return props.value as number
				case 'unit':
					return getEvaluated((props.value as MalVal[])[1]) as number
				default:
					// exp
					return getEvaluated(props.value) as number
			}
		})

		const innerMin = computed(() => {
			if (display.value.mode === 'unit') {
				return (display.value.inverseFn as any)({
					[MalKeyword.from('return')]: props.min,
				})[0]
			} else {
				return props.min
			}
		})

		const innerMax = computed(() => {
			if (display.value.mode === 'unit') {
				return (display.value.inverseFn as any)({
					[MalKeyword.from('return')]: props.max,
				})[0]
			} else {
				return props.max
			}
		})

		function onInput(value: number | string) {
			let newExp: MalVal = value

			// Parse if necessary
			if (typeof value === 'string') {
				let ret
				try {
					ret = readStr(value)
				} catch (e) {
					return
				}
				newExp = ret
			}

			// Validate
			if (props.validator && typeof value === 'number') {
				let validated
				if (display.value.mode === 'unit') {
					const unitValue = (fn.value as any)(value as any)
					validated = (display.value.inverseFn as any)({
						[MalKeyword.from('return')]: props.validator(unitValue),
					})[0]
				} else {
					validated = props.validator(value)
				}
				if (typeof validated === 'number') {
					newExp = validated
				}
			}

			// Reverse evaluation
			if (display.value.mode === 'unit') {
				const unitValue =
					typeof newExp === 'number'
						? reverseEval(newExp, (props.value as MalVal[])[1])
						: newExp
				newExp = MalList.from((props.value as MalVal[])[0], unitValue)
			} else if (display.value.mode === 'exp') {
				newExp =
					typeof newExp === 'number' ? reverseEval(newExp, props.value) : newExp
			}

			context.emit('input', newExp)
		}

		return {
			displayValue,
			display,
			innerMin,
			innerMax,
			onInput,
		}
	},
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.MalInputSlider
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
