<template>
	<button
		class="InputColor"
		ref="buttonEl"
		@click="pickerOpened = !pickerOpened"
		v-bind="$attrs"
	>
		<span class="InputColor__color-preview" :style="{background: modelValue}" />
	</button>
	<Popover v-model:open="pickerOpened" :reference="buttonEl">
		<div class="InputColor__popover-frame">
			<InputColorPicker
				:modelValue="modelValue"
				:pickers="pickers"
				@update:modelValue="$emit('update:modelValue', $event)"
			/>
		</div>
	</Popover>
</template>

<script lang="ts">
import {computed, defineComponent, ref, shallowRef, watch} from 'vue'
import Popover from '@/components/layouts/Popover.vue'
import InputColorPicker from './InputColorPicker'

export default defineComponent({
	name: 'InputColor',
	components: {
		Popover,
		InputColorPicker,
	},
	props: {
		modelValue: {
			type: String,
			required: true,
		},
		pickers: {
			type: String,
		},
	},
	setup(props, context) {
		const buttonEl = ref(null)
		const pickerOpened = ref(false)

		return {
			buttonEl,
			pickerOpened,
		}
	},
	inheritAttrs: false,
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.InputColor
	position relative
	width $input-height
	height $input-height
	border 1px solid var(--frame)
	border-radius $border-radius
	input-transition(border-color)

	&:hover, &:focus-within
		border-color var(--highlight)

	&:focus-within
		box-shadow 0 0 0 1px var(--highlight)

	// Grid and color-preview
	&:before, &__color-preview
		position absolute
		top 0
		right 0
		bottom 0
		left 0
		display block
		border-radius 1px

	// Grid
	&:before
		z-index 1
		background-checkerboard()
		border-radius $border-radius
		content ''

	&__color-preview
		z-index 2
		border-radius $border-radius

	&__popover-frame
		margin 0.5rem
		width 20rem
		border 1px solid var(--frame)
		border-radius 4px
		translucent-bg()
		position relative
		box-shadow 0 0 20px 0 var(--translucent)
</style>
