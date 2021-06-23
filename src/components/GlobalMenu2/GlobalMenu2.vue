<template>
	<menu
		class="GlobalMenu2"
		:class="{
			'title-bar-macos': titleBar === 'macos',
			'menu-opened': menuOpened,
		}"
	>
		<div class="GlobalMenu2__title">
			<SvgIcon @mousedown="onClickMenu" class="icon" :strokeWidth="1.5">
				<circle cx="16" cy="16" r="14" />
				<path
					d="M2.71,11.61c1.57-4.82,6.74-7.45,11.55-5.89s7.45,6.74,5.89,11.55 M20.13,17.34c-2.01,6.17-8.55,9.6-14.73,7.79 M29.34,20.26c-0.82,2.54-3.55,3.92-6.09,3.1s-3.93-3.55-3.1-6.08"
				/>
			</SvgIcon>
		</div>
		<slot name="left" />
	</menu>
	<div class="GlobalMenu2__menu" v-if="menuOpened" ref="menu">
		<ul>
			<li
				v-for="[name, action] in menuInfo"
				:key="name"
				@mouseup="doAction(name)"
			>
				<SvgIcon class="icon" mode="block" v-html="action.icon || ''"></SvgIcon>
				{{ action.label || name }}
			</li>
		</ul>
	</div>
</template>

<script lang="ts">
import {computed, defineComponent, inject, PropType, ref} from 'vue-demi'

import {Store} from '@/lib/store'

import SvgIcon from '../layouts/SvgIcon.vue'

export default defineComponent({
	components: {SvgIcon},
	name: 'GlobalMenu2',
	props: {
		menu: {
			type: Array as PropType<string[]>,
			default: () => [],
		},
	},
	setup(props) {
		const store = inject('store') as Store

		const titleBar = ref(
			/electron/i.test(navigator.userAgent)
				? /mac/i.test(navigator.platform)
					? 'macos'
					: 'frameless'
				: null
		)

		const menuOpened = ref(false)

		function onClickMenu(e: MouseEvent) {
			if (menuOpened.value) {
				return
			}

			menuOpened.value = true

			const titleEl = e.target

			window.addEventListener(
				'mouseup',
				(e: MouseEvent) => {
					if (e.target !== titleEl) {
						menuOpened.value = false
						return
					}

					window.addEventListener('mouseup', () => (menuOpened.value = false), {
						once: true,
					})
				},
				{once: true}
			)
		}

		function doAction(name: string) {
			store.commit(name, {})
		}

		const menuInfo = computed(() =>
			props.menu.map(name => [name, store.getAction(name)])
		)

		return {titleBar, menuOpened, menuInfo, onClickMenu, doAction}
	},
})
</script>
<style lang="stylus">
@import '~@/components/style/common.styl'

$height = 3.2em

.GlobalMenu2
	position relative
	display flex
	overflow visible
	height $height
	border-bottom 1px solid $color-frame
	glass-bg('pane')
	--height $height
	-webkit-app-region drag

	&__title
		position relative
		overflow hidden
		margin 0 0 0 0.5em
		padding-bottom 3px
		width $height
		height $height
		color base16('05')
		text-align center
		line-height $height
		-webkit-app-region no-drag

		.icon
			font-size 2em
			transition transform 0.3s ease

		&:hover, ~/.menu-opened &
			background base16('01')
			color base16('accent')

			.icon
				transform rotate(270deg)

	&.title-bar-macos &__title
		margin-left calc(65px + 0.5em)

	&__menu
		position fixed
		top $height
		left 0
		z-index 1000
		margin 0.5em
		border 1px solid $color-frame
		border-radius $popup-round
		glass-bg('pane')

		ul
			padding $input-horiz-margin 0

		li
			display grid
			padding 0 1rem
			height 2.3em
			line-height 2.3em
			grid-template-columns 1.2em 1fr
			grid-gap 0.5em

			&:hover
				background base16('accent')
				color base16('00')

		.icon
			width 1.2em
</style>
