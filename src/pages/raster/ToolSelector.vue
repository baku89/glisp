<template>
	<div class="ToolSelector">
		<ul class="ToolSelector__ui">
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
		<div class="ToolSelector__new">
			<SvgIcon mode="block" class="icon">
				<path d="M16 2 L16 30 M2 16 L30 16" />
			</SvgIcon>
		</div>
	</div>
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
		color base16('04')
		input-transition(all)
		cursor pointer
		glass-bg('float')

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
		width max-content

	&__new
		margin: $size * 0.15
		width: $size * 0.7
		height: $size * 0.7
		border 1px solid $color-frame
		border-radius 50%
		color base16('04')
		glass-bg('float')
		input-transition(all)
		cursor pointer

		& > .icon
			margin 23%
			width 50%
			height 50%

		~/:hover &
			opacity 1
</style>
