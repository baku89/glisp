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
import {MalSeq, MalSymbol, getEvaluated, MalVal} from '@/mal/types'
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
			type: [Number, MalSymbol, Object] as PropType<
				string | MalSeq | MalSymbol
			>,
			required: true,
		},
		validator: {
			type: Function as PropType<(v: string) => string | null>,
			required: false,
		},
		multiline: {
			required: false,
			default: false,
		},
	},
	setup(props, context) {
		const isExp = computed(() => typeof props.value !== 'string')
		const evaluated = computed(() => getEvaluated(props.value))

		function onInput(value: string) {
			let newValue: MalVal = value

			if (isExp.value) {
				newValue = reverseEval(value, props.value)
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
