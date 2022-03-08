<template>
	<div class="SidePane">
		<div class="SidePane__main" v-bind="mainAttr">
			<slot name="main" />
		</div>
		<div class="SidePane__splitter" :class="{collapsed}" ref="splitterEl" />
		<div class="SidePane__side" :style="{width: `${sideWidth}px`}">
			<div
				v-show="!collapsed"
				class="SidePane__side-content"
				:style="{minWidth: `${minWidth}px`}"
				v-bind="sideAttr"
			>
				<slot name="side" />
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import 'splitpanes/dist/splitpanes.css'

import {useLocalStorage} from '@vueuse/core'
import {computed, defineComponent, ref} from 'vue'

import useDraggable from '../use/use-draggable'

export default defineComponent({
	name: 'SidePane',
	props: {
		uid: {
			type: String,
		},
		mainAttr: {
			type: Object,
			default: () => ({}),
		},
		sideAttr: {
			type: Object,
			default: () => ({}),
		},
		minWidth: {
			type: Number,
			default: 320,
		},
		defaultWidth: {
			type: Number,
			default: 420,
		},
	},
	setup(props) {
		const sideWidth = props.uid
			? useLocalStorage(`ui.SidePane.${props.uid}`, props.defaultWidth)
			: ref(props.defaultWidth)

		const splitterEl = ref<HTMLElement | null>(null)

		useDraggable(splitterEl, {
			onClick() {
				if (collapsed.value) sideWidth.value = props.defaultWidth
			},
			onDrag(drag) {
				const w = window.innerWidth - drag.pos[0]

				if (w < 10) {
					sideWidth.value = 0
				} else {
					sideWidth.value = w
				}
			},
		})

		const collapsed = computed(() => sideWidth.value === 0)

		return {sideWidth, splitterEl, collapsed}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'

.SidePane
	overflow hidden
	display flex
	align-items stretch
	touch-action none

	&__main
		flex-grow 1

	&__splitter
		position relative
		z-index 1
		margin 0 -0.5em
		padding 0
		width calc(1px + 1em)
		border-right 0.5em solid transparent
		border-left 0.5em solid transparent
		input-transition()

		&:before, &:after
			display block
			position absolute
			input-transition()

		&:hover
			border-color $color-frame
			cursor col-resize

		&:before
			content ''
			inset 0
			background red
			background $color-frame

		&.collapsed:before
			background transparent

		&:hover:before
			transform scaleX(5)
			background base16('accent')

		&:after
			content '<'
			top 50%
			left calc(-1.2em + 1px)
			width 1.2em
			height 6em
			transform scaleX(0)
			margin-top -3em
			line-height 6em
			font-monospace()
			text-align center
			color base16('04')
			transform-origin 100% 0
			background base16('02')
			border-top-left-radius $popup-round
			border-bottom-left-radius $popup-round

		&.collapsed:after
			transform scaleX(1)

		&:hover:after
			background base16('accent')
			color base16('00')

	&__side
		position relative
		overflow hidden
		display flex
		align-items stretch

		&-content
			flex-grow 1
</style>
