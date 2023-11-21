<template>
	<Menu :triggers="['click']" placement="top" @hide="$emit('end-tweak')">
		<button class="InputColor__button">
			<span class="InputColor__color-preview" :style="{background: value}" />
		</button>
		<template #popper>
			<ColorPicker
				class="InputColor__picker"
				:value="value"
				@input="$emit('input', $event)"
			/>
		</template>
	</Menu>
</template>

<script lang="ts" setup>
import {Menu} from 'floating-vue'
import {Chrome as ColorPicker} from 'vue-color'

defineProps<{
	value: string
}>()
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
		background-image linear-gradient(45deg, #ddd 25%, transparent 25%), linear-gradient(135deg, #ddd 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ddd 75%), linear-gradient(135deg, transparent 75%, #ddd 75%)
		background-position 0 0, 5px 0, 5px -5px, 0px 5px
		background-size 10px 10px
		vertical-align bottom
		font-size inherit

		&:after
			position absolute
			top 0
			left 0
			width 100%
			height 100%
			border 1px solid var(--border)
			border-radius 2px
			content ''
			input-transition(border-color)

		&:hover, &:focus
			&:after
				border-color var(--hover)

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
