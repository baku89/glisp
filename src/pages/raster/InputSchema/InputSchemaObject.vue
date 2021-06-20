<template>
	<div class="InputSchemaObject">
		<div class="InputSchemaObject__list">
			<InputSchemaEntry
				class="InputSchemaObject__column"
				v-for="(sch, name) in schema.properties"
				:key="name"
				:name="name"
				:modelValue="modelValue[name]"
				@update:modelValue="updateProperty(name, $event)"
				:schema="sch"
			/>
		</div>
		<template v-if="schema.additionalProperties">
			<Draggable
				class="InputSchemaObject__list"
				v-bind="{animation: 50, ghostClass: 'ghost'}"
				v-model="additionals"
				itemKey="key"
				handle=".handle"
			>
				<template #item="{element: {name, data}}">
					<InputSchemaEntry
						class="InputSchemaObject__column"
						:name="name"
						:modelValue="data"
						@update:modelValue="updateProperty(name, $event)"
						@update:name="renameProperty(name, $event)"
						@delete="deleteProperty(name)"
						:schema="schema.additionalProperties"
						:draggable="true"
					/>
				</template>
			</Draggable>
			<InputButton label="+" @click="addProperty" />
		</template>
	</div>
</template>

<script lang="ts">
import _ from 'lodash'
import {computed, defineComponent, PropType, toRaw} from 'vue'
import Draggable from 'vuedraggable'

import InputButton from '@/components/inputs/InputButton.vue'

import InputSchema from './InputSchema.vue'
import InputSchemaEntry from './InputSchemaEntry.vue'
import {Data, DataObject, SchemaObject} from './type'
import {cast} from './validator'

export default defineComponent({
	name: 'InputSchemaObject',
	components: {
		Draggable,
		InputButton,
		InputSchemaEntry,
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

				return Object.entries(a).map(([name, data], key) => ({name, data, key}))
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

		function renameProperty(name: string, newName: string) {
			const newValue = _.mapKeys(props.modelValue, (_, n) =>
				n === name ? newName : n
			)
			context.emit('update:modelValue', newValue)
		}

		function updateProperty(name: string, data: Data) {
			const newValue = {...props.modelValue}
			newValue[name] = data
			context.emit('update:modelValue', newValue)
		}

		function addProperty() {
			const prop = cast(undefined, props.schema)

			const propName = 'prop_' + (_.keys(props.modelValue).length + 1)

			const newValue = {...props.modelValue, [propName]: prop}
			context.emit('update:modelValue', newValue)
		}

		function deleteProperty(name: string) {
			const newValue = {...props.modelValue}
			delete newValue[name]
			context.emit('update:modelValue', newValue)
		}

		return {
			additionals,
			renameProperty,
			updateProperty,
			addProperty,
			deleteProperty,
			toLabel: _.startCase,
		}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'

.InputSchemaObject
	display table
	user-select none

	&__column
		&:not(:last-child)
			margin-bottom $input-horiz-margin

		&.ghost
			visibility hidden
</style>
