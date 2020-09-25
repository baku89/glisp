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
import {NonReactive, nonReactive} from '@/utils'
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
			type: Object as PropType<NonReactive<string | MalSeq | MalSymbol>>,
			required: true,
			validator: (x: NonReactive<string | MalSeq | MalSymbol>) =>
				x instanceof NonReactive,
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
		const isExp = computed(() => typeof props.value.value !== 'string')
		const evaluated = computed(() => getEvaluated(props.value.value))

		function onInput(value: string) {
			let newValue: MalVal = value

			if (isExp.value) {
				newValue = reverseEval(value, props.value.value)
				reconstructTree(newValue)
			}

			context.emit('input', nonReactive(newValue))
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
