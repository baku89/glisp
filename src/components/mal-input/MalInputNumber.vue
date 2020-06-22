<template>
	<div class="MalInputNumber">
		<InputNumber
			v-if="display.mode !== 'exp'"
			:value="displayValue"
			@input="onInput"
			:validator="validator"
		/>
		<span v-if="display.mode === 'unit' && display.suffix">{{display.suffix}}</span>
		<div class="exp" v-if="display.mode === 'exp'">{{displayValue}}</div>
	</div>
</template>

<script lang="ts">
import {
	defineComponent,
	ref,
	Ref,
	watch,
	PropType,
	computed
} from '@vue/composition-api'
import InputNumber from '../input/InputNumber.vue'
import {
	MalNodeSeq,
	isList,
	getMeta,
	M_META,
	M_FN,
	isMap,
	MalVal
} from '../../mal/types'
import printExp from '@/mal/printer'
import {getMapValue, getFnInfo} from '../../mal-utils'

export default defineComponent({
	name: 'MalInputNumber',
	components: {InputNumber},
	props: {
		value: {
			type: [Number, Array] as PropType<number | MalNodeSeq>,
			required: true
		},
		validator: {
			type: Function as PropType<(v: number) => number | null>,
			required: false
		}
	},
	setup(props, context) {
		const display = computed(() => {
			if (typeof props.value === 'number') {
				return {mode: 'number'}
			} else if (
				isList(props.value) &&
				props.value.length === 2 &&
				typeof props.value[1] === 'number'
			) {
				const meta = getMeta(props.value[M_FN])
				const unit = getMapValue(meta, 'unit')

				const prefix = getMapValue(unit, 'prefix')
				const suffix = getMapValue(unit, 'suffix')
				return {mode: 'unit', prefix, suffix}
			}
			return {mode: 'exp'}
		})

		const displayValue = computed(() => {
			switch (display.value.mode) {
				case 'number':
					return props.value as number
				case 'unit':
					return (props.value as any)[1] as number
				default:
					return printExp(props.value, true, true)
			}
		})

		const onInput = (value: number) => {
			let newExp: MalVal = value
			if (display.value.mode === 'unit') {
				newExp = [(props.value as MalNodeSeq)[0], value]
			}
			context.emit('input', newExp)
		}

		return {
			onInput,
			displayValue,
			display
		}
	}
})
</script>

<style lang="stylus" scoped>
@import '../style/common.styl'

.MalInputNumber
	display flex
	align-items center
	line-height $input-height

	.exp
		overflow hidden
		max-width 100%
		height $param-height
		color var(--comment)
		text-overflow ellipsis
		white-space nowrap
		line-height $param-height
		font-monospace()
</style>
