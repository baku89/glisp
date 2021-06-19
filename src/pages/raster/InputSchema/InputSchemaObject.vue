<template>
	<dl class="InputSchemaObject">
		<div v-for="(sch, name) in schema.properties" :key="name">
			<dt>{{ name }}</dt>
			<dd>
				<InputSchema
					:modelValue="value[name]"
					@update:modelValue="updateProperty(name, $event)"
					:schema="sch"
				/>
			</dd>
		</div>
	</dl>
</template>

<script lang="ts">
import {computed, defineComponent, PropType} from 'vue'

import InputSchema from './InputSchema.vue'
import {Data, DataObject, SchemaObject} from './type'

export default defineComponent({
	name: 'InputSchemaObject',
	props: {
		modelValue: {
			type: Object as PropType<DataObject>,
		},
		schema: {
			type: Object as PropType<SchemaObject>,
			required: true,
		},
	},
	emits: ['update:modelValue'],
	beforeCreate: function () {
		this.$options.components ||= {}
		this.$options.components.InputSchema = InputSchema
	},
	setup(props, context) {
		const value = computed(() => {
			const val = props.modelValue
			return val instanceof Object ? val : {}
		})

		function updateProperty(name: string, data: Data) {
			const newValue = {...value.value, [name]: data}
			context.emit('update:modelValue', newValue)
		}

		return {value, updateProperty}
	},
})
</script>
