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
			<Draggable
				tag="dl"
				v-model="params"
				v-bind="{
					animation: 50,
					disable: false,
				}"
				@start="drag = true"
				@end="drag = false"
				item-key="name"
			>
				<template #item="{element: {name, value: p}}">
					<div class="BrushSettings__param">
						<dt>
							<InputString
								class="BrushSettings__param-name"
								:modelValue="name"
								@update:modelValue="updateParamName(name, $event)"
							/>
						</dt>
						<dd>
							<InputDropdown
								:items="[
									{value: 'slider', label: 'Slider'},
									{value: 'color', label: 'Color'},
									{value: 'seed', label: 'Seed'},
								]"
								:modelValue="p.type"
								@update:modelValue="updateParamType(name, $event)"
							/>
							<template v-if="p.type === 'color'">
								<InputColor
									:modelValue="p.initial"
									@update:modelValue="updateParamData(name, 'initial', $event)"
								/>
							</template>
							<template v-else-if="p.type === 'slider'">
								<InputNumber
									:modelValue="p.min || 0"
									@update:modelValue="updateParamData(name, 'min', $event)"
								/>
								<InputNumber
									:modelValue="p.max || 1"
									@update:modelValue="updateParamData(name, 'max', $event)"
								/>
								<InputSlider
									:modelValue="p.initial || 0.1"
									@update:modelValue="updateParamData(name, 'initial', $event)"
								/>
							</template>
						</dd>
					</div>
				</template>
			</Draggable>
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
import {computed, defineComponent, PropType} from 'vue'
import Draggable from 'vuedraggable'

import InputColor from '@/components/inputs/InputColor.vue'
import InputDropdown from '@/components/inputs/InputDropdown.vue'
import InputNumber from '@/components/inputs/InputNumber.vue'
import InputSlider from '@/components/inputs/InputSlider.vue'
import InputString from '@/components/inputs/InputString.vue'
import MonacoEditor, {
	MonacoEditorMarker,
} from '@/components/layouts/MonacoEditor'
import SvgIcon from '@/components/layouts/SvgIcon.vue'

import {BrushDefinition} from './brush-definition'

export default defineComponent({
	name: 'BrushSettings',
	components: {
		Draggable,
		InputColor,
		InputDropdown,
		InputNumber,
		InputSlider,
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
				console.log('sorted', parameters)
				context.emit('update:modelValue', newValue)
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
