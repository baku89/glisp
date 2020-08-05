<template>
	<div clas="InputColor">
		<Popper
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
				:value="value"
				@input="$emit('input', $event)"
			/>
			<button class="InputColor__button" slot="reference">
				<span class="InputColor__color-preview" :style="{background: value}" />
			</button>
		</Popper>
	</div>
</template>

<script lang="ts">
import {defineComponent} from '@vue/composition-api'
import {Chrome as ColorPicker} from 'vue-color'
import Popper from 'vue-popperjs'

export default defineComponent({
	name: 'InputColor',
	components: {
		ColorPicker,
		Popper,
	},
	props: {
		value: {
			type: String,
			required: true,
		},
	},
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.InputColor
	&__button
		position relative
		display block
		overflow hidden
		width $input-height
		height $input-height
		outline none
		border 0
		background-image linear-gradient(45deg, #ddd 25%, transparent 25%), linear-gradient(135deg, #ddd 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ddd 75%), linear-gradient(135deg, transparent 75%, #ddd 75%)
		background-position 0 0, 5px 0, 5px -5px, 0px 5px
		background-size 10px 10px
		vertical-align bottom
		font-size inherit

	&__color-preview
		position absolute
		top 0
		left 0
		display block
		width 100%
		height 100%
		input-border()

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
