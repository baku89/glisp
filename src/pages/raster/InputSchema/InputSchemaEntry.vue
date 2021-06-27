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
			<circle cx="16" cy="16" r="2" />
		</SvgIcon>
		<label class="label" v-if="!editable">
			{{ toLabel(name) }}
		</label>
		<InputString
			v-else
			class="label label-input"
			:validator="validateName"
			:updateOnBlur="true"
			:modelValue="name"
			@update:modelValue="$emit('update:name', $event)"
		/>
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
import {flow} from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import _ from 'lodash'
import {computed, defineComponent, inject, PropType, provide} from 'vue'

import InputString from '@/components/inputs/InputString.vue'
import SvgIcon from '@/components/layouts/SvgIcon.vue'
import {Validator} from '@/lib/fp'
import {generateUniqueKeyValidator} from '@/lib/validator'

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
		validator: {
			type: Function as PropType<Validator<string>>,
			default: O.some,
		},
		infix: {
			type: String,
			default: ' ',
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

		const validateName = computed<Validator<string>>(() => {
			const namesToAvoid = _.difference(props.allNames, [props.name])
			return flow(
				props.validator,
				O.chain(generateUniqueKeyValidator(namesToAvoid, props.infix)),
				O.chain(props.validator)
			)
		})

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
	cursor grab
	grid-template-columns 1.2em 7em 1fr
	gap 0.5em

	&.nested
		grid-template-columns 5em 1fr

	& > .icon
		width 1.2em
		height $input-height

	& > .label, & > .icon
		line-height $input-height
</style>
