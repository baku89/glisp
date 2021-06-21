<template>
	<InputCheckbox
		:modelValue="modelValue"
		@update:modelValue="$emit('update:modelValue', $event)"
	/>
</template>

<script lang="ts">
import {defineComponent, PropType} from 'vue'

import InputCheckbox from '@/components/inputs/InputCheckbox.vue'

import InputSchema from './InputSchema.vue'
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
	beforeCreate: function () {
		this.$options.components ||= {}
		this.$options.components.InputSchema = InputSchema
	},
})
</script>
