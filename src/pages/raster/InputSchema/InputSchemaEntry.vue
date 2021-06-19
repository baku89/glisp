<template>
	<div class="InputSchemaEntry" v-if="schema.type !== 'const'">
		<div class="icon">・</div>
		<label class="label">{{ toLabel(name) }}</label>
		<div class="input">
			<InputSchema
				:modelValue="modelValue"
				@update:modelValue="$emit('update:modelValue', $event)"
				:schema="schema"
			/>
		</div>
	</div>
</template>

<script lang="ts">
import _ from 'lodash'
import {defineComponent, PropType} from 'vue'

import InputSchema from './InputSchema.vue'
import {Data, Schema} from './type'

export default defineComponent({
	name: 'InputSchemaEntry',
	props: {
		name: {
			type: String,
			required: true,
		},
		modelValue: {
			type: Object as PropType<Data>,
			required: true,
		},
		schema: {
			type: Object as PropType<Schema>,
			required: true,
		},
	},
	emits: ['update:modelValue'],
	beforeCreate: function () {
		this.$options.components ||= {}
		this.$options.components.InputSchema = InputSchema
	},
	setup() {
		return {toLabel: _.startCase}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'

.InputSchemaEntry
	display grid
	margin-bottom $input-horiz-margin
	grid-template-columns 1em 7em 1fr
	gap 1em

	& > .label, & > .icon
		display block
		line-height $input-height
</style>
