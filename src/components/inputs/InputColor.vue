<template>
	<button class="InputColor">
		<span class="InputColor__color-preview" :style="{background: modelValue}" />
	</button>
	<!-- <Popper
			trigger="clickToOpen"
			:append-to-body="true"
			:delay-on-mouse-out="250"
			:options="{
				placement: 'top',
				modifiers: {offset: {offset: '0px,10px'}},
			}"
			boundaries-selector="body"
			@hide="$emit('end-tweak')"
		>
			<ColorPicker
				class="InputColor__picker"
				:value="modelValue"
				@input="$emit('update:modelValue', $event)"
			/>
			<template v-slot:reference>
				<button class="InputColor__button">
					<span
						class="InputColor__color-preview"
						:style="{background: modelValue}"
					/>
				</button>
			</template>
		</Popper> -->
</template>

<script lang="ts">
import {defineComponent} from 'vue'
import {Chrome as ColorPicker} from 'vue-color'

export default defineComponent({
	name: 'InputColor',
	components: {
		// ColorPicker,
	},
	props: {
		modelValue: {
			type: [String, Array],
			required: true,
		},
	},
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
		left 100px !important
		z-index 1000
		border-radius 2px
		box-shadow 0 0 20px 0 var(--translucent) !important

		&:before
			position absolute
			top 0
			left 0
			z-index 1000
			width 100%
			height 100%
			border 1px solid var(--border)
			content ''
			pointer-events none

		.vc-chrome-body
			background-color var(--opaque) !important

		.vc-chrome-fields-wrap
			display none
</style>
