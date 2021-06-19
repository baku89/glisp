<template>
	<div class="BrushSettings">
		<header class="BrushSettings__header">
			<SvgIcon
				class="BrushSettings__icon"
				mode="block"
				v-html="modelValue.icon"
			/>
			<InputString
				class="BrushSettings__label"
				:modelValue="modelValue.label"
				@update:modelValue="
					$emit('update:modelValue', {...modelValue, label: $event})
				"
			/>
		</header>
		<main class="BrushSettings__parameters">
			<h3>Parameters</h3>
			<InputSchema
				:modelValue="modelValue.parameters"
				@update:modelValue="
					$emit('update:modelValue', {...modelValue, parameters: $event})
				"
				:schema="schema"
			/>
		</main>
		<main>
			<h3>Shader</h3>
			<MonacoEditor
				class="BrushSettings__shader"
				lang="glsl"
				:modelValue="modelValue.frag"
				:markers="shaderErrors"
				@update:modelValue="
					$emit('update:modelValue', {...modelValue, frag: $event})
				"
			/>
		</main>
	</div>
</template>

<script lang="ts">
import _ from 'lodash'
import {computed, defineComponent, PropType, ref} from 'vue'

import InputString from '@/components/inputs/InputString.vue'
import MonacoEditor, {
	MonacoEditorMarker,
} from '@/components/layouts/MonacoEditor'
import SvgIcon from '@/components/layouts/SvgIcon.vue'

import {BrushDefinition} from './brush-definition'
import InputSchema from './InputSchema/InputSchema.vue'

export default defineComponent({
	name: 'BrushSettings',
	components: {
		InputSchema,
		InputString,
		MonacoEditor,
		SvgIcon,
	},
	props: {
		modelValue: {
			type: Object as PropType<BrushDefinition>,
			required: true,
		},
		shaderErrors: {
			type: Array as PropType<MonacoEditorMarker[]>,
		},
	},
	emits: ['update:modelValue'],
	setup(props, context) {
		const params = computed({
			get: () =>
				Object.entries(props.modelValue.parameters).map(([name, value]) => ({
					name,
					value,
				})),
			set: sorted => {
				const parameters = Object.fromEntries(
					sorted.map(v => [v.name, v.value])
				)
				const newValue = {...props.modelValue, parameters}
				context.emit('update:modelValue', newValue)
			},
		})

		const schema = ref({
			type: 'object',
			properties: {},
			additionalProperties: {
				type: 'union',
				items: {
					slider: {
						type: 'object',
						properties: {
							type: {type: 'const', value: 'slider'},
							default: {type: 'number', default: 0},
						},
					},
					color: {
						type: 'object',
						properties: {
							type: {type: 'const', value: 'color'},
							default: {type: 'color', default: '#ffffff'},
						},
					},
					seed: {
						type: 'object',
						properties: {
							type: {type: 'const', value: 'seed'},
						},
					},
				},
			},
		})

		function updateParamName(name: string, newName: string) {
			const newValue = {...props.modelValue}
			newValue.parameters = _.mapKeys(newValue.parameters, (_, n) =>
				n === name ? newName : n
			)
			context.emit('update:modelValue', newValue)
		}

		function updateParamType(name: string, type: 'slider' | 'color' | 'seed') {
			const newValue = {...props.modelValue}
			newValue.parameters[name] = {type}

			context.emit('update:modelValue', newValue)
		}

		function updateParamData(name: string, field: string, data: any) {
			const newValue = {...props.modelValue}
			;(newValue.parameters[name] as any)[field] = data
			context.emit('update:modelValue', newValue)
		}

		return {
			schema,
			params,
			updateParamName,
			updateParamType,
			updateParamData,
		}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'

.BrushSettings
	&__header
		display flex
		margin-bottom 1em

	&__icon
		margin-right 1em
		width 2em

	&__label
		width 100%
		font-size 1.4em

	&__parameters
		padding-bottom 1em

	&__param
		display grid
		margin-bottom 0.5em
		cursor move
		grid-template-columns 7em 1fr
		gap 1em

		dt, dd
			line-height $input-height

		dd
			display flex
			gap 0.3em

	&__param-name
		width 8em

	&__shader
		height 20em
</style>
