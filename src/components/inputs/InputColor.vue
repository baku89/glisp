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
		<div
			v-if="tweaking"
			class="InputColor__overlay"
			:class="{'tweaking-slider': tweakingHue}"
		>
			<button class="InputColor__overlay-button" :style="overlayButtonStyle">
				<span
					class="InputColor__color-preview"
					:style="{background: modelValue}"
				/>
			</button>
			<glsl-canvas
				class="InputColor__overlay-pad"
				:class="{show: !tweakingHue}"
				:fragmentString="PadFragmentString"
				:uniforms="padUniforms"
				:style="padStyle"
			/>
			<GlslCanvas
				class="InputColor__overlay-slider"
				:class="{show: tweakingHue}"
				:fragmentString="SliderFragmentString"
				:uniforms="sliderUniforms"
				:style="sliderStyle"
			/>
		</div>
	</teleport>
</template>

<script lang="ts">
import {clamp} from 'lodash'
import {computed, defineComponent, ref, shallowRef, watch} from 'vue'

import GlslCanvas from '@/components/layouts/GlslCanvas.vue'
import Popover from '@/components/layouts/Popover.vue'
import useDraggable from '@/components/use/use-draggable'
import useKeyboardState from '@/components/use/use-keyboard-state'
import useRem from '@/components/use/use-rem'
import {unsignedMod} from '@/utils'

import InputColorPicker from './InputColorPicker'
import PadFragmentString from './InputColorPicker/picker-hsv-pad.frag'
import SliderFragmentString from './InputColorPicker/picker-hsv-slider.frag'
import useHSV, {
	color2rgba,
	hsv2rgb,
	HSVA,
	RGBA,
	rgba2color,
} from './InputColorPicker/use-hsv'

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

		const {shift: tweakingHue, alt: tweakingAlpha} = useKeyboardState()

		const rgba = ref<RGBA>({r: 0, g: 0, b: 0, a: 0})
		watch(
			() => props.modelValue,
			() => {
				const dict = color2rgba(props.modelValue, props.colorSpace)
				if (!dict) return

				rgba.value = dict
			},
			{immediate: true}
		)

		const {hsv} = useHSV(rgba)

		const rem = useRem()

		const tweakingColor = shallowRef<HSVA>({h: 0, s: 0, v: 0, a: 0})

		const {
			origin,
			pos,
			isDragging: tweaking,
		} = useDraggable(buttonEl, {
			lockPointer: true,
			onClick() {
				pickerOpened.value = !pickerOpened.value
			},
			onDragStart() {
				tweakingColor.value = {...hsv.value, a: rgba.value.a}
			},
			onDrag({delta: [x, y]}) {
				const dx = x / (rem.value * 20)
				const dy = -y / (rem.value * 20)

				let dh = 0,
					ds = 0,
					dv = 0,
					da = 0

				if (tweakingHue.value) {
					dh -= dx
				} else if (tweakingAlpha.value) {
					da -= dx
				} else {
					ds -= dx
					dv -= dy
				}

				let {h, s, v, a} = tweakingColor.value
				h = unsignedMod(h + dh, 1)
				s = clamp(s + ds, 0, 1)
				v = clamp(v + dv, 0, 1)
				a = clamp(a + da, 0, 1)

				tweakingColor.value = {h, s, v, a}

				const rgba = {
					...hsv2rgb(tweakingColor.value),
					a: a,
				}
				const newValue = rgba2color(rgba, props.colorSpace)

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
				left: `calc(${origin.value[0]}px - ${tweakingColor.value.s * 20}rem)`,
				top: `calc(${origin.value[1]}px - ${
					(1 - tweakingColor.value.v) * 20
				}rem)`,
			}
		})

		const padUniforms = computed(() => {
			const {h, s, v} = tweakingColor.value
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
			const {h, s, v} = tweakingColor.value
			return {
				hsv: [h, s, v],
				mode: 0,
				offset: h + 0.5,
			}
		})

		return {
			buttonEl,
			pickerOpened,
			origin,
			pos,
			tweaking,

			overlayButtonStyle,

			padStyle,
			padUniforms,
			PadFragmentString,

			sliderStyle,
			sliderUniforms,
			SliderFragmentString,

			tweakingHue,
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
		border 1px solid $color-frame
		border-radius: $input-round + 1px
		aspect-ratio 1
		input-transition(border-color)
		overflow hidden

	&:hover, &:focus-within, &.tweaking, &__overlay-button
		border-color base16('accent')

	&:focus-within, &__overlay-button
		box-shadow 0 0 0 1px base16('accent')

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
		border 1px solid $color-frame
		border-radius $popup-round
		translucent-bg()
		position relative
		box-shadow 0 0 20px 0 base16('00', 0.9)

	&__overlay
		input-overlay()
		cursor move

		&.tweaking-slider
			cursor e-resize

		&-button
			position absolute
			z-index 10
			transform translate(-50%, -50%)
			pointer-events none

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
			border-radius $input-round
			mask linear-gradient(to bottom, black 1%, transparent 1%, transparent 99%, black 99%), linear-gradient(to right, black 1%, transparent 1%, transparent 99%, black 99%)

		&-slider
			position absolute
			height 3px
			background red
			transform translate(-50%, -50%)
			mask linear-gradient(to right, transparent 0%, black 20%, black 80%, transparent 100%)
</style>
