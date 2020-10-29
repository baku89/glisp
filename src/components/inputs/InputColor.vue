<template>
	<button class="InputColor" :class="{tweaking}" ref="buttonEl" v-bind="$attrs">
		<span class="InputColor__color-preview" :style="{background: modelValue}" />
	</button>
	<Popover v-model:open="pickerOpened" :reference="buttonEl" placement="right">
		<div class="InputColor__popover-frame">
			<InputColorPicker
				:modelValue="modelValue"
				:colorSpace="colorSpace"
				:pickers="pickers"
				@update:modelValue="$emit('update:modelValue', $event)"
			/>
		</div>
	</Popover>
	<teleport to="body">
		<div v-if="tweaking" class="InputColor__overlay">
			<button class="InputColor__overlay-button" :style="overlayButtonStyle">
				<span
					class="InputColor__color-preview"
					:style="{background: modelValue}"
				/>
			</button>
			<glsl-canvas
				class="InputColor__overlay-pad"
				:class="{show: !tweakingSlider}"
				:fragmentString="PadFragmentString"
				:uniforms="padUniforms"
				:style="padStyle"
			/>
			<GlslCanvas
				class="InputColor__overlay-slider"
				:class="{show: tweakingSlider}"
				:fragmentString="SliderFragmentString"
				:uniforms="sliderUniforms"
				:style="sliderStyle"
			/>
		</div>
	</teleport>
</template>

<script lang="ts">
import {computed, defineComponent, ref, shallowRef, toRaw, watch} from 'vue'
import chroma from 'chroma-js'

import {clamp, unsignedMod} from '@/utils'
import useDraggable from '@/components/use/use-draggable'
import useKeyboardState from '@/components/use/use-keyboard-state'
import useRem from '@/components/use/use-rem'
import useHSV, {toRGBDict} from './InputColorPicker/use-hsv'

import Popover from '@/components/layouts/Popover.vue'
import GlslCanvas from '@/components/layouts/GlslCanvas.vue'
import InputColorPicker from './InputColorPicker'
import PadFragmentString from './InputColorPicker/picker-hsv-pad.frag'
import SliderFragmentString from './InputColorPicker/picker-hsv-slider.frag'

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
	name: 'InputColor',
	components: {
		Popover,
		GlslCanvas,
		InputColorPicker,
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
		},
	},
	emits: ['update:modelValue'],
	setup(props, context) {
		const buttonEl = ref(null)
		const pickerOpened = ref(false)

		const {shift: tweakingSlider} = useKeyboardState()

		const colorDict = ref<ColorDict>({r: 0, g: 0, b: 0})
		watch(
			() => props.modelValue,
			() => {
				const dict = toColorDict(props.modelValue, props.colorSpace)
				if (!dict) return

				colorDict.value = dict
			},
			{immediate: true}
		)

		const {hsv} = useHSV(colorDict, context)

		const rem = useRem()

		const tweakingHSV = shallowRef<ColorDict>({})
		const tweakingHSVDelta = shallowRef<ColorDict>({})

		const {origin, absolutePos, isDragging: tweaking} = useDraggable(buttonEl, {
			onClick() {
				pickerOpened.value = !pickerOpened.value
			},
			onDragStart() {
				tweakingHSV.value = {...hsv.value}
				tweakingHSVDelta.value = {h: 0, s: 0, v: 0}
			},
			onDrag({delta: [x, y]}) {
				const dx = x / (rem.value * 20)
				const dy = -y / (rem.value * 20)

				let dh = 0,
					ds = 0,
					dv = 0

				if (tweakingSlider.value) {
					dh -= dx
				} else {
					ds -= dx
					dv -= dy
				}

				let {h, s, v} = tweakingHSV.value
				h = unsignedMod(h + dh, 1)
				s = clamp(s + ds, 0, 1)
				v = clamp(v + dv, 0, 1)

				tweakingHSVDelta.value = {h: dh, s: ds, v: dv}
				tweakingHSV.value = {h, s, v}

				const newDict = {...colorDict.value, ...toRGBDict(tweakingHSV.value)}
				const newValue = fromColorDict(newDict, props.colorSpace)

				context.emit('update:modelValue', newValue)
			},
		})

		const overlayButtonStyle = computed(() => {
			return {
				left: `${origin.value[0]}px`,
				top: `${origin.value[1]}px`,
			}
		})

		const padStyle = computed(() => {
			return {
				left: `calc(${origin.value[0]}px - ${tweakingHSV.value.s * 20}rem)`,
				top: `calc(${origin.value[1]}px - ${
					(1 - tweakingHSV.value.v) * 20
				}rem)`,
			}
		})

		const padUniforms = computed(() => {
			const {h, s, v} = tweakingHSV.value
			return {
				hsv: [h, s, v],
				modeX: 1,
				modeY: 2,
			}
		})

		const sliderStyle = computed(() => {
			return {
				left: `${origin.value[0]}px`,
				top: `${origin.value[1]}px`,
			}
		})

		const sliderUniforms = computed(() => {
			const {h, s, v} = tweakingHSV.value
			return {
				hsv: [h, s, v],
				mode: 0,
				offset: h,
			}
		})

		return {
			buttonEl,
			pickerOpened,
			origin,
			absolutePos,
			tweaking,

			overlayButtonStyle,

			padStyle,
			padUniforms,
			PadFragmentString,

			sliderStyle,
			sliderUniforms,
			SliderFragmentString,

			tweakingSlider,
		}
	},
	inheritAttrs: false,
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.InputColor
	&, &__overlay-button
		position relative
		width $input-height
		height $input-height
		border 1px solid var(--frame)
		border-radius $border-radius
		input-transition(border-color)
		overflow hidden

	&:hover, &:focus-within, &.tweaking, &__overlay-button
		border-color var(--highlight)

	&:focus-within, &__overlay-button
		box-shadow 0 0 0 1px var(--highlight)

	// Grid and color-preview
	&:before, &__color-preview
		position absolute
		top 0
		right 0
		bottom 0
		left 0
		display block

	// Grid
	&:before
		z-index 1
		background-checkerboard()
		content ''

	&__color-preview
		z-index 2

	&__popover-frame
		margin 0.5rem
		width 20rem
		border 1px solid var(--frame)
		border-radius 4px
		translucent-bg()
		position relative
		box-shadow 0 0 20px 0 var(--translucent)

	&__overlay
		input-overlay()

		&-button
			position absolute
			z-index 10
			transform translate(-50%, -50%)

		&-pad, &-slider
			position absolute
			width 20rem
			opacity 0
			transition opacity 0.1s ease

			&.show
				opacity 1

		&-pad
			position absolute
			height 20rem
			border-radius $border-radius
			mask linear-gradient(to bottom, black 1%, transparent 1%, transparent 99%, black 99%), linear-gradient(to right, black 1%, transparent 1%, transparent 99%, black 99%)

		&-slider
			position absolute
			height 3px
			background red
			transform translate(-50%, -50%)
			mask linear-gradient(to right, transparent 0%, black 20%, black 80%, transparent 100%)
</style>
