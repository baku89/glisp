<template>
	<div class="InputSchemaUnion">
		<InputDropdown
			:modelValue="matchSchema[0]"
			:items="names"
			@update:modelValue="switchSchema"
			:updateOnBlur="true"
		/>
		<InputSchema
			:modelValue="modelValue"
			@update:modelValue="$emit('update:modelValue', $event)"
			:schema="matchSchema[1]"
		/>
	</div>
</template>

<script lang="ts">
import _ from 'lodash'
import {computed, defineComponent, PropType} from 'vue'

import InputDropdown from '@/components/inputs/InputDropdown.vue'

import InputSchema from './InputSchema.vue'
import {Data, SchemaUnion} from './type'
import {cast, matchUnion} from './validator'

export default defineComponent({
	name: 'InputSchemaUnion',
	components: {
		InputDropdown,
	},
	props: {
		modelValue: {
			type: [Number, String, Object] as PropType<Data>,
			required: true,
		},
		schema: {
			type: Object as PropType<SchemaUnion>,
			required: true,
		},
	},
	emits: ['update:modelValue'],
	beforeCreate: function () {
		this.$options.components ||= {}
		this.$options.components.InputSchema = InputSchema
	},
	setup(props, context) {
		const names = computed(() => _.keys(props.schema.items))

		const matchSchema = computed(() => {
			const match = matchUnion(props.modelValue, props.schema)
			if (match) return match

			const name = _.keys(props.schema.items)[0]
			return [name, props.schema.items[name]]
		})

		function switchSchema(name: string) {
			const schema = props.schema.items[name]
			const newData = cast(null, schema)
			console.log(newData)

			context.emit('update:modelValue', newData)
		}

		return {names, matchSchema, switchSchema}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'

.InputSchemaUnion
	display grid
	grid-template-columns min-content 1fr
	grid-gap 1em
</style>
