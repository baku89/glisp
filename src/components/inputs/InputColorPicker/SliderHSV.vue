<template>
	<div class="SliderHSV">
		<div class="SliderHSV__pad" ref="padEl">
			<GlslCanvas
				class="SliderHSV__canvas"
				:fragmentString="PadFragmentString"
				:uniforms="padUniforms"
			/>
			<button class="SliderHSV__circle pad" :style="padCircleStyle" />
		</div>
		<div class="SliderHSV__slider" ref="sliderEl">
			<GlslCanvas
				class="SliderHSV__canvas"
				:fragmentString="SliderFragmentString"
				:uniforms="sliderUniforms"
			/>
			<button class="SliderHSV__circle" :style="sliderCircleStyle" />
		</div>
	</div>
	<teleport to="body">
		<div class="SliderHSV__overlay" v-if="tweaking" />
	</teleport>
</template>

<script lang="ts">
import {defineComponent, PropType, ref, computed, watch} from 'vue'
import chroma from 'chroma-js'

import {clamp, unsignedMod} from '@/utils'
import GlslCanvas from '@/components/layouts/GlslCanvas.vue'
import useDraggable from '@/components/use/use-draggable'
import PadFragmentString from './picker-hsv-pad.frag'
import SliderFragmentString from './picker-hsv-slider.frag'

import {ColorDict} from './InputColorPicker.vue'

function toRGBDict({h, s, v}: ColorDict): ColorDict {
	const [r, g, b] = chroma.hsv(h * 360, s, v).rgb()
	return {r: r / 255, g: g / 255, b: b / 255}
}

function toCSSColor({h, s, v}: ColorDict) {
	return chroma.hsv(h * 360, s, v).css()
}

function equalColor(x: ColorDict, y: ColorDict) {
	return x.r === y.r && x.g === y.g && x.b === y.b
}

function modeToIndex(element: string) {
	return element === 'h' ? 0 : element === 's' ? 1 : 2
}

export default defineComponent({
	name: 'SliderHSV',
	components: {
		GlslCanvas,
	},
	props: {
		modelValue: {
			type: Object as PropType<ColorDict>,
			required: true,
		},
		mode: {
			type: String,
			default: 'svh',
		},
	},
	emits: ['update:modelValue'],
	setup(props, context) {
		const hsv = ref<ColorDict>({h: 0, s: 1, v: 1})

		// Update hsv
		watch(
			() => props.modelValue,
			() => {
				if (equalColor(props.modelValue, toRGBDict(hsv.value))) {
					return
				}

				const {r, g, b} = props.modelValue
				const [h, s, v] = chroma(r * 255, g * 255, b * 255).hsv()

				hsv.value = {
					h: isNaN(h) ? hsv.value.h : h / 360,
					s,
					v,
				}
			},
			{immediate: true}
		)

		function update(newHSV: ColorDict) {
			hsv.value = newHSV
			const newDict = toRGBDict(newHSV)
			context.emit('update:modelValue', newDict)
		}

		// Pad
		const padEl = ref<null | HTMLElement>(null)

		const {isDragging: tweakingPad} = useDraggable(padEl, {
			disableClick: true,
			onDrag({pos: [x, y], top, right, bottom, left}) {
				const newHSV = {...hsv.value}

				const modes = props.mode.slice(0, 2).split('')
				const ts = [(x - left) / (right - left), 1 - (y - top) / (bottom - top)]

				for (let i = 0; i < 2; i++) {
					const m = modes[i]
					const t = ts[i]

					if (m === 'h') {
						newHSV.h = unsignedMod(t, 1)
					} else if (m === 's') {
						newHSV.s = clamp(t, 0, 1)
					} else if (m === 'v') {
						newHSV.v = clamp(t, 0, 1)
					}
				}

				update(newHSV)
			},
		})

		const padCircleStyle = computed(() => {
			const xIndex = modeToIndex(props.mode[0])
			const yIndex = modeToIndex(props.mode[1])

			const x = hsv.value[xIndex]
			const y = hsv.value[yIndex]

			return {
				left: `${x * 100}%`,
				top: `${(1 - y) * 100}%`,
				background: toCSSColor(hsv.value),
				transform: tweakingPad.value ? 'scale(2)' : '',
			}
		})

		const padUniforms = computed(() => {
			const {h, s, v} = hsv.value
			return {
				hsv: [h, s, v],
				modeX: modeToIndex(props.mode[0]),
				modeY: modeToIndex(props.mode[1]),
			}
		})

		// Slider
		const sliderEl = ref<null | HTMLElement>(null)

		const {isDragging: tweakingSlider} = useDraggable(sliderEl, {
			disableClick: true,
			onDrag({pos: [x], right, left}) {
				const mode = props.mode[2]
				const t = (x - left) / (right - left)
				const newHSV = {...hsv.value}

				if (mode === 'h') {
					newHSV.h = unsignedMod(t, 1)
				} else if (mode === 's') {
					newHSV.s = clamp(t, 0, 1)
				} else if (mode === 'v') {
					newHSV.v = clamp(t, 0, 1)
				}

				update(newHSV)
			},
		})

		const sliderCircleStyle = computed(() => {
			const mode = props.mode[2]
			const t = hsv.value[modeToIndex(mode)]
			const bg = toCSSColor(
				mode === 'h' ? {...hsv.value, s: 1, v: 1} : hsv.value
			)

			return {
				left: `${t * 100}%`,
				background: bg,
				transform: tweakingSlider.value ? 'scale(2)' : '',
			}
		})

		const sliderUniforms = computed(() => {
			const {h, s, v} = hsv.value
			return {
				hsv: [h, s, v],
				mode: modeToIndex(props.mode[2]),
			}
		})

		// Tweaking
		const tweaking = computed(() => tweakingPad.value || tweakingSlider.value)

		return {
			hsv,

			PadFragmentString,
			padEl,
			padCircleStyle,
			padUniforms,

			SliderFragmentString,
			sliderEl,
			sliderCircleStyle,
			sliderUniforms,

			tweaking,
		}
	},
})
</script>

<style lang="stylus">
@import './common.styl'

.SliderHSV
	&__canvas
		position absolute
		top 0
		left 0
		width 100%
		height 100%
		border-radius $border-radius

	&__circle
		circle()
		z-index 1

		&.pad
			margin-top -1 * $circle-radius

	&__pad
		position relative
		margin-bottom $picker-gap
		padding-top 100%
		height 0
		border-radius $border-radius

	&__slider
		position relative
		height $circle-diameter

	&__overlay
		input-overlay()
		cursor none
</style>