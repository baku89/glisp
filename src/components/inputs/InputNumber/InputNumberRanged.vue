<template>
	<div
		class="InputNumberRanged"
		:class="{tweaking}"
		ref="dragEl"
		v-bind="$attrs"
	>
		<input
			class="InputNumberRanged__input"
			:class="{invalid: displayInvalid}"
			type="text"
			:value="display"
			@input="display = $event.target.value"
			@focus="onFocus"
			@blur="onBlur"
			@keydown="onKeydown"
			ref="inputEl"
		/>
		<svg
			class="InputNumberRanged__slider-wrapper"
			preserveAspectRatio="none"
			viewBox="0 0 1 2"
		>
			<line
				class="InputNumberRanged__slider"
				:x1="(sliderOrigin - min) / (max - min)"
				y1="1"
				:x2="(modelValue - min) / (max - min)"
				y2="1"
			/>
			<line
				class="InputNumberRanged__slider-origin"
				:x1="(modelValue - min) / (max - min)"
				y1="0"
				:x2="(modelValue - min) / (max - min)"
				y2="2"
			/>
		</svg>
	</div>
	<teleport to="body">
		<template v-if="tweaking">
			<div
				class="InputNumberRanged__overlay-label"
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
import {some} from 'fp-ts/lib/Option'
import _ from 'lodash'
import {computed, defineComponent, PropType, ref, watch} from 'vue'

import useDraggable from '@/components/use/use-draggable'
import {Validator} from '@/lib/fp'
import {fit01, fitTo01, roundFixed} from '@/utils'

import useNumberInput from './use-number-input'

export default defineComponent({
	name: 'InputNumberRanged',
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
		precision: {
			type: Number,
			default: 1,
		},
		sliderOrigin: {
			type: Number,
			default: 0,
		},
		validator: {
			type: Function as PropType<Validator<number>>,
			default: some,
		},
		updateOnBlur: {
			type: Boolean,
			default: false,
		},
	},
	emit: ['update:modelValue'],
	setup(props, {emit}) {
		// Element references
		const dragEl = ref<null | HTMLElement>(null)
		const inputEl = ref<null | HTMLInputElement>(null)

		const tweakMode = ref<'relative' | 'absolute'>('relative')

		// Drag Events
		let startValue = ref(0)

		let tweakStartValue = 0
		let tweakStartPos = 0

		const {
			isDragging: tweaking,
			pos,
			origin,
			disabled: tweakDisabled,
		} = useDraggable(dragEl, {
			lockPointer: false,
			onClick() {
				inputEl.value?.select()
			},
			onDragStart({pos: [x], left, right}) {
				startValue.value = props.modelValue

				const cursorT = fitTo01(x, left, right)
				const valueT = fitTo01(props.modelValue, props.min, props.max)

				tweakMode.value =
					Math.abs(cursorT - valueT) < 0.1 ? 'relative' : 'absolute'

				if (tweakMode.value === 'absolute') {
					tweakStartValue = fit01(cursorT, props.min, props.max)
				} else {
					tweakStartValue = props.modelValue
				}

				tweakStartPos = x
			},
			onDrag({pos: [x], right, left}) {
				if (tweakSpeedChanged.value) {
					tweakSpeedChanged.value = false
					tweakStartValue = props.modelValue
					tweakStartPos = x
				}

				const delta = x - tweakStartPos
				const scaleFactor = (props.max - props.min) / (right - left)
				const inc = delta * scaleFactor * tweakSpeed.value
				const val = tweakStartValue + inc

				local.set(roundFixed(val, props.precision))
			},
			onDragEnd() {
				local.confirm()
			},
		})

		const {
			local,
			display,
			displayInvalid,
			overlayLabel,
			onFocus,
			onBlur,
			onKeydown,
			tweakSpeedChanged,
			tweakSpeed,
			tweakLabelClass,
			showTweakLabel,
			labelX,
		} = useNumberInput(
			props,
			startValue,
			tweaking,
			tweakDisabled,
			pos,
			dragEl,
			inputEl,
			emit
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
			tweakDisabled,
			dragEl,
			inputEl,
			tweaking,
			showTweakLabel,
			sliderStyle,
			origin,
			labelX,

			display,
			displayInvalid,
			overlayLabel,
			onFocus,
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

.InputNumberRanged
	width 12.6rem
	height $input-height
	background base16('01')
	use-number()

	&__overlay-label
		cursor pointer

	&__input
		position absolute
		z-index 10
		background transparent
		inset 0

	&__slider-wrapper
		position relative
		overflow hidden
		width 100%
		height 100%
		border-radius $input-round

	&__slider
		position relative
		height 100%
		stroke base16('accent', 0.5)
		stroke-width 2

		~/.tweaking &
			&:after
				box-shadow 0 0 0 1px base16('accent')

	&__slider-origin
		stroke base16('accent')
		stroke-width 1
		vector-effect non-scaling-stroke
</style>
