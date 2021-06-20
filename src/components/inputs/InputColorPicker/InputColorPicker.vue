<template>
	<div class="InputColorPicker">
		<div class="InputColorPicker__wrapper">
			<div
				class="InputColorPicker__picker"
				v-for="({name, mode}, i) in pickerData"
				:key="i"
			>
				<component
					:is="name"
					:rgba="rgba"
					:mode="mode"
					@partialUpdate="onPartialUpdate"
				/>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import {computed, defineComponent, shallowRef, watch} from 'vue'

import SliderAlpha from './SliderAlpha.vue'
import SliderHSV from './SliderHSV.vue'
import SliderHSVRadial from './SliderHSVRadial.vue'
import SliderRGB from './SliderRGB.vue'
import {color2rgba, RGBA, rgba2color} from './use-hsv'

export default defineComponent({
	name: 'InputColorPicker',
	components: {
		SliderHSV,
		SliderHSVRadial,
		SliderRGB,
		SliderAlpha,
	},
	props: {
		modelValue: {
			type: String,
			required: true,
		},
		colorSpace: {
			type: String,
			default: 'rgba',
		},
		pickers: {
			type: String,
			default: 'svh|a',
		},
	},
	emit: ['update:modelValue'],
	setup(props, context) {
		const rgba = shallowRef<RGBA>({r: 0, g: 0, b: 0, a: 0})

		const colorString = computed(() => rgba2color(rgba.value, props.colorSpace))

		watch(
			() => props.modelValue,
			() => {
				if (props.modelValue !== colorString.value) {
					const _rgba = color2rgba(props.modelValue, props.colorSpace)

					if (!_rgba) {
						return
					}

					rgba.value = _rgba
				}
			},
			{immediate: true}
		)

		function onPartialUpdate(newPartialDict: Partial<RGBA>) {
			const newDict = {...rgba.value, ...newPartialDict}
			rgba.value = newDict

			const newValue = rgba2color(newDict, props.colorSpace)
			context.emit('update:modelValue', newValue)
		}

		const pickerData = computed(() =>
			props.pickers
				.split('|')
				.map(picker => {
					if (/^[hsv]{3}$/.test(picker)) {
						return {name: 'SliderHSV', mode: picker}
					} else if (['r', 'g', 'b'].includes(picker)) {
						return {name: 'SliderRGB', mode: picker}
					} else if (picker === 'hsvr') {
						return {name: 'SliderHSVRadial'}
					} else if (picker === 'a') {
						return {name: 'SliderAlpha'}
					}

					return null
				})
				.filter(Boolean)
		)

		return {
			rgba,
			onPartialUpdate,
			pickerData,
		}
	},
})
</script>

<style lang="stylus">
@import './common.styl'

.InputColorPicker
	padding: $circle-diameter * 0.8

	&__wrapper
		position relative

	&__picker
		margin-bottom $picker-gap

		&:last-child
			margin-bottom 0
</style>
