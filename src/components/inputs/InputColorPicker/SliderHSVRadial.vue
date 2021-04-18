<template>
	<div class="SliderHSVRadial">
		<div class="SliderHSVRadial__pad" ref="padEl">
			<div class="SliderHSVRadial__pad-mask">
				<GlslCanvas
					class="SliderHSVRadial__canvas"
					:fragmentString="RadialFragmentString"
					:uniforms="padUniforms"
				/>
			</div>
			<button
				class="SliderHSVRadial__circle pad"
				:class="{tweaking: padTweaking}"
				:style="padCircleStyle"
			/>
		</div>
		<div class="SliderHSVRadial__slider" ref="sliderEl">
			<GlslCanvas
				class="SliderHSVRadial__canvas"
				:fragmentString="SliderFragmentString"
				:uniforms="sliderUniforms"
			/>
			<button
				class="SliderHSVRadial__circle"
				:class="{tweaking: sliderTweaking}"
				:style="sliderCircleStyle"
			/>
		</div>
		<teleport to="body">
			<div class="SliderHSVRadial__overlay" v-if="tweaking" />
		</teleport>
	</div>
</template>

<script lang="ts">
import {vec2} from 'gl-matrix'
import {clamp} from 'lodash'
import {computed, defineComponent, PropType, ref, toRef} from 'vue'

import GlslCanvas from '@/components/layouts/GlslCanvas.vue'
import useDraggable from '@/components/use/use-draggable'
import {fitTo01, unsignedMod} from '@/utils'

import {ColorDict} from './InputColorPicker.vue'
import RadialFragmentString from './picker-hsv-radial.frag'
import SliderFragmentString from './picker-hsv-slider.frag'
import useHSV, {toCSSColor} from './use-hsv'

export default defineComponent({
	name: 'SliderHSVRadial',
	components: {
		GlslCanvas,
	},
	props: {
		modelValue: {
			type: Object as PropType<ColorDict>,
			required: true,
		},
	},
	emits: ['update:modelValue'],
	setup(props, context) {
		const {hsv, update} = useHSV(toRef(props, 'modelValue'), context)

		// Pad
		const padEl = ref<null | HTMLElement>(null)

		const {isDragging: padTweaking} = useDraggable(padEl, {
			disableClick: true,
			onDrag({pos: [x, y], top, right, bottom, left}) {
				// const newHSV = {...hsv.value}

				const tx = fitTo01(x, left, right) * 2 - 1
				const ty = fitTo01(y, bottom, top) * 2 - 1

				const h = unsignedMod(Math.atan2(ty, tx), Math.PI * 2) / (Math.PI * 2)
				const s = Math.min(vec2.len([tx, ty]), 1)
				const v = hsv.value.v

				const newHSV = {
					h,
					s,
					v,
				}

				update(newHSV)
			},
		})

		const padCircleStyle = computed(() => {
			const {h, s} = hsv.value

			const x = 0.5 + (Math.cos(h * Math.PI * 2) / 2) * s
			const y = 0.5 + (Math.sin(h * Math.PI * 2) / 2) * s

			return {
				left: `${x * 100}%`,
				bottom: `${y * 100}%`,
				background: toCSSColor(hsv.value),
			}
		})

		const padUniforms = computed(() => {
			const {h, s, v} = hsv.value
			return {
				hsv: [h, s, v],
			}
		})

		// Slider
		const sliderEl = ref<null | HTMLElement>(null)

		const {isDragging: sliderTweaking} = useDraggable(sliderEl, {
			disableClick: true,
			onDrag({pos: [x], right, left}) {
				const v = clamp((x - left) / (right - left), 0, 1)
				const newHSV = {...hsv.value, v}

				update(newHSV)
			},
		})

		const sliderCircleStyle = computed(() => {
			const t = hsv.value.v
			const bg = toCSSColor(hsv.value)

			return {
				left: `${t * 100}%`,
				background: bg,
			}
		})

		const sliderUniforms = computed(() => {
			const {h, s, v} = hsv.value
			return {
				hsv: [h, s, v],
				mode: 2, // Value,
			}
		})

		// Tweaking
		const tweaking = computed(() => padTweaking.value || sliderTweaking.value)

		return {
			hsv,

			RadialFragmentString,
			padEl,
			padCircleStyle,
			padUniforms,
			padTweaking,

			SliderFragmentString,
			sliderEl,
			sliderCircleStyle,
			sliderUniforms,
			sliderTweaking,

			tweaking,
		}
	},
})
</script>

<style lang="stylus">
@import './common.styl'

.SliderHSVRadial
	&__canvas
		position absolute
		top 0
		left 0
		width 100%
		height 100%
		border-radius $input-round

	&__circle
		circle()
		z-index 1

		&.pad
			margin-bottom -1 * $circle-radius

	&__pad
		position relative
		margin-bottom $picker-gap
		padding-top 100%
		height 0
		border-radius $input-round

	&__pad-mask
		position absolute
		top 0
		overflow hidden
		width 100%
		height 100%
		border-radius 50%

	&__slider
		position relative
		height $circle-diameter

	&__overlay
		input-overlay()
		cursor none
</style>
