<template>
	<div class="BrushSettings">
		<header class="BrushSettings__header">
			<InputSvgIcon
				class="BrushSettings__icon"
				mode="block"
				:modelValue="brush.icon"
				@update:modelValue="updateBrush({...brush, icon: $event})"
			/>
			<InputString
				class="BrushSettings__label label"
				:modelValue="brush.label"
				@update:modelValue="updateBrush({...brush, label: $event})"
			/>
		</header>
		<section class="BrushSettings__section">
			<h3>Parameters</h3>
			<InputSchema
				:modelValue="brush.params"
				@update:modelValue="updateBrush({...brush, params: $event})"
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
				:modelValue="brush.frag"
				:markers="shaderErrors"
				@update:modelValue="updateBrush({...brush, frag: $event})"
			/>
		</section>
	</div>
</template>

<script lang="ts">
import {computed, defineComponent, inject, ref} from 'vue'

import InputString from '@/components/inputs/InputString.vue'
import InputSvgIcon from '@/components/inputs/InputSvgIcon.vue'
import Markdown from '@/components/layouts/Markdown/Markdown.vue'
import MonacoEditor, {
	MonacoEditorMarker,
} from '@/components/layouts/MonacoEditor'
import {Store} from '@/lib/store'
import {validateAlphanumericIdentifier} from '@/lib/validator'

import {BrushDefinition} from './brush-definition'
import InputSchema from './InputSchema/InputSchema.vue'
import {Schema} from './InputSchema/type'

export default defineComponent({
	name: 'BrushSettings',
	components: {
		InputSchema,
		InputString,
		InputSvgIcon,
		Markdown,
		MonacoEditor,
	},
	emits: ['update:modelValue'],
	setup() {
		const store = inject('store') as Store

		const brush = store.getState<BrushDefinition>('viewport.currentBrush')
		const shaderErrors = store.getState<MonacoEditorMarker[]>(
			'viewport.shaderErrors'
		)
		const fragDeclarations = store.getState<string>('viewport.fragDeclarations')

		const params = computed({
			get: () =>
				Object.entries(brush.value.params).map(([name, value]) => ({
					name,
					value,
				})),
			set: sorted => {
				const params = Object.fromEntries(sorted.map(v => [v.name, v.value]))
				const newValue = {...brush.value, params}
				store.commit('viewport.updateCurrentBrush', newValue)
			},
		})

		const fragDeclarationsDesc = computed(() => {
			return '```glsl\n' + fragDeclarations.value + '\n```'
		})

		const schema = ref<Schema>({
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
							clampMin: {type: 'boolean', default: false},
							clampMax: {type: 'boolean', default: false},
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
					CubicBezier: {
						type: 'object',
						properties: {
							type: {type: 'const', value: 'cubicBezier'},
							default: {type: 'cubicBezier'},
						},
						required: ['type'],
					},
				},
			},
			required: [],
			additionalValidator: validateAlphanumericIdentifier,
			additionalInfix: '',
		})

		function updateBrush(brush: BrushDefinition) {
			store.commit('viewport.updateCurrentBrush', brush)
		}

		return {
			brush,
			schema,
			params,
			fragDeclarationsDesc,
			shaderErrors,
			updateBrush,
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

	&__header, &__section
		&:not(:last-child)
			padding-bottom 2em

	&__header
		display flex

	&__icon
		margin-right 0.3em
		font-size 1.4em

	&__label
		width 100%
		font-size 1.4em

	&__section
		position relative
		display flex
		flex-direction column

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
