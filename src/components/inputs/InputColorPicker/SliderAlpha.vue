<template>
	<div class="SliderAlpha" ref="sliderEl">
		<div class="SliderAlpha__gradient" :style="gradientStyle" />
		<button class="SliderAlpha__circle" :style="circleStyle">
			<span class="SliderAlpha__circle-color" :style="circleColorStyle" />
		</button>
	</div>
	<teleport to="body">
		<div class="SliderAlpha__overlay" v-if="tweaking" />
	</teleport>
</template>

<script lang="ts">
import {defineComponent, PropType, computed, ref} from 'vue'
import chroma from 'chroma-js'

import {clamp} from '@/utils'
import {ColorDict} from './InputColorPicker.vue'
import useDraggable from '@/components/use/use-draggable'

function toAlphaDict(alpha: number): ColorDict {
	return {a: alpha}
}

export default defineComponent({
	name: 'SliderAlpha',
	props: {
		modelValue: {
			type: Object as PropType<ColorDict>,
			required: true,
		},
	},
	setup(props, context) {
		const sliderEl = ref<null | HTMLElement>(null)

		const {isDragging: tweaking} = useDraggable(sliderEl, {
			disableClick: true,
			onDrag({pos: [x], right, left}) {
				const a = clamp((x - left) / (right - left), 0, 1)

				const newDict = toAlphaDict(a)

				context.emit('update:modelValue', newDict)
			},
		})

		const cssColor = computed(() => {
			const {r, g, b} = props.modelValue
			return chroma(r * 255, g * 255, b * 255).css()
		})

		const gradientStyle = computed(() => {
			const bg = cssColor.value
			return {
				background: `linear-gradient(to right, transparent 0%, ${bg} 100%)`,
			}
		})

		const circleStyle = computed(() => {
			const a = props.modelValue.a

			return {
				left: `${a * 100}%`,
				transform: tweaking.value ? 'scale(2)' : '',
			}
		})

		const circleColorStyle = computed(() => {
			return {
				backgroundColor: cssColor.value,
				opacity: props.modelValue.a,
			}
		})

		return {
			sliderEl,
			gradientStyle,
			circleStyle,
			circleColorStyle,
			tweaking,
		}
	},
})
</script>

<style lang="stylus">
@import './common.styl'

$circle-diameter = 0.7 * $button-height
$circle-radius = 0.5 * $circle-diameter

.SliderAlpha
	position relative
	height $circle-diameter
	background-checkerboard()
	border-radius $border-radius

	&__gradient
		position absolute
		width 100%
		height 100%
		border-radius $border-radius

	&__circle
		circle()
		background-checkerboard()
		z-index 2
		overflow hidden
		margin-top 0 !important

	&__circle-color
		position absolute
		top 0
		left 0
		width 100%
		height 100%

	&__overlay
		input-overlay()
		cursor none
</style>