<template>
	<div class="PDGInputNumber">
		<InputNumber :modelValue="modelValue.value" @update:modelValue="onUpdate" />
	</div>
</template>

<script lang="ts">
import {defineComponent, PropType, toRaw} from 'vue'

import InputNumber from '@/components/inputs/InputNumber.vue'

import {PDGValue, setDirty} from './repl'

export default defineComponent({
	name: 'PDGInputNumber',
	components: {InputNumber},
	props: {
		modelValue: {
			type: Object as PropType<PDGValue>,
			required: true,
		},
	},
	emits: ['update:modelValue'],
	setup(props, context) {
		function onUpdate(v: number) {
			const oldValue = toRaw(props.modelValue)

			setDirty(oldValue)
			const newValue: PDGValue = {...oldValue}
			newValue.value = v
			context.emit('update:modelValue', newValue)
		}

		return {onUpdate}
	},
})
</script>
