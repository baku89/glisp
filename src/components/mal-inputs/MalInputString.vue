<template>
	<div class="MalInputString">
		<MalExpButton
			v-if="isExp"
			:value="value"
			:compact="true"
			@select="$emit('select', $event)"
		/>
		<InputString
			:value="evaluated"
			:validator="validator"
			:class="{exp: isExp}"
			:multiline="multiline"
			@input="onInput"
			@end-tweak="$emit('end-tweak')"
		/>
	</div>
</template>

<script lang="ts">
import {defineComponent, computed, PropType} from 'vue'
import {
	MalList,
	MalSeq,
	MalString,
	MalSymbol,
	MalType,
	MalVal,
} from '@/mal/types'
import {InputString} from '@/components/inputs'
import {reverseEval} from '@/mal/utils'
import {reconstructTree} from '@/mal/reader'
import MalExpButton from './MalExpButton.vue'

export default defineComponent({
	name: 'MalInputString',
	components: {
		InputString,
		MalExpButton,
	},
	props: {
		value: {
			type: Object as PropType<MalString | MalList | MalSymbol>,
			required: true,
		},
		validator: {
			type: Function as PropType<(v: MalString) => MalString | null>,
			required: false,
		},
		multiline: {
			required: false,
			default: false,
		},
	},
	setup(props, context) {
		const isExp = computed(() => !MalString.is(props.value))

		const evaluated = computed(() => {
			const evaluated = props.value.evaluated
			return MalString.is(evaluated) ? evaluated.value : ''
		})

		function onInput(value: string) {
			let newValue: MalVal = MalString.create(value)

			if (isExp.value) {
				newValue = reverseEval(newValue, props.value)
				reconstructTree(newValue)
			}

			context.emit('input', newValue)
			context.emit('end-tweak')
		}

		return {isExp, evaluated, onInput}
	},
})
</script>

<style lang="stylus">
.MalInputString
	display flex
</style>
