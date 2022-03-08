<template>
	<component
		:is="ui"
		:modelValue="modelValue"
		v-bind="schema"
		@update:modelValue="$emit('update:modelValue', $event)"
	/>
</template>

<script lang="ts">
import {computed, defineComponent, PropType} from 'vue'

import InputNumber from '@/components/inputs/InputNumber'
import InputRotery from '@/components/inputs/InputRotery.vue'
import InputSeed from '@/components/inputs/InputSeed.vue'

import {SchemaNumber} from './type'

export default defineComponent({
	name: 'InputSchemaNumber',
	components: {
		angle: InputRotery,
		number: InputNumber,
		seed: InputSeed,
	},
	props: {
		modelValue: {
			type: Number,
			required: true,
		},
		schema: {
			type: Object as PropType<SchemaNumber>,
			required: true,
		},
	},
	emits: ['update:modelValue'],
	setup(props) {
		const ui = computed(() => props.schema.ui || 'number')

		return {ui}
	},
})
</script>
