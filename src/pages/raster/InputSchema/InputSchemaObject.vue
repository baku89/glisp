<template>
	<div class="InputSchemaObject">
		<InputSchemaEntry
			class="InputSchemaObject__column"
			v-for="(sch, name) in schema.properties"
			:key="name"
			:name="name"
			:modelValue="modelValue[name]"
			@update:modelValue="updateProperty(name, $event)"
			:schema="sch"
		/>
		<template v-if="schema.additionalProperties">
			<Draggable
				v-bind="{animation: 50, ghostClass: 'ghost'}"
				v-model="additionals"
				itemKey="key"
			>
				<template #item="{element: {name, data}}">
					<InputSchemaEntry
						class="InputSchemaObject__column"
						:name="name"
						:modelValue="data"
						:allNames="allNames"
						:schema="schema.additionalProperties"
						:validator="schema.additionalValidator"
						:infix="schema.additionalInfix"
						:editable="true"
						@update:modelValue="updateProperty(name, $event)"
						@update:name="renameProperty(name, $event)"
						@delete="deleteProperty(name)"
					/>
				</template>
				<template #footer>
					<button class="InputSchemaObject__add" @click="addProperty">
						<SvgIcon mode="block" class="icon" :nonStrokeScaling="true">
							<path d="M16 2 L16 30 M2 16 L30 16" />
						</SvgIcon>
					</button>
				</template>
			</Draggable>
		</template>
	</div>
</template>

<script lang="ts">
import _ from 'lodash'
import {computed, defineComponent, PropType, toRaw} from 'vue'
import Draggable from 'vuedraggable'

import SvgIcon from '@/components/layouts/SvgIcon.vue'
import {generateUniqueKey} from '@/lib/string'

import InputSchema from './InputSchema.vue'
import InputSchemaEntry from './InputSchemaEntry.vue'
import {Data, DataObject, SchemaObject} from './type'
import {cast} from './validator'

export default defineComponent({
	name: 'InputSchemaObject',
	components: {
		Draggable,
		SvgIcon,
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
		const allNames = computed(() => _.keys(props.modelValue))

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

			const propName = generateUniqueKey(
				'prop',
				allNames.value,
				props.schema.additionalInfix
			)

			const newValue = {...props.modelValue, [propName]: prop}

			context.emit('update:modelValue', newValue)
		}

		function deleteProperty(name: string) {
			const newValue = {...props.modelValue}
			delete newValue[name]
			context.emit('update:modelValue', newValue)
		}

		return {
			allNames,
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

	&__column
		&:not(:last-child)
			margin-bottom $input-horiz-margin

		&.ghost
			visibility hidden

	&__add
		padding 0.2em
		width 1.6em
		height 1.6em
		border 1px solid currentCOlor
		border-radius 50%
		color base16('03')
		input-transition(all)
		margin-left -0.2em

		&:hover
			color base16('accent')

		& > .icon
			width 1em
			height 1em
</style>
