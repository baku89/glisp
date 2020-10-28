<template>
	<div class="SliderHSV">
		<div class="SliderHSV__sv" ref="svBoxEl">
			<GlslCanvas
				class="SliderHSV__canvas"
				:fragmentString="SVFragmentString"
				:uniforms="svUniforms"
			/>
			<button class="SliderHSV__circle" :style="svCircleStyle" />
		</div>
		<div class="SliderHSV__hue" ref="hueBoxEl">
			<GlslCanvas
				class="SliderHSV__canvas"
				:fragmentString="HueFragmentString"
			/>
			<button class="SliderHSV__circle hue" :style="hueCircleStyle" />
		</div>
	</div>
	<teleport to="body">
		<div class="SliderHSV__overlay" v-if="tweaking" />
	</teleport>
</template>

<script lang="ts">
import {defineComponent, PropType, ref, computed, watch} from 'vue'
import chroma from 'chroma-js'

import {clamp} from '@/utils'
import GlslCanvas from '@/components/layouts/GlslCanvas.vue'
import useDraggable from '@/components/use/use-draggable'
import SVFragmentString from './picker-sv.frag'
import HueFragmentString from './picker-hue.frag'

import {ColorDict} from './InputColorPicker.vue'

const unsignedMod = (x: number, y: number) => ((x % y) + y) % y

function toRGBDict(hsv: [number, number, number]): ColorDict {
	const [r, g, b] = chroma.hsv(...hsv).rgb()
	return {r: r / 255, g: g / 255, b: b / 255}
}

function equalRGB(x: ColorDict, y: ColorDict) {
	return x.r === y.r && x.g === y.g && x.b === y.b
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
	},
	emits: ['update:modelValue'],
	setup(props, context) {
		const hsv = ref<[number, number, number]>([0, 0, 0])

		// Update hsv
		watch(
			() => props.modelValue,
			() => {
				if (equalRGB(props.modelValue, toRGBDict(hsv.value))) {
					return
				}

				const {r, g, b} = props.modelValue
				const _hsv = chroma(r * 255, g * 255, b * 255).hsv()

				if (isNaN(_hsv[0])) {
					_hsv[0] = hsv.value[0]
				}

				hsv.value = _hsv
			},
			{immediate: true}
		)

		function update(newHSV: [number, number, number]) {
			hsv.value = newHSV
			const newDict = toRGBDict(newHSV)
			context.emit('update:modelValue', newDict)
		}

		// SV
		const svBoxEl = ref<null | HTMLElement>(null)

		const {isDragging: tweakingSV} = useDraggable(svBoxEl, {
			disableClick: true,
			onDrag({pos: [x, y], top, right, bottom, left}) {
				const h = hsv.value[0]
				const s = clamp((x - left) / (right - left), 0, 1)
				const v = clamp(1 - (y - top) / (bottom - top), 0, 1)

				update([h, s, v])
			},
		})

		const svCircleStyle = computed(() => {
			const [, s, v] = hsv.value
			return {
				left: `${s * 100}%`,
				top: `${(1 - v) * 100}%`,
				background: chroma.hsv(...hsv.value).css(),
				transform: tweakingSV.value ? 'scale(2)' : '',
			}
		})

		const svUniforms = computed(() => {
			return {
				hue: hsv.value[0] / 360,
			}
		})

		// Hue
		const hueBoxEl = ref<null | HTMLElement>(null)

		const {isDragging: tweakingHue} = useDraggable(hueBoxEl, {
			disableClick: true,
			onDrag({pos: [x], right, left}) {
				const h = unsignedMod((x - left) / (right - left), 1) * 360
				const [, s, v] = hsv.value
				update([h, s, v])
			},
		})

		const hueCircleStyle = computed(() => {
			const h = hsv.value[0]
			const bg = chroma.hsv(h, 1, 1).css()
			return {
				left: `${(h / 360) * 100}%`,
				background: bg,
				transform: tweakingHue.value ? 'scale(2)' : '',
			}
		})

		// Tweaking
		const tweaking = computed(() => tweakingSV.value || tweakingHue.value)

		return {
			hsv,

			SVFragmentString,
			svBoxEl,
			svCircleStyle,
			svUniforms,

			HueFragmentString,
			hueBoxEl,
			hueCircleStyle,

			tweaking,
		}
	},
})
</script>

<style lang="stylus">
@import '../../style/common.styl'

$circle-diameter = 0.7 * $button-height
$circle-radius = 0.5 * $circle-diameter

.SliderHSV
	&__canvas
		position absolute
		top 0
		left 0
		width 100%
		height 100%
		border-radius $border-radius

	&__circle
		position absolute
		z-index 1
		margin - $circle-radius
		width $circle-diameter
		height $circle-diameter
		border-radius 50%
		box-shadow 0 0 0 1.5px #fff, inset 0 0 0px 1px rgba(0, 0, 0, 0.1), 0 0 1px 2px rgba(0, 0, 0, 0.4)
		transition transform 0.03s ease

		&.hue
			margin-top 0

	&__sv
		position relative
		margin $circle-radius
		padding-top 'calc(100% - %s)' % $circle-diameter
		width 'calc(100% - %s)' % $circle-diameter
		height 0
		border-radius $border-radius

	&__hue
		position relative
		margin 0 $circle-radius $circle-radius
		width 'calc(100% - %s)' % $circle-diameter
		height $circle-diameter

	&__overlay
		input-overlay()
		cursor none
</style>