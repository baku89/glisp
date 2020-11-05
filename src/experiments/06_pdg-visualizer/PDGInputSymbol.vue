<template>
	<div class="PDGInputSymbol">
		<InputString
			class="PDGInputSymbol__input"
			:modelValue="modelValue.name"
			@update:modelValue="onUpdate"
		/>
		{{ evaluated || 'null' }}
	</div>
</template>

<script lang="ts">
import {defineComponent, PropType, toRaw, toRef} from 'vue'

import InputString from '@/components/inputs/InputString.vue'

import {PDGSymbol} from './repl'
import {usePDGEvalauted, useSwapPDG} from './use'

export default defineComponent({
	name: 'PDGInputSymbol',
	components: {InputString},
	props: {
		modelValue: {
			type: Object as PropType<PDGSymbol>,
			required: true,
		},
	},
	emits: [],
	setup(props) {
		const swapPDG = useSwapPDG()

		function onUpdate(v: string) {
			const oldValue = toRaw(props.modelValue)
			const newValue = {...oldValue, resolved: undefined, name: v}

			swapPDG(oldValue, newValue)
		}

		const {evaluated} = usePDGEvalauted(toRef(props, 'modelValue'))

		return {onUpdate, evaluated}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'

.PDGInputSymbol
	&__input
		color var(--keyword)
		font-monospace()
</style>
