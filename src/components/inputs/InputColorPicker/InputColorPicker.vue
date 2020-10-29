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
					:modelValue="colorDict"
					:mode="mode"
					@update:modelValue="onUpdateColorDict"
				/>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import chroma from 'chroma-js'
import {
	defineComponent,
	ref,
	watch,
	computed,
	shallowRef,
	watchEffect,
	PropType,
} from 'vue'

import SliderHSV from './SliderHSV.vue'
import SliderHSVRadial from './SliderHSVRadial.vue'
import SliderRGB from './SliderRGB.vue'
import SliderAlpha from './SliderAlpha.vue'

export type ColorDict = {[name: string]: number}

function toColorDict(value: string, space: string): ColorDict | null {
	const dict: ColorDict = {}

	if (!chroma.valid(value)) {
		return null
	}

	const c = chroma(value)

	if (space.startsWith('rgb')) {
		const [r, g, b] = c.rgb()
		dict.r = r / 255
		dict.g = g / 255
		dict.b = b / 255
	}

	if (space.endsWith('a')) {
		dict.a = c.alpha()
	}

	return dict
}

function fromColorDict(dict: ColorDict, space: string): string {
	const c = chroma(
		dict.r * 255 ?? 0,
		dict.g * 255 ?? 0,
		dict.b * 255 ?? 0
	).alpha(dict.a && space.endsWith('a') ? dict.a : 1)
	return c.hex()
}

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
	setup(props, context) {
		const colorDict = shallowRef<ColorDict>({})

		const colorString = computed(() =>
			fromColorDict(colorDict.value, props.colorSpace)
		)

		watch(
			() => props.modelValue,
			() => {
				if (props.modelValue !== colorString.value) {
					const dict = toColorDict(props.modelValue, props.colorSpace)

					if (!dict) {
						return
					}

					colorDict.value = dict
				}
			},
			{immediate: true}
		)

		function onUpdateColorDict(newPartialDict: ColorDict) {
			const newDict = {...colorDict.value, ...newPartialDict}
			colorDict.value = newDict

			const newValue = fromColorDict(newDict, props.colorSpace)
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
			colorDict,
			onUpdateColorDict,
			pickerData,
		}
	},
})
</script>

<style lang="stylus">
@import './common.styl'

.InputColorPicker
	padding $circle-diameter * 0.8

	&__wrapper
		position relative

	&__picker
		margin-bottom $picker-gap

		&:last-child
			margin-bottom 0
</style>