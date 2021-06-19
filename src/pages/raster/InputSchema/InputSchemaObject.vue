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
		<Draggable
			v-if="schema.additionalProperties"
			class="InputSchemaObject__list"
			v-bind="{animation: 50, ghostClass: 'ghost'}"
			v-model="additionals"
			itemKey="name"
			handle=".handle"
		>
			<template #item="{element: {name, data}}">
				<InputSchemaEntry
					class="InputSchemaObject__column"
					:name="name"
					:modelValue="data"
					@update:modelValue="updateProperty(name, $event)"
					@update:name="updateName(name, $event)"
					:schema="schema.additionalProperties"
					:draggable="true"
				/>
			</template>
		</Draggable>
	</div>
</template>

<script lang="ts">
import _ from 'lodash'
import {computed, defineComponent, PropType, toRaw} from 'vue'
import Draggable from 'vuedraggable'

import InputSchema from './InputSchema.vue'
import InputSchemaEntry from './InputSchemaEntry.vue'
import {Data, DataObject, SchemaObject} from './type'

export default defineComponent({
	name: 'InputSchemaObject',
	components: {
		Draggable,
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

		function updateName(name: string, newName: string) {
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

		return {
			additionals,
			updateName,
			updateProperty,
			toLabel: _.startCase,
		}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'

.InputSchemaObject
	user-select none

	&__column
		&:not(:last-child)
			margin-bottom $input-horiz-margin

		&.ghost
			visibility hidden
</style>
