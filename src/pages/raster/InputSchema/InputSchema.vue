<template>
	<div class="InputSchema">
		<InputNumber
			v-if="schema.type === 'number'"
			:modelValue="value"
			@update:modelValue="$emit('update:modelValue', $event)"
		/>
		<InputColor
			v-else-if="schema.type === 'color'"
			:modelValue="value"
			@update:modelValue="$emit('update:modelValue', $event)"
		/>
		<InputSchemaObject
			v-else-if="schema.type === 'object'"
			:modelValue="value"
			@update:modelValue="$emit('update:modelValue', $event)"
			:schema="schema"
		/>
	</div>
</template>

<script lang="ts">
import {computed, defineComponent, PropType} from 'vue'

import InputColor from '@/components/inputs/InputColor.vue'
import InputNumber from '@/components/inputs/InputNumber.vue'

import InputSchemaObject from './InputSchemaObject.vue'
import {Data, Schema} from './type'

export default defineComponent({
	name: 'InputSchema',
	components: {
		InputColor,
		InputNumber,
		InputSchemaObject,
	},
	props: {
		modelValue: {
			type: [Number, String, Object] as PropType<Data>,
		},
		schema: {
			type: Object as PropType<Schema>,
			required: true,
		},
	},
	emits: ['update:modelValue'],
	setup(props) {
		const value = computed(() => {
			const value = props.modelValue
			const schema = props.schema

			switch (schema.type) {
				case 'const':
					return (value as any) === schema.value ? value : schema.value
				case 'number':
					if (typeof value === 'number') {
						return value
					} else {
						return schema.default || 0
					}
				case 'color':
					if (typeof value === 'string') {
						return value
					} else {
						return schema.default || '#ffffff'
					}
			}
			return value
		})

		return {value}
	},
})
</script>
