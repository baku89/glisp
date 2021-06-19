<template>
	<ul class="ToolSelector">
		<li
			class="ToolSelector__li"
			v-for="[name, tool] in Object.entries(tools)"
			:key="name"
			:class="{active: name === modelValue}"
			@click="$emit('update:modelValue', name)"
		>
			<SvgIcon class="ToolSelector__icon" v-html="tool.icon" />
			<span class="ToolSelector__label">
				{{ tool.label }}
			</span>
		</li>
	</ul>
</template>

<script lang="ts">
import {defineComponent, PropType} from 'vue'

import SvgIcon from '@/components/layouts/SvgIcon.vue'

interface Tool {
	label: string
	icon: string
}

export default defineComponent({
	name: 'ToolSelector',
	components: {SvgIcon},
	props: {
		modelValue: {
			type: String,
			required: true,
		},
		tools: {
			type: Object as PropType<{[name: string]: Tool}>,
		},
	},
	emits: ['update:modelValue'],
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'

$size = 3em

.ToolSelector
	display flex
	flex-direction column
	width $size

	&__li
		position relative
		width $size
		height $size
		border 1px solid $color-frame
		background base16('00', 0.7)
		color base16('04')
		backdrop-filter blur(3px)
		input-transition(all)
		cursor pointer

		&:first-child
			border-top-left-radius $popup-round
			border-top-right-radius $popup-round

		&:last-child
			border-bottom-right-radius $popup-round
			border-bottom-left-radius $popup-round

		&:not(:last-child)
			border-bottom none

		&.active
			background base16('accent')
			color base16('00')

		&:hover .ToolSelector__label
			margin-left 0.5em
			opacity 1 !important

	&__icon
		display block !important
		flex-grow 1
		margin 0.25em
		width 100%
		height 100%
		font-size 2em
		transform translate(-1px, -1px)

	&__label
		position absolute
		top 50%
		left 100%
		margin-left 0em
		transform translateY(-50%)
		tooltip()
		color base16('04')
		opacity 0
		pointer-events none
		input-transition(all)
		white-space nowrap
</style>
