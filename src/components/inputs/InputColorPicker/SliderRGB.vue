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
import {fitTo01} from '@/utils'

import {RGBA, rgba2color} from './use-hsv'

export default defineComponent({
	name: 'SliderRGB',
	props: {
		rgba: {
			type: Object as PropType<RGBA>,
			required: true,
		},
		mode: {
			type: String,
			required: true,
		},
	},
	emit: ['partialUpdate'],
	setup(props, context) {
		const sliderEl = ref<null | HTMLElement>(null)

		const {isDragging: tweaking} = useDraggable(sliderEl, {
			disableClick: true,
			onDrag({pos: [x], right, left}) {
				const v = clamp(fitTo01(x, left, right), 0, 1)

				context.emit('partialUpdate', {[props.mode]: v})
			},
		})

		const cssColor = computed(() => {
			const {r, g, b} = props.rgba
			return chroma(r * 255, g * 255, b * 255).css()
		})

		const gradientStyle = computed(() => {
			const currentColor = {...props.rgba, a: 1}
			const leftColor = rgba2color({...currentColor, [props.mode]: 0}, false)
			const rightColor = rgba2color({...currentColor, [props.mode]: 1}, false)

			return {
				background: `linear-gradient(to right, ${leftColor} 0%, ${rightColor} 100%)`,
			}
		})

		const circleStyle = computed(() => {
			const v = props.rgba[props.mode as keyof RGBA]

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

$circle-diameter = 0.7 * $subcontrol-height
$circle-radius = 0.5 * $circle-diameter

.SliderRGB
	position relative
	height $circle-diameter
	border-radius $input-round

	&__circle
		circle()
		z-index 2

	&__overlay
		input-overlay()
		cursor none
</style>
