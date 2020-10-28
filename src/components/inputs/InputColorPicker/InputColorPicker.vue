<template>
	<div class="InputColorPicker">
		<div class="InputColorPicker__wrapper">
			<div
				class="InputColorPicker__picker"
				v-for="({name}, i) in pickerData"
				:key="i"
			>
				<component
					:is="name"
					:modelValue="colorDict"
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
		dict.r = r
		dict.g = g
		dict.b = b
	}

	if (space.endsWith('a')) {
		dict.a = c.alpha()
	}

	return dict
}

function fromColorDict(dict: ColorDict): string {
	const c = chroma(
		dict.r * 255 ?? 0,
		dict.g * 255 ?? 0,
		dict.b * 255 ?? 0
	).alpha(dict.a ?? 1)
	return c.hex()
}

export default defineComponent({
	name: 'InputColorPicker',
	components: {
		SliderHSV,
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
			type: Array as PropType<string[]>,
			default: ['hsv', 'a'],
		},
	},
	setup(props, context) {
		const colorDict = shallowRef<ColorDict>({})

		const colorString = computed(() => fromColorDict(colorDict.value))

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

			const newValue = fromColorDict(newDict)
			context.emit('update:modelValue', newValue)
		}

		const pickerData = computed(() =>
			props.pickers
				.map(picker => {
					switch (picker) {
						case 'hsv':
							return {name: 'SliderHSV'}
						case 'a':
							return {name: 'SliderAlpha'}
						default:
							return null
					}
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