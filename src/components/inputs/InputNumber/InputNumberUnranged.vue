<template>
	<div
		class="InputNumberUnranged"
		:class="{tweaking}"
		ref="dragEl"
		v-bind="$attrs"
	>
		<input
			class="InputNumberUnranged__input"
			type="text"
			:value="displayValue"
			@focus="onFocus"
			@blur="onBlur"
			@keydown="onKeydown"
			ref="inputEl"
		/>
	</div>
	<teleport to="body">
		<template v-if="tweaking">
			<div
				class="InputNumberUnranged__overlay-label"
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

import useDraggable from '@/components/use/use-draggable'
import {Validator} from '@/lib/fp'

import useNumberInput from './use-number-input'

export default defineComponent({
	name: 'InputNumberUnranged',
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
			disabled: tweakDisabled,
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
			onFocus,
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
			tweakDisabled,
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
			onFocus,
			onBlur,
			onKeydown,
		}
	},
	inheritAttrs: false,
})
</script>

<style lang="stylus">
@import './use-number-input.styl'

.InputNumberUnranged
	width 6rem
	use-number()
</style>
