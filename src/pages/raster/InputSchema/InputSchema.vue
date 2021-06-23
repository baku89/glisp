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

import InputCheckbox from '@/components/inputs/InputCheckbox.vue'
import InputColor from '@/components/inputs/InputColor.vue'
import InputCubicBezier from '@/components/inputs/InputCubicBezier'

import InputSchemaNumber from './InputSchemaNumber.vue'
import InputSchemaObject from './InputSchemaObject.vue'
import InputSchemaString from './InputSchemaString.vue'
import InputSchemaUnion from './InputSchemaUnion.vue'
import {Data, Schema} from './type'
import {cast} from './validator'

export default defineComponent({
	name: 'InputSchema',
	components: {
		'schema-color': InputColor,
		'schema-boolean': InputCheckbox,
		'schema-number': InputSchemaNumber,
		'schema-string': InputSchemaString,
		'schema-cubicBezier': InputCubicBezier,
		'schema-object': InputSchemaObject,
		'schema-union': InputSchemaUnion,
	},
	props: {
		modelValue: {
			type: [Boolean, Number, String, Object] as PropType<Data>,
			default: null,
		},
		schema: {
			type: Object as PropType<Schema>,
			required: true,
		},
	},
	emits: ['update:modelValue'],
	setup(props) {
		const validValue = computed(() => cast(props.modelValue, props.schema))
		return {validValue}
	},
})
</script>
