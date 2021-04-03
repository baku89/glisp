<template>
	<div class="SliderRGB" ref="sliderEl" :style="gradientStyle">
		<button
			class="SliderRGB__circle"
			:class="{tweaking}"
			:style="circleStyle"
		/>
		<teleport to="body">
			<div class="SliderRGB__overlay" v-if="tweaking" />
		</teleport>
	</div>
</template>

<script lang="ts">
import chroma from 'chroma-js'
import {clamp} from 'lodash'
import {computed, defineComponent, PropType, ref} from 'vue'

import useDraggable from '@/components/use/use-draggable'

import {ColorDict} from './InputColorPicker.vue'

function toPartialDict(mode: string, value: number): ColorDict {
	return {[mode]: value}
}

function toCSSColor(color: ColorDict) {
	const {r, g, b} = color
	return chroma(r * 255, g * 255, b * 255).css()
}

export default defineComponent({
	name: 'SliderRGB',
	props: {
		modelValue: {
			type: Object as PropType<ColorDict>,
			required: true,
		},
		mode: {
			type: String,
			required: true,
		},
	},
	setup(props, context) {
		const sliderEl = ref<null | HTMLElement>(null)

		const {isDragging: tweaking} = useDraggable(sliderEl, {
			disableClick: true,
			onDrag({pos: [x], right, left}) {
				const v = clamp((x - left) / (right - left), 0, 1)

				const newDict = toPartialDict(props.mode, v)

				context.emit('update:modelValue', newDict)
			},
		})

		const cssColor = computed(() => {
			const {r, g, b} = props.modelValue
			return chroma(r * 255, g * 255, b * 255).css()
		})

		const gradientStyle = computed(() => {
			const {r, g, b} = props.modelValue
			const rgb = {r, g, b} as ColorDict

			const leftColor = toCSSColor({...rgb, [props.mode]: 0})
			const rightColor = toCSSColor({...rgb, [props.mode]: 1})

			return {
				background: `linear-gradient(to right, ${leftColor} 0%, ${rightColor} 100%)`,
			}
		})

		const circleStyle = computed(() => {
			const v = props.modelValue[props.mode]

			return {
				left: `${v * 100}%`,
				backgroundColor: cssColor.value,
			}
		})

		return {
			sliderEl,
			gradientStyle,
			circleStyle,
			tweaking,
		}
	},
})
</script>

<style lang="stylus">
@import './common.styl'

$circle-diameter = 0.7 * $button-height
$circle-radius = 0.5 * $circle-diameter

.SliderRGB
	position relative
	height $circle-diameter
	border-radius $border-radius

	&__circle
		circle()
		z-index 2

	&__overlay
		input-overlay()
		cursor none
</style>
