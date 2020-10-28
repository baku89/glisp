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
		<InputColorPicker
			:modelValue="modelValue"
			@update:modelValue="$emit('update:modelValue', $event)"
		/>
	</Popover>
</template>

<script lang="ts">
import {computed, defineComponent, ref, shallowRef, watch} from 'vue'
import Popover from '@/components/layouts/Popover.vue'

export default defineComponent({
	name: 'InputColor',
	components: {
		Popover,
	},
	props: {
		modelValue: {
			type: String,
			required: true,
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
		background-image linear-gradient(45deg, #ddd 25%, transparent 25%), linear-gradient(135deg, #ddd 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ddd 75%), linear-gradient(135deg, transparent 75%, #ddd 75%)
		background-position 0 0, 5px 0, 5px -5px, 0px 5px
		background-size 10px 10px
		content ''

	&__color-preview
		z-index 2

	// Inside picker
	&__picker
		margin 1rem
		width 20rem
		height 20rem
		border 1px solid var(--frame)
		border-radius 4px
		translucent-bg()
		position relative
		box-shadow 0 0 20px 0 var(--translucent)

	&__circle
		position absolute
		margin -0.75rem 0 0 -0.75rem
		width 1.5rem
		height 1.5rem
		border-radius 50%
		box-shadow 0 0 0 1.5px #fff, inset 0 0 0px 1px rgba(0, 0, 0, 0.1), 0 0 1px 2px rgba(0, 0, 0, 0.4)

	&__sv
		position relative
		margin 1rem
		width calc(100% - 2rem)
		height calc(100% - 2rem)
		border-radius 2px

		&-canvas
			width 100%
			height 100%
			border-radius 2px
</style>
