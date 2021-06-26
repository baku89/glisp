<template>
	<div class="InputNumber" :class="{tweaking}" ref="dragEl" v-bind="$attrs">
		<input
			class="InputNumber__input"
			type="text"
			:value="displayValue"
			@blur="onBlur"
			@keydown="onKeydown"
			ref="inputEl"
		/>
	</div>
	<teleport to="body">
		<template v-if="tweaking">
			<div
				class="InputNumber__overlay-label"
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
import {defineComponent, PropType, ref} from 'vue'

import {Validator} from '@/lib/fp'

import useDraggable from '../use/use-draggable'
import useNumberInput from './use-number-input'

export default defineComponent({
	name: 'InputNumber',
	props: {
		modelValue: {
			type: Number,
			required: true,
		},
		precision: {
			type: Number,
			default: 1,
		},
		validator: {
			type: Function as PropType<Validator<number>>,
			default: some,
		},
	},
	emit: ['update:modelValue'],
	setup(props, context) {
		const dragEl = ref<null | HTMLInputElement>(null)
		const inputEl = ref<null | HTMLInputElement>(null)

		let startValue = ref(0)

		// Drag Events
		let tweakStartValue = 0
		let tweakStartPos = 0

		const {
			isDragging: tweaking,
			pos,
			origin,
		} = useDraggable(dragEl, {
			lockPointer: true,
			onClick() {
				inputEl.value?.select()
			},
			onDragStart() {
				startValue.value = props.modelValue
				tweakSpeedChanged.value = true
			},
			onDrag({pos: [x]}) {
				if (tweakSpeedChanged.value) {
					tweakSpeedChanged.value = false
					tweakStartValue = props.modelValue
					tweakStartPos = x
				}

				const delta = x - tweakStartPos
				const inc = (delta / 5) * tweakSpeed.value
				const val = tweakStartValue + inc

				update(val, false)
			},
		})

		const {
			step,
			displayValue,
			overlayLabel,
			onBlur,
			onKeydown,
			tweakSpeedChanged,
			tweakSpeed,
			tweakLabelClass,
			showTweakLabel,
			labelX,
			update,
		} = useNumberInput(
			props,
			startValue,
			tweaking,
			pos,
			dragEl,
			inputEl,
			context
		)

		return {
			dragEl,
			inputEl,

			tweaking,
			origin,
			labelX,
			showTweakLabel,
			tweakLabelClass,

			step,
			displayValue,
			overlayLabel,
			onBlur,
			onKeydown,
		}
	},
	inheritAttrs: false,
})
</script>

<style lang="stylus">
@import './use-number-input.styl'

.InputNumber
	width 6rem
	use-number()
</style>
