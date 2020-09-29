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
			type: [Boolean, Object] as PropType<boolean | MalSeq | MalSymbol>,
			required: true,
		},
	},
	setup(props, context) {
		const isExp = computed(() => typeof props.value !== 'boolean')
		const evaluated = computed(() => (getEvaluated(props.value) ? true : false))

		function onInput(value: boolean) {
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
.MalInputBoolean
	display flex

	&__input
		margin-right 0.5rem
</style>
