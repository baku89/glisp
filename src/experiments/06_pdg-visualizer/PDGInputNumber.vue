<template>
	<div class="PDGInputNumber">
		<InputNumber :modelValue="modelValue.value" @update:modelValue="onUpdate" />
	</div>
</template>

<script lang="ts">
import {defineComponent, PropType, toRaw} from 'vue'

import InputNumber from '@/components/inputs/InputNumber.vue'

import {PDGValue} from './repl'
import {useSwapPDG} from './use'

export default defineComponent({
	name: 'PDGInputNumber',
	components: {InputNumber},
	props: {
		modelValue: {
			type: Object as PropType<PDGValue>,
			required: true,
		},
	},
	emits: [],
	setup(props) {
		const swapPDG = useSwapPDG()

		function onUpdate(value: number) {
			const oldValue = toRaw(props.modelValue)
			const newValue = {...oldValue, value}

			swapPDG(oldValue, newValue)
		}

		return {onUpdate}
	},
})
</script>
