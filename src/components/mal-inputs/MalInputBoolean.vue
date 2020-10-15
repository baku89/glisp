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
import {MalBoolean, MalList, MalSeq, MalSymbol, MalVal} from '@/mal/types'
import {reverseEval} from '@/mal/utils'
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
			type: Object as PropType<MalBoolean | MalList | MalSymbol>,
			required: true,
		},
	},
	setup(props, context) {
		const isExp = computed(() => !MalBoolean.is(props.value))

		const evaluated = computed(() =>
			props.value.evaluated.value ? true : false
		)

		function onInput(value: boolean) {
			let newValue: MalVal = MalBoolean.from(value)

			if (isExp.value) {
				newValue = reverseEval(newValue, props.value)
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
