<template>
	<InputCheckbox
		:modelValue="modelValue"
		@update:modelValue="$emit('update:modelValue', $event)"
	/>
</template>

<script lang="ts">
import {defineComponent, PropType} from 'vue'

import InputCheckbox from '@/components/inputs/InputCheckbox.vue'

import {SchemaBoolean} from './type'

export default defineComponent({
	name: 'InputSchemaBoolean',
	components: {
		InputCheckbox,
	},
	props: {
		modelValue: {
			type: Boolean,
			required: true,
		},
		schema: {
			type: Object as PropType<SchemaBoolean>,
			required: true,
		},
	},
	emits: ['update:modelValue'],
})
</script>
