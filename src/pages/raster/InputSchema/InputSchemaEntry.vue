<template>
	<div
		class="InputSchemaEntry"
		:class="{nested}"
		v-if="schema.type !== 'const'"
	>
		<SvgIcon
			v-if="!nested"
			class="icon"
			:class="{handle: draggable}"
			mode="block"
		>
			<path v-if="draggable" d="M4 8 L28 8 M4 16 L28 16 M4 24 L28 24" />
			<circle v-else cx="16" cy="16" r="2" />
		</SvgIcon>
		<label class="label">
			<template v-if="!draggable">
				{{ toLabel(name) }}
			</template>
			<InputString
				v-else
				class="InputSchemaEntry__name label"
				:modelValue="name"
				@update:modelValue="$emit('update:name', $event)"
			/>
		</label>
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
import {computed, defineComponent, inject, PropType, provide} from 'vue'

import InputString from '@/components/inputs/InputString.vue'
import SvgIcon from '@/components/layouts/SvgIcon.vue'

import InputSchema from './InputSchema.vue'
import {Data, Schema} from './type'

export default defineComponent({
	name: 'InputSchemaEntry',
	components: {InputString, SvgIcon},
	props: {
		name: {
			type: String,
			required: true,
		},
		modelValue: {
			type: [Number, String, Object] as PropType<Data>,
			required: true,
		},
		schema: {
			type: Object as PropType<Schema>,
			required: true,
		},
		draggable: {
			type: Boolean,
			default: false,
		},
	},
	emits: ['update:modelValue', 'update:name'],
	beforeCreate: function () {
		this.$options.components ||= {}
		this.$options.components.InputSchema = InputSchema
	},
	setup() {
		// Depth
		const depth = inject('InputSchemaObject__depth', 0)
		provide('InputSchemaObject__depth', depth + 1)

		const nested = computed(() => depth >= 1)

		return {nested, toLabel: _.startCase}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'

.InputSchemaEntry
	display grid
	grid-template-columns 1em 7em 1fr
	gap 1em

	&.nested
		grid-template-columns 4em 1fr

	& > .icon
		width 1.2em
		height $input-height

	& > .handle
		cursor move

	& > .label, & > .icon
		line-height $input-height

	&__name
		width 100%
</style>
