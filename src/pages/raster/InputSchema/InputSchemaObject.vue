<template>
	<div class="InputSchemaObject">
		<div class="InputSchemaObject__list">
			<div
				class="InputSchemaObject__column"
				v-for="(sch, name) in schema.properties"
				:key="name"
			>
				<div class="icon">・</div>
				<label class="label">{{ toLabel(name) }}</label>
				<div class="input">
					<InputSchema
						:modelValue="modelValue[name]"
						@update:modelValue="updateProperty(name, $event)"
						:schema="sch"
					/>
				</div>
			</div>
		</div>
		<Draggable
			v-if="schema.additionalProperties"
			class="InputSchemaObject__list"
			v-bind="{animation: 50, ghostClass: 'ghost'}"
			v-model="additionals"
			itemKey="name"
			handle=".handle"
		>
			<template #item="{element: {name, data}}">
				<div class="InputSchemaObject__column">
					<div class="icon handle">三</div>
					<label class="label">
						<InputString
							class="InputSchemaObject__prop-name"
							:modelValue="name"
							@update:modelValue="updateParamName(name, $event)"
						/>
					</label>
					<div class="input">
						<InputSchema
							:modelValue="data"
							@update:modelValue="updateProperty(name, $event)"
							:schema="schema.additionalProperties"
						/>
					</div>
				</div>
			</template>
		</Draggable>
	</div>
</template>

<script lang="ts">
import _ from 'lodash'
import {computed, defineComponent, PropType, toRaw} from 'vue'
import Draggable from 'vuedraggable'

import InputString from '@/components/inputs/InputString.vue'

import InputSchema from './InputSchema.vue'
import {Data, DataObject, SchemaObject} from './type'

export default defineComponent({
	name: 'InputSchemaObject',
	components: {
		Draggable,
		InputString,
	},
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
		const additionals = computed({
			get: () => {
				if (!props.schema.additionalProperties) return []

				const a = {...toRaw(props.modelValue)}

				for (const fixed in props.schema.properties) {
					delete a[fixed]
				}

				return Object.entries(a).map(([name, data]) => ({name, data}))
			},
			set: sorted => {
				const newValue = {...props.modelValue}

				for (const {name, data} of sorted) {
					delete newValue[name]
					newValue[name] = data
				}

				context.emit('update:modelValue', newValue)
			},
		})

		function updateProperty(name: string, data: Data) {
			const newValue = {...props.modelValue}
			newValue[name] = data
			context.emit('update:modelValue', newValue)
		}

		return {additionals, updateProperty, toLabel: _.startCase}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'

.InputSchemaObject
	&__column
		display grid
		margin-bottom $input-horiz-margin
		grid-template-columns 1em 7em 1fr
		gap 1em

		&.ghost
			visibility hidden

		& > .handle
			cursor move

		& > .label, & > .icon
			display block
			line-height $input-height

			& > *
				width 7em
</style>
