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
			<svg class="InputNumber__overlay">
				<line
					v-show="showTweakLine"
					:class="[tweakLineClass]"
					:x1="originX"
					:y1="origin[1]"
					:x2="absolutePos[0]"
					:y2="origin[1]"
				/>
				<line
					class="dashed"
					:x1="absolutePos[0]"
					:y1="origin[1]"
					:x2="absolutePos[0]"
					:y2="absolutePos[1]"
				/>
			</svg>
			<div
				class="InputNumber__overlay-label"
				:style="{
					top: absolutePos[1] + 'px',
					left: absolutePos[0] + 'px',
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
	},
	emit: ['update:modelValue'],
	setup(props, context) {
		const dragEl = ref<null | HTMLInputElement>(null)
		const inputEl = ref<null | HTMLInputElement>(null)

		let startValue = ref(0)

		// Drag Events
		let tweakStartValue = 0
		let tweakStartPos = 0

		const {isDragging: tweaking, absolutePos, origin} = useDraggable(dragEl, {
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
			tweakLineClass,
			showTweakLabel,
			showTweakLine,
			originX,
		} = useNumberInput(
			toRef(props, 'modelValue'),
			startValue,
			tweaking,
			absolutePos,
			dragEl,
			context
		)

		return {
			dragEl,
			inputEl,

			tweaking,
			absolutePos,
			origin,
			originX,
			showTweakLine,
			showTweakLabel,
			tweakLineClass,

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
