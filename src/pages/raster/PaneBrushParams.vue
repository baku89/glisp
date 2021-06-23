<template>
	<InputSchema
		:modelValue="brushParams"
		@update:modelValue="commit('viewport.setBrushParams', $event)"
		:schema="schema"
	/>
</template>

<script lang="ts">
import _ from 'lodash'
import {computed, defineComponent, inject} from 'vue-demi'

import {Store} from '@/lib/store'

import {BrushDefinition} from './brush-definition'
import InputSchema from './InputSchema'
import {Schema} from './InputSchema/type'

export default defineComponent({
	name: 'PaneBrushParams',
	components: {
		InputSchema,
	},
	setup() {
		const store = inject('store') as Store

		const brushParams = store.getState('viewport.brushParams')
		const currentBrush = store.getState<BrushDefinition>(
			'viewport.currentBrush'
		)

		const schema = computed(() => {
			const result: Schema = {type: 'object', properties: {}, required: []}
			const properties = result.properties

			_.entries(currentBrush.value.params).forEach(([name, def]) => {
				switch (def.type) {
					case 'slider':
						properties[name] = {...def, type: 'number', ui: 'slider'}
						break
					case 'angle':
						properties[name] = {...def, type: 'number', ui: 'angle'}
						break
					case 'seed':
						properties[name] = {...def, type: 'number', ui: 'seed'}
						break
					case 'color':
						properties[name] = {...def, type: 'color'}
						break
					case 'checkbox':
						properties[name] = {...def, type: 'boolean'}
						break
					case 'dropdown':
						properties[name] = {...def, type: 'string', ui: 'dropdown'}
						break
					case 'cubicBezier':
						properties[name] = {...def, type: 'cubicBezier'}
				}
			})
			return result
		})

		return {
			commit: store.commit,
			brushParams,
			schema,
		}
	},
})
</script>
