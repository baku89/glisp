<template>
	<menu
		class="AppHeader"
		:class="{
			'title-bar-macos': titleBar === 'macos',
			'menu-opened': menuOpened,
		}"
	>
		<div class="AppHeader__title">
			<SvgIcon @mousedown="onClickMenu" class="icon" :strokeWidth="1.5">
				<circle cx="16" cy="16" r="14" />
				<path
					d="M2.71,11.61c1.57-4.82,6.74-7.45,11.55-5.89s7.45,6.74,5.89,11.55 M20.13,17.34c-2.01,6.17-8.55,9.6-14.73,7.79 M29.34,20.26c-0.82,2.54-3.55,3.92-6.09,3.1s-3.93-3.55-3.1-6.08"
				/>
			</SvgIcon>
		</div>
		<div class="AppHeader__left"><slot name="left" /></div>
		<div class="AppHeader__center"><slot name="center" /></div>
		<div class="AppHeader__right"><slot name="right" /></div>
	</menu>
	<div class="AppHeader__menu" v-if="menuOpened" ref="menu">
		<ul>
			<li
				v-for="{name, label, icon, payload} in menuInfo"
				:key="name"
				@mouseup="doAction(name, payload)"
			>
				<SvgIcon class="icon" mode="block" v-html="icon || ''"></SvgIcon>
				{{ label || name }}
			</li>
		</ul>
	</div>
</template>

<script lang="ts">
import _ from 'lodash'
import {computed, defineComponent, inject, PropType, ref} from 'vue-demi'

import {Store} from '@/lib/store'

import SvgIcon from '../layouts/SvgIcon.vue'

interface MenuCommand {
	name: string
	payload: any
}

export default defineComponent({
	components: {SvgIcon},
	name: 'AppHeader',
	props: {
		menu: {
			type: Array as PropType<(string | MenuCommand)[]>,
			default: () => [],
		},
	},
	setup(props) {
		const store = inject('store', {}) as Store

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

		function doAction(name: string, payload: any) {
			store.commit(name, payload)
		}

		const normalizedMenu = computed<MenuCommand[]>(() =>
			props.menu.map(m => (_.isString(m) ? {name: m, payload: null} : m))
		)

		const menuInfo = computed(() =>
			normalizedMenu.value.map(m => ({...m, ...store.getAction(m.name)}))
		)

		return {
			titleBar,
			menuOpened,
			menuInfo,
			onClickMenu,
			doAction,
		}
	},
})
</script>
<style lang="stylus">
@import '~@/components/style/common.styl'

$height = 3.2em

.AppHeader
	position relative
	display grid
	overflow visible
	height var(--height)
	border-bottom 1px solid $color-frame
	glass-bg('pane')
	--height $height
	-webkit-app-region drag
	grid-template-columns min-content 1fr 1fr 1fr

	&__left
		justify-self start

	&__center
		justify-self center

	&__right
		justify-self end

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
			display inline-block
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
