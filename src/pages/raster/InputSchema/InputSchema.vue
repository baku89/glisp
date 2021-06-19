<template>
	<component
		v-bind:is="`schema-${schema.type}`"
		:modelValue="validValue"
		@update:modelValue="$emit('update:modelValue', $event)"
		:schema="schema"
	/>
</template>

<script lang="ts">
import {computed, defineComponent, PropType} from 'vue'

import InputSchemaColor from './InputSchemaColor.vue'
import InputSchemaNumber from './InputSchemaNumber.vue'
import InputSchemaObject from './InputSchemaObject.vue'
import InputSchemaUnion from './InputSchemaUnion.vue'
import {Data, Schema} from './type'
import {getDefault, validate} from './validator'

export default defineComponent({
	name: 'InputSchema',
	components: {
		'schema-color': InputSchemaColor,
		'schema-number': InputSchemaNumber,
		'schema-object': InputSchemaObject,
		'schema-union': InputSchemaUnion,
	},
	props: {
		modelValue: {
			type: [Number, String, Object] as PropType<Data>,
			required: true,
		},
		schema: {
			type: Object as PropType<Schema>,
			required: true,
		},
	},
	emits: ['update:modelValue'],
	setup(props) {
		const validValue = computed(() =>
			validate(props.modelValue, props.schema)
				? props.modelValue
				: getDefault(props.schema)
		)

		return {validValue}
	},
})
</script>
