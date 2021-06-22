<template>
	<div class="BrushSettings">
		<header class="BrushSettings__header BrushSettings__section">
			<InputSvgIcon
				class="BrushSettings__icon"
				mode="block"
				:modelValue="modelValue.icon"
				@update:modelValue="
					$emit('update:modelValue', {...modelValue, icon: $event})
				"
			/>
			<InputString
				class="BrushSettings__label label"
				:modelValue="modelValue.label"
				@update:modelValue="
					$emit('update:modelValue', {...modelValue, label: $event})
				"
			/>
		</header>
		<section class="BrushSettings__section">
			<h3>Parameters</h3>
			<InputSchema
				:modelValue="modelValue.params"
				@update:modelValue="
					$emit('update:modelValue', {...modelValue, params: $event})
				"
				:schema="schema"
			/>
		</section>
		<section class="BrushSettings__section">
			<h3>Shader</h3>
			<details class="BrushSettings__frag-desc">
				<summary>Shader Inputs</summary>
				<Markdown :source="fragDeclarationsDesc" />
			</details>

			<MonacoEditor
				class="BrushSettings__shader"
				lang="glsl"
				:modelValue="modelValue.frag"
				:markers="shaderErrors"
				@update:modelValue="
					$emit('update:modelValue', {...modelValue, frag: $event})
				"
			/>
		</section>
	</div>
</template>

<script lang="ts">
import _ from 'lodash'
import {computed, defineComponent, PropType, ref} from 'vue'

import InputString from '@/components/inputs/InputString.vue'
import InputSvgIcon from '@/components/inputs/InputSvgIcon.vue'
import Markdown from '@/components/layouts/Markdown/Markdown.vue'
import MonacoEditor, {
	MonacoEditorMarker,
} from '@/components/layouts/MonacoEditor'

import {BrushDefinition} from './brush-definition'
import InputSchema from './InputSchema/InputSchema.vue'

export default defineComponent({
	name: 'BrushSettings',
	components: {
		InputSchema,
		InputString,
		InputSvgIcon,
		Markdown,
		MonacoEditor,
	},
	props: {
		modelValue: {
			type: Object as PropType<BrushDefinition>,
			required: true,
		},
		fragDeclarations: {
			type: String,
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
				Object.entries(props.modelValue.params).map(([name, value]) => ({
					name,
					value,
				})),
			set: sorted => {
				const params = Object.fromEntries(sorted.map(v => [v.name, v.value]))
				const newValue = {...props.modelValue, params}
				context.emit('update:modelValue', newValue)
			},
		})

		const fragDeclarationsDesc = computed(() => {
			return `\`\`\`glsl
${props.fragDeclarations}
\`\`\`
`
		})

		const schema = ref({
			type: 'object',
			properties: {},
			additionalProperties: {
				type: 'union',
				items: {
					Slider: {
						type: 'object',
						properties: {
							type: {type: 'const', value: 'slider'},
							default: {type: 'number', default: 0},
							min: {type: 'number', default: 0},
							max: {type: 'number', default: 1},
						},
						required: ['type'],
					},
					Angle: {
						type: 'object',
						properties: {
							type: {type: 'const', value: 'angle'},
							default: {type: 'number'},
						},
						required: ['type'],
					},
					Seed: {
						type: 'object',
						properties: {
							type: {type: 'const', value: 'seed'},
						},
						required: ['type'],
					},
					Color: {
						type: 'object',
						properties: {
							type: {type: 'const', value: 'color'},
							default: {type: 'color', default: '#ffffff'},
						},
						required: ['type'],
					},
					Checkbox: {
						type: 'object',
						properties: {
							type: {type: 'const', value: 'checkbox'},
							default: {type: 'boolean'},
						},
						required: ['type'],
					},
					Dropdown: {
						type: 'object',
						properties: {
							type: {type: 'const', value: 'dropdown'},
							items: {type: 'string', default: 'item0,items1'},
							default: {type: 'string', default: 'item0'},
						},
						required: ['type', 'items'],
					},
				},
			},
		})

		function updateParamName(name: string, newName: string) {
			const newValue = {...props.modelValue}
			newValue.params = _.mapKeys(newValue.params, (_, n) =>
				n === name ? newName : n
			)
			context.emit('update:modelValue', newValue)
		}

		function updateParamType(name: string, type: 'slider' | 'color' | 'seed') {
			const newValue = {...props.modelValue}
			newValue.params[name] = {type}

			context.emit('update:modelValue', newValue)
		}

		function updateParamData(name: string, field: string, data: any) {
			const newValue = {...props.modelValue}
			;(newValue.params[name] as any)[field] = data
			context.emit('update:modelValue', newValue)
		}

		return {
			schema,
			params,
			fragDeclarationsDesc,
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
	display flex
	flex-direction column
	height 100%

	&__header
		display flex

	&__icon
		margin-right 1em
		font-size 1.4em

	&__label
		width 100%
		font-size 1.4em

	&__section
		position relative
		display flex
		flex-direction column

		&:not(:last-child)
			padding-bottom 2em

		&:last-child
			flex-grow 1

	&__frag-desc
		margin-bottom 1em
		border 1px solid base16('05', 0.1)
		font-size 1.1em

		summary
			padding 0.4em
			color base16('03')
			cursor pointer

			&:before
				display inline-block
				margin-right 1ch
				content '>'
				font-monospace()
				input-transition(transform)

		&[open] summary:before
			transform rotate(90deg)

		// Overwrite document theme
		pre
			padding 0 0.5em 0.5em !important
			background none !important

	&__shader
		flex-grow 1
</style>
