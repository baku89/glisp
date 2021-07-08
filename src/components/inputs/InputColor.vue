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
			:class="{'tweaking-slider': tweakMode !== 'pad'}"
		>
			<GlslCanvas
				class="InputColor__overlay-pad"
				:class="{show: tweakMode === 'pad'}"
				:fragmentString="PadFragmentString"
				:uniforms="padUniforms"
				:style="padStyle"
			/>
			<GlslCanvas
				class="InputColor__overlay-slider-hue"
				:class="{show: tweakMode == 'hue'}"
				:fragmentString="SliderHueFragmentString"
				:uniforms="sliderHueUniforms"
				:style="sliderHueStyle"
			/>
			<div
				class="InputColor__overlay-slider-alpha"
				:class="{show: tweakMode == 'alpha'}"
				:style="sliderAlphaStyle"
			/>
			<button
				class="InputColor__overlay-button"
				:style="overlayButtonStyle"
			></button>
		</div>
	</teleport>
</template>

<script lang="ts">
import {useMagicKeys} from '@vueuse/core'
import {clamp} from 'lodash'
import {computed, defineComponent, ref, shallowRef, watch} from 'vue'

import GlslCanvas from '@/components/layouts/GlslCanvas.vue'
import Popover from '@/components/layouts/Popover.vue'
import useDraggable from '@/components/use/use-draggable'
import useRem from '@/components/use/use-rem'
import {unsignedMod} from '@/utils'

import InputColorPicker from './InputColorPicker'
import PadFragmentString from './InputColorPicker/picker-hsv-pad.frag'
import SliderHueFragmentString from './InputColorPicker/picker-hsv-slider.frag'
import useHSV, {
	color2rgba,
	hsv2color,
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
	setup(props, {emit}) {
		const buttonEl = ref(null)
		const pickerOpened = ref(false)

		const {shift, alt} = useMagicKeys()
		const tweakMode = computed(() => {
			return shift.value ? 'hue' : alt.value ? 'alpha' : 'pad'
		})

		const rgba = ref<RGBA>({r: 0, g: 0, b: 0, a: 0})
		watch(
			() => props.modelValue,
			() => {
				const dict = color2rgba(
					props.modelValue,
					props.colorSpace.endsWith('a')
				)
				if (!dict) return

				rgba.value = dict
			},
			{immediate: true}
		)

		const {hsv} = useHSV(rgba)

		const rem = useRem()

		const tweakColor = shallowRef<HSVA>({h: 0, s: 0, v: 0, a: 0})

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
				tweakColor.value = {...hsv.value, a: rgba.value.a}
			},
			onDrag({delta: [x, y]}) {
				const dx = x / (rem.value * 20)
				const dy = -y / (rem.value * 20)

				let dh = 0,
					ds = 0,
					dv = 0,
					da = 0

				if (tweakMode.value === 'hue') {
					dh -= dx
				} else if (tweakMode.value === 'alpha') {
					da -= dx
				} else {
					ds -= dx
					dv -= dy
				}

				let {h, s, v, a} = tweakColor.value
				h = unsignedMod(h + dh, 1)
				s = clamp(s + ds, 0, 1)
				v = clamp(v + dv, 0, 1)
				a = clamp(a + da, 0, 1)

				tweakColor.value = {h, s, v, a}

				const rgba = {
					...hsv2rgb(tweakColor.value),
					a: a,
				}
				const newValue = rgba2color(rgba, props.colorSpace.endsWith('a'))

				emit('update:modelValue', newValue)
			},
		})
		const overlayButtonStyle = computed(() => {
			const color = rgba2color(
				{...hsv2rgb(tweakColor.value), a: rgba.value.a},
				tweakMode.value === 'alpha'
			)

			return {
				left: `${origin.value[0]}px`,
				top: `${origin.value[1]}px`,
				backgroundColor: color,
			}
		})

		const padStyle = computed(() => {
			return {
				left: `calc(${origin.value[0]}px - ${tweakColor.value.s * 20}rem)`,
				top: `calc(${origin.value[1]}px - ${(1 - tweakColor.value.v) * 20}rem)`,
			}
		})

		const padUniforms = computed(() => {
			const {h, s, v} = tweakColor.value
			return {
				hsv: [h, s, v],
				modeX: 1,
				modeY: 2,
			}
		})

		const sliderHueStyle = computed(() => {
			return {
				left: `${origin.value[0]}px`,
				top: `${origin.value[1]}px`,
			}
		})

		const sliderAlphaStyle = computed(() => {
			const x = (tweakColor.value.a - 0.5) * 20
			const color = hsv2color(tweakColor.value)
			return {
				left: `calc(${origin.value[0]}px - ${x}rem)`,
				top: `${origin.value[1]}px`,
				background: `linear-gradient(to right, transparent, ${color})`,
			}
		})

		const sliderHueUniforms = computed(() => {
			const {h, s, v} = tweakColor.value
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

			sliderHueStyle,
			sliderAlphaStyle,
			sliderHueUniforms,
			SliderHueFragmentString,

			tweakMode,
		}
	},
	inheritAttrs: false,
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.InputColor
	&
		position relative
		width $input-height
		border 1px solid $color-frame
		border-radius: $input-round + 1px
		aspect-ratio 1
		input-transition(border-color)
		overflow hidden

	&:hover, &:focus-within, &.tweaking
		border-color base16('accent')

	&:focus-within
		box-shadow 0 0 0 1px base16('accent')

	// Grid and color-preview
	&:before, &__color-preview
		position absolute
		display block
		inset 0

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
		glass-bg('pane')
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
			width $input-height
			border-radius: $input-round + 1px
			transform translate(-50%, -50%) scale(1.2)
			pointer-events none
			aspect-ratio 1

		&-pad, &-slider-hue, &-slider-alpha
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

		&-slider-hue, &-slider-alpha
			position absolute
			height 1em
			border-radius 0.5em
			transform translate(-50%, -50%)

		&-slider-hue
			mask linear-gradient(to right, transparent 0%, black 20%, black 80%, transparent 100%)
</style>
