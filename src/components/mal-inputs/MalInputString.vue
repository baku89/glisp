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
			@input="onInput"
			@end-tweak="$emit('end-tweak')"
		/>
	</div>
</template>

<script lang="ts">
import {defineComponent, SetupContext, computed} from '@vue/composition-api'
import {NonReactive, nonReactive} from '@/utils'
import {MalSeq, MalSymbol, getEvaluated, MalVal} from '@/mal/types'
import {InputString} from '@/components/inputs'
import {reverseEval} from '@/mal/utils'
import {reconstructTree} from '@/mal/reader'
import MalExpButton from './MalExpButton.vue'

interface Props {
	value: NonReactive<string | MalSeq | MalSymbol>
	validator: (v: string) => string | null
}

export default defineComponent({
	name: 'MalInputString',
	components: {
		InputString,
		MalExpButton,
	},
	props: {
		value: {
			required: true,
			validator: x => x instanceof NonReactive,
		},
		validator: {
			required: false,
		},
	},
	setup(props: Props, context: SetupContext) {
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
