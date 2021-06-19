<template>
	<InputColor
		:modelValue="modelValue"
		@update:modelValue="$emit('update:modelValue', $event)"
	/>
</template>

<script lang="ts">
import {defineComponent, PropType} from 'vue'

import InputColor from '@/components/inputs/InputColor.vue'

import InputSchema from './InputSchema.vue'
import {SchemaColor} from './type'

export default defineComponent({
	name: 'InputSchemaColor',
	components: {
		InputColor,
	},
	props: {
		modelValue: {
			type: String,
			required: true,
		},
		schema: {
			type: Object as PropType<SchemaColor>,
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
