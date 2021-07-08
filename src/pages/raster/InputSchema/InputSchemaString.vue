<template>
	<component
		v-bind:is="ui"
		:modelValue="modelValue"
		v-bind="schema"
		@update:modelValue="$emit('update:modelValue', $event)"
	/>
</template>

<script lang="ts">
import {computed, defineComponent, PropType} from 'vue'

import InputDropdown from '@/components/inputs/InputDropdown.vue'
import InputString from '@/components/inputs/InputString.vue'

import {SchemaString} from './type'

export default defineComponent({
	name: 'InputSchemaString',
	components: {
		string: InputString,
		dropdown: InputDropdown,
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
	setup(props) {
		const ui = computed(() => props.schema.ui || 'string')

		return {ui}
	},
})
</script>
