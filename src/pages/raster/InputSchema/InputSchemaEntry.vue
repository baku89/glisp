<template>
	<div
		class="InputSchemaEntry"
		:class="{nested}"
		v-if="schema.type !== 'const'"
		@dblclick="resetToDefault"
	>
		<SvgIcon
			v-if="!nested"
			class="icon"
			:class="{handle: editable}"
			mode="block"
			@dblclick="editable && $emit('delete')"
		>
			<g v-if="editable">
				<circle class="st1" cx="16" cy="16" r="0.5" />
				<circle class="st1" cx="7" cy="16" r="0.5" />
				<circle class="st1" cx="25" cy="16" r="0.5" />
				<circle class="st1" cx="16" cy="7" r="0.5" />
				<circle class="st1" cx="16" cy="25" r="0.5" />
				<circle class="st1" cx="7" cy="7" r="0.5" />
				<circle class="st1" cx="7" cy="25" r="0.5" />
				<circle class="st1" cx="25" cy="7" r="0.5" />
				<circle class="st1" cx="25" cy="25" r="0.5" />
			</g>
			<circle v-else cx="16" cy="16" r="2" />
		</SvgIcon>
		<label class="label">
			<template v-if="!editable">
				{{ toLabel(name) }}
			</template>
			<InputString
				v-else
				class="InputSchemaEntry__name label"
				:validator="validateName"
				:updateOnBlur="true"
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
import {cast} from './validator'

export default defineComponent({
	name: 'InputSchemaEntry',
	components: {InputString, SvgIcon},
	props: {
		name: {
			type: String,
			required: true,
		},
		modelValue: {
			type: [Boolean, Number, String, Object] as PropType<Data>,
			required: true,
		},
		schema: {
			type: Object as PropType<Schema>,
			required: true,
		},
		editable: {
			type: Boolean,
			default: false,
		},
		allNames: {
			type: Array as PropType<string[]>,
			default: () => [],
		},
	},
	emits: ['update:modelValue', 'update:name', 'delete'],
	beforeCreate: function () {
		this.$options.components ||= {}
		this.$options.components.InputSchema = InputSchema
	},
	setup(props, context) {
		// Depth
		const depth = inject('InputSchemaObject__depth', 0)
		provide('InputSchemaObject__depth', depth + 1)

		const nested = computed(() => depth >= 1)

		function validateName(v: string) {
			// Check if empty
			if (v.trim() === '') {
				return null
			}
			// Check if duplicated key exists
			if (_.difference(props.allNames, [props.name]).includes(v)) {
				return null
			}

			return v
		}

		function resetToDefault() {
			const newValue = cast(undefined, props.schema)
			context.emit('update:modelValue', newValue)
		}

		return {nested, toLabel: _.startCase, validateName, resetToDefault}
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
		grid-template-columns 5em 1fr

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
