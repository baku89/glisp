<template>
	<div class="InputNumberUnranged" :class="{tweaking}" v-bind="$attrs">
		<input
			class="InputNumberUnranged__input"
			:class="{invalid: displayInvalid}"
			type="text"
			:value="display"
			@input="display = $event.target.value"
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

import {useNumberInput} from './use-number-input'

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
		updateOnBlur: {
			type: Boolean,
			default: false,
		},
	},
	emit: ['update:modelValue'],
	setup(props, {emit}) {
		const inputEl = ref<null | HTMLInputElement>(null)

		let startValue = ref(0)

		// Drag Events
		let tweakStartValue = 0
		let tweakStartPos = 0

		const tweakEnabled = ref(true)

		const {
			isDragging: tweaking,
			pos,
			origin,
		} = useDraggable(inputEl, {
			lockPointer: true,
			enabled: tweakEnabled,
			onClick() {
				console.log('onClick')
				tweakEnabled.value = false
				inputEl.value?.select()
			},
			onDragStart() {
				console.log('onDragStart')
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

				local.set(val)
			},
			onDragEnd() {
				local.conform()
				inputEl.value?.blur()
			},
		})

		const {
			local,
			display,
			displayInvalid,
			overlayLabel,
			tweakSpeedChanged,
			tweakSpeed,
			tweakLabelClass,
			showTweakLabel,
			labelX,
		} = useNumberInput(
			props,
			startValue,
			tweakEnabled,
			tweaking,
			pos,
			inputEl,
			emit
		)

		return {
			inputEl,

			tweaking,
			origin,
			labelX,
			showTweakLabel,
			tweakLabelClass,

			display,
			displayInvalid,
			overlayLabel,
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
