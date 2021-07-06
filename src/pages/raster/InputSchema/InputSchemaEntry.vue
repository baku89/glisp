<template>
	<div
		class="InputSchemaEntry"
		:class="{nested}"
		v-if="schema.type !== 'const'"
		@click.right.prevent="contextMenuOpened = true"
		ref="rootEl"
		v-bind="$attrs"
	>
		<SvgIcon
			v-if="!nested"
			class="icon"
			:class="{handle: editable}"
			mode="block"
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
	<Popover
		v-model:open="contextMenuOpened"
		:reference="rootEl"
		closeTrigger="outside"
	>
		<Menu :menu="contextMenuItem" @action="contextMenuOpened = false" />
	</Popover>
</template>

<script lang="ts">
import {flow} from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import _ from 'lodash'
import {computed, defineComponent, inject, PropType, provide, ref} from 'vue'

import InputString from '@/components/inputs/InputString.vue'
import Menu from '@/components/layouts/Menu.vue'
import Popover from '@/components/layouts/Popover.vue'
import SvgIcon from '@/components/layouts/SvgIcon.vue'
import {Validator} from '@/lib/fp'
import {generateUniqueKeyValidator} from '@/lib/validator'

import InputSchema from './InputSchema.vue'
import {Data, Schema} from './type'
import {cast} from './validator'

export default defineComponent({
	name: 'InputSchemaEntry',
	components: {InputString, SvgIcon, Popover, Menu},
	inheritAttrs: false,
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

		// Context menu
		const rootEl = ref(null)
		const contextMenuOpened = ref(false)

		const contextMenuItem = [
			{
				name: 'resetToDefault',
				label: 'Reset to Default',
				icon: '<path d="M29 16 C29 22 24 29 16 29 8 29 3 22 3 16 3 10 8 3 16 3 21 3 25 6 27 9 M20 10 L27 9 28 2"/>',
				exec() {
					const newValue = cast(undefined, props.schema)
					context.emit('update:modelValue', newValue)
				},
			},
		]

		if (props.editable) {
			contextMenuItem.push({
				name: 'delete',
				label: 'Delete',
				icon: '<path d="M28 6 L6 6 8 30 24 30 26 6 4 6 M16 12 L16 24 M21 12 L20 24 M11 12 L12 24 M12 6 L13 2 19 2 20 6" />',
				exec() {
					context.emit('delete')
				},
			})
		}

		return {
			nested,
			toLabel: _.startCase,
			validateName,
			contextMenuOpened,
			rootEl,
			contextMenuItem,
		}
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
