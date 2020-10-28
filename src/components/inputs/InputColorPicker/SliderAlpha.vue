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
@import '../../style/common.styl'

$circle-diameter = 0.7 * $button-height
$circle-radius = 0.5 * $circle-diameter

.SliderAlpha
	position relative
	margin 0 $circle-radius $circle-radius
	width 'calc(100% - %s)' % $circle-diameter
	height $circle-diameter
	background-checkerboard()
	border-radius $border-radius

	&__gradient
		position absolute
		width 100%
		height 100%
		border-radius $border-radius

	&__circle
		position absolute
		z-index 2
		margin - $circle-radius
		margin-top 0
		width $circle-diameter
		height $circle-diameter
		border-radius 50%
		box-shadow 0 0 0 1.5px #fff, inset 0 0 0px 1px rgba(0, 0, 0, 0.1), 0 0 1px 2px rgba(0, 0, 0, 0.4)
		background-checkerboard()
		overflow hidden
		transition transform 0.03s ease

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