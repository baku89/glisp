<template>
	<InputString
		:modelValue="modelValue"
		@update:modelValue="$emit('update:modelValue', $event)"
	/>
</template>

<script lang="ts">
import {defineComponent, PropType} from 'vue'

import InputString from '@/components/inputs/InputString.vue'

import InputSchema from './InputSchema.vue'
import {SchemaString} from './type'

export default defineComponent({
	name: 'InputSchemaString',
	components: {
		InputString,
	},
	props: {
		modelValue: {
			type: String,
			required: true,
		},
		schema: {
			type: Object as PropType<SchemaString>,
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
