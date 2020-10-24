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
		<div class="InputColor__picker"></div>
	</Popover>
</template>

<script lang="ts">
import {defineComponent, ref} from 'vue'
import {Chrome as ColorPicker} from 'vue-color'
import Popover from '@/components/layouts/Popover.vue'

export default defineComponent({
	name: 'InputColor',
	components: {
		// ColorPicker,
		Popover,
	},
	props: {
		modelValue: {
			type: [String, Array],
			required: true,
		},
	},
	setup() {
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
		content ''

	&__color-preview
		z-index 2

	&__picker
		width 20rem
		height 20rem
		border 1px solid var(--frame)
		border-radius 4px
		translucent-bg()
		box-shadow 0 0 20px 0 var(--translucent)
</style>
