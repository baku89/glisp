<template>
	<ul class="Menu">
		<li
			v-for="{name, label, icon, exec} in menu"
			:key="name"
			@mouseup="doAction(exec)"
		>
			<SvgIcon class="icon" mode="block" v-html="icon" />
			{{ label || name }}
		</li>
	</ul>
</template>

<script lang="ts">
import {defineComponent, PropType} from 'vue'

import SvgIcon from './SvgIcon.vue'

export interface MenuItem {
	name: string
	label: string
	icon?: string
	exec: (...args: any[]) => any
}

export default defineComponent({
	components: {SvgIcon},
	name: 'Menu',
	props: {
		menu: {
			type: Array as PropType<MenuItem[]>,
			default: () => [],
		},
	},
	emits: ['action'],
	setup(_, context) {
		function doAction(exec: MenuItem['exec']) {
			context.emit('action')
			exec()
		}

		return {doAction}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'

.Menu
	margin 0.5em
	border 1px solid $color-frame
	border-radius $popup-round
	glass-bg('pane')
	width max-content
	color base16('05')

	padding ($input-horiz-margin * .5) 0

	li
		display grid
		padding 0 1rem
		height 2.3em
		line-height 2.3em
		cursor pointer
		grid-template-columns 1.2em 1fr
		grid-gap 0.5em

		&:hover
			background base16('accent')
			color base16('00')

	.icon
		width 1.2em
</style>
