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
import {defineComponent, ref, toRef} from 'vue'

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
				if (inputEl.value) {
					inputEl.value.focus()
					inputEl.value.select()
				}
			},
			onDragStart() {
				startValue.value = props.modelValue
				tweakSpeedChanged.value = true
			},
			onDrag({pos}) {
				if (tweakSpeedChanged.value) {
					tweakStartValue = props.modelValue
					tweakStartPos = pos[0]
					tweakSpeedChanged.value = false
				}

				const delta = pos[0] - tweakStartPos
				let inc = (delta / 5) * tweakSpeed.value

				const val = tweakStartValue + inc
				context.emit('update:modelValue', val)
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
		} = useNumberInput(
			toRef(props, 'modelValue'),
			toRef(props, 'precision'),
			startValue,
			tweaking,
			pos,
			dragEl,
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
