<template>
	<InputSchema
		:modelValue="brushParams"
		@update:modelValue="commit('viewport.setBrushParams', $event)"
		:schema="schema"
	/>
</template>

<script lang="ts">
import {flow} from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import _ from 'lodash'
import {computed, defineComponent, inject} from 'vue-demi'

import {Validator} from '@/lib/fp'
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
					case 'slider': {
						let validator: Validator<number> = O.some
						if (def.clampMin && _.isNumber(def.min)) {
							validator = flow(_.partial(Math.max, def.min), O.some)
						}
						if (def.clampMax && _.isNumber(def.max)) {
							validator = flow(validator, O.map(_.partial(Math.min, def.max)))
						}
						properties[name] = {
							min: 0,
							max: 1,
							...def,
							type: 'number',
							precision: 3,
							validator,
						}
						break
					}
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
