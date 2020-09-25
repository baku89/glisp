<template>
	<div class="MalInputBoolean">
		<inputBoolean
			class="MalInputBoolean__input"
			:class="{exp: isExp}"
			:value="evaluated"
			@input="onInput"
		/>
		<MalExpButton
			v-if="isExp"
			:value="value"
			@select="$emit('select', $event)"
		/>
	</div>
</template>

<script lang="ts">
import {defineComponent, PropType, computed} from 'vue'
import {NonReactive, nonReactive} from '@/utils'
import {MalSeq, MalSymbol, getEvaluated, MalVal} from '@/mal/types'
import {reverseEval} from '@/mal/utils'
import {reconstructTree} from '@/mal/reader'
import {InputBoolean} from '@/components/inputs'
import MalExpButton from './MalExpButton.vue'

export default defineComponent({
	name: 'MalInputBoolean',
	components: {
		InputBoolean,
		MalExpButton,
	},
	props: {
		value: {
			type: Object as PropType<NonReactive<boolean | MalSeq | MalSymbol>>,
			required: true,
			validator: (x: NonReactive<boolean | MalSeq | MalSymbol>) =>
				x instanceof NonReactive,
		},
	},
	setup(props, context) {
		const isExp = computed(() => typeof props.value.value !== 'boolean')
		const evaluated = computed(() =>
			getEvaluated(props.value.value) ? true : false
		)

		function onInput(value: boolean) {
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
.MalInputBoolean
	display flex

	&__input
		margin-right 0.5rem
</style>
