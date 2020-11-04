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
		<svg v-if="tweaking" class="InputNumber__overlay">
			<line
				class="bold"
				:x1="origin[0]"
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
			<text class="label" :x="absolutePos[0] + 15" :y="absolutePos[1] - 10">
				{{ overlayLabel }}
			</text>
		</svg>
	</teleport>
</template>

<script lang="ts">
import {defineComponent, ref, toRef} from 'vue'

// import {useDraggable, useKeyboardState} from '../use'
import useDraggable from '../use/use-draggable'
import useKeyboardState from '../use/use-keyboard-state'
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

		const {shift, alt} = useKeyboardState()

		let startValue = ref(0)

		// Drag Events
		const {isDragging: tweaking, absolutePos, origin} = useDraggable(dragEl, {
			onClick() {
				if (inputEl.value) {
					inputEl.value.focus()
					inputEl.value.select()
				}
			},
			onDragStart() {
				startValue.value = props.modelValue
			},
			onDrag({delta}) {
				let inc = delta[0] / 5

				if (shift.value) {
					inc *= 10
				}
				if (alt.value) {
					inc /= 10
				}

				update(props.modelValue + inc)
			},
			onDragEnd() {
				context.emit('end-tweak')
			},
		})

		const {
			step,
			displayValue,
			onBlur,
			onKeydown,
			update,
			overlayLabel,
		} = useNumberInput(
			toRef(props, 'modelValue'),
			startValue,
			tweaking,
			context
		)

		return {
			dragEl,
			inputEl,

			displayValue,
			step,
			tweaking,
			absolutePos,
			origin,
			overlayLabel,

			onBlur,
			onKeydown,
			update,
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
