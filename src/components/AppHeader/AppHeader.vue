<template>
	<menu
		class="AppHeader"
		:class="{
			'title-bar-macos': titleBar === 'macos',
			'menu-opened': menuOpened,
		}"
	>
		<div class="AppHeader__title" ref="menuIcon">
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
	<Popover :reference="menuIcon" :open="menuOpened">
		<Menu :menu="menuItem" />
	</Popover>
</template>

<script lang="ts">
import _ from 'lodash'
import {computed, defineComponent, inject, PropType, ref} from 'vue-demi'

import Menu from '@/components/layouts/Menu.vue'
import {Store} from '@/lib/store'

import Popover from '../layouts/Popover.vue'
import SvgIcon from '../layouts/SvgIcon.vue'

export interface MenuCommand {
	name: string
	payload: any
}

export default defineComponent({
	name: 'AppHeader',
	components: {Menu, Popover, SvgIcon},
	props: {
		menu: {
			type: Array as PropType<(string | MenuCommand)[]>,
			default: () => [],
		},
	},
	setup(props) {
		const menuIcon = ref(null)

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

		const store = inject('store', {}) as Store

		const menuItem = computed(() =>
			props.menu
				.map(m => (_.isString(m) ? {name: m, payload: null} : m))
				.map(m => {
					const action = store.getAction(m.name)
					return {
						name: m.name,
						label: action.label || m.name,
						icon: action.icon,
						exec: () => store.commit(m.name, m.payload),
					}
				})
		)

		return {
			titleBar,
			menuIcon,
			menuOpened,
			menuItem,
			onClickMenu,
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
</style>
