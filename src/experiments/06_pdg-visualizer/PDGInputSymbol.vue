<template>
	<div class="PDGInputSymbol">
		<InputString :modelValue="modelValue.name" @update:modelValue="onUpdate" />
	</div>
</template>

<script lang="ts">
import {defineComponent, PropType, toRaw} from 'vue'

import InputString from '@/components/inputs/InputString.vue'

import {PDGSymbol} from './repl'
import {useSwapPDG} from './use'

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

		return {onUpdate}
	},
})
</script>
