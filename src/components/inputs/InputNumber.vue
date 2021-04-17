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
import {computed, defineComponent, ref, toRef} from 'vue'

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

		const showTweakLine = computed(() => {
			if (!dragEl.value) return false

			const {left, right} = dragEl.value.getBoundingClientRect()
			const x = absolutePos.value[0]
			return x < left || right < x
		})

		const originX = computed(() => {
			if (!dragEl.value || !showTweakLine.value) return 0

			const {left, right} = dragEl.value.getBoundingClientRect()

			const x = absolutePos.value[0]
			return x < left ? left : right
		})

		const showTweakLabel = computed(() => {
			if (!dragEl.value || !tweaking.value) return false

			const {left, right, top, bottom} = dragEl.value.getBoundingClientRect()
			const [x, y] = absolutePos.value
			return x < left || right < x || y < top || bottom < y
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
		} = useNumberInput(
			toRef(props, 'modelValue'),
			startValue,
			tweaking,
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
