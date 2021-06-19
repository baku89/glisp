<template>
	<div class="InputSlider" :class="{tweaking}" ref="dragEl" v-bind="$attrs">
		<input
			class="InputSlider__input"
			type="text"
			:value="displayValue"
			@blur="onBlur"
			@keydown="onKeydown"
			ref="inputEl"
		/>
		<div class="InputSlider__slider-wrapper">
			<div class="InputSlider__slider" :style="sliderStyle" />
		</div>
	</div>
	<teleport to="body">
		<template v-if="tweaking">
			<div
				class="InputSlider__overlay-label"
				:class="[tweakLabelClass]"
				:style="{
					top: origin[1] + 'px',
					left: labelX + 'px',
					opacity: showTweakLabel ? 1 : 0,
				}"
			>
				{{ overlayLabel }}
			</div>
		</template>
	</teleport>
</template>

<script lang="ts">
import _ from 'lodash'
import {computed, defineComponent, ref, toRef, watch} from 'vue'

import {fit01, fitTo01} from '@/utils'

import useDraggable from '../use/use-draggable'
import useNumberInput from './use-number-input'

export default defineComponent({
	name: 'InputSlider',
	props: {
		modelValue: {
			type: Number,
			required: true,
		},
		min: {
			type: Number,
			default: 0,
		},
		max: {
			type: Number,
			default: 1,
		},
		clamped: {
			type: Boolean,
			default: false,
		},
	},
	setup(props, context) {
		// Element references
		const dragEl = ref<null | HTMLElement>(null)
		const inputEl = ref<null | HTMLInputElement>(null)

		const tweakMode = ref<'relative' | 'absolute'>('relative')

		// Drag Events
		let startValue = ref(0)
		let alreadyEmitted = false

		let tweakStartValue = 0
		let tweakStartPos = 0

		const {
			isDragging: tweaking,
			pos,
			origin,
		} = useDraggable(dragEl, {
			lockPointer: false,
			onClick() {
				if (inputEl.value) {
					inputEl.value.focus()
					inputEl.value.select()
				}
			},
			onDragStart({left, right, pos}) {
				startValue.value = props.modelValue

				const cursorT = fitTo01(pos[0], left, right)
				const valueT = fitTo01(props.modelValue, props.min, props.max)

				tweakMode.value =
					Math.abs(cursorT - valueT) < 0.1 ? 'relative' : 'absolute'

				if (tweakMode.value === 'absolute') {
					const newValue = fit01(cursorT, props.min, props.max)
					context.emit('update:modelValue', newValue)

					alreadyEmitted = true
					tweakStartValue = newValue
				} else {
					tweakStartValue = props.modelValue
				}

				tweakStartPos = pos[0]
				tweakSpeedChanged.value = true
			},
			onDrag({pos, right, left}) {
				if (alreadyEmitted) {
					alreadyEmitted = false
					return
				}

				if (tweakSpeedChanged.value) {
					tweakStartValue = props.modelValue
					tweakStartPos = pos[0]
					tweakSpeedChanged.value = false
				}

				const delta = pos[0] - tweakStartPos

				let inc = ((props.max - props.min) * delta) / (right - left)
				inc *= tweakSpeed.value

				let newValue = tweakStartValue + inc

				if (props.clamped) {
					newValue = _.clamp(newValue, props.min, props.max)
				}
				context.emit('update:modelValue', newValue)
			},
			onDragEnd() {
				context.emit('end-tweak')
			},
		})

		const {
			displayValue,
			overlayLabel,
			onBlur,
			onKeydown,
			tweakSpeedChanged,
			tweakSpeed,
			tweakLabelClass,
			showTweakLabel,
			labelX,
		} = useNumberInput(
			toRef(props, 'modelValue'),
			startValue,
			tweaking,
			pos,
			dragEl,
			context
		)

		// Handle Pointerlock
		watch([showTweakLabel, tweaking], ([isOutside, tweaking]) => {
			if (tweaking && isOutside) {
				dragEl.value?.requestPointerLock()
			}
		})

		watch(tweaking, tweaking => {
			if (!tweaking) document.exitPointerLock()
		})

		const sliderStyle = computed(() => {
			const t = (props.modelValue - props.min) / (props.max - props.min)
			return {
				width: `${_.clamp(t, 0, 1) * 100}%`,
			}
		})

		return {
			dragEl,
			inputEl,
			tweaking,
			showTweakLabel,
			sliderStyle,
			origin,
			labelX,

			displayValue,
			overlayLabel,
			onBlur,
			onKeydown,

			tweakSpeedChanged,
			tweakSpeed,
			tweakLabelClass,
		}
	},
	inheritAttrs: false,
})
</script>

<style lang="stylus">
@import './use-number-input.styl'

.InputSlider
	width 12.6rem
	height $input-height
	background base16('01')
	use-number()

	&__overlay-label
		cursor pointer

	&__input
		position absolute
		top 0
		left 0
		z-index 10
		width 100%
		height 100%
		background transparent

	&__slider-wrapper
		position relative
		overflow hidden
		width 100%
		height 100%
		border-radius $input-round

	&__slider
		position relative
		height 100%

		&:after
			pseudo-block()
			absolute-fill()
			background base16('accent', 0.5)
			input-transition(all)

		~/.tweaking &
			&:after
				box-shadow 0 0 0 1px base16('accent')
</style>
