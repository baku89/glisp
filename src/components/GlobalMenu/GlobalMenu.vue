<template>
	<header
		class="GlobalMenu"
		:class="{dark, 'title-bar-macos': titleBar === 'macos'}"
	>
		<h1>'(GLISP)</h1>
		<div class="GlobalMenu__menu" v-click-outside="onClose">
			<div
				class="GlobalMenu__item"
				v-for="([label, content], i) in menu"
				:class="{
					active: expandedIndex === i,
				}"
				@click="onClick(content, i)"
				:key="label"
			>
				{{ label }}
				<i class="fas fa-caret-down" />
				<GlobalSubmenu
					class="GlobalMenu__submenu"
					v-if="expandedIndex === i"
					:menu="content"
					@click="onClick"
				/>
			</div>
		</div>
		<WindowTitleButtons v-if="titleBar === 'frameless'" :dark="dark" />
	</header>
</template>

<script lang="ts">
import ClickOutside from 'vue-click-outside'
import GlobalSubmenu from './GlobalSubmenu.vue'
import WindowTitleButtons from './WindowTitleButtons.vue'
import ConsoleScope from '@/scopes/console'
import isElectron from 'is-electron'
import {defineComponent, ref, Ref} from 'vue'
import AppScope from '@/scopes/app'
import {isVector, MalVal} from '@/mal/types'

export default defineComponent({
	name: 'GlobalMenu',
	directives: {ClickOutside},
	components: {
		GlobalSubmenu,
		WindowTitleButtons,
	},
	props: {
		dark: {
			type: Boolean,
		},
	},
	setup() {
		const menu = ref(AppScope.var('*global-menu*') || [])

		const expandedIndex: Ref<number | null> = ref(null)

		const platform = ref(
			eval('"process" in globalThis && globalThis.process.platform') as string
		)

		const titleBar = ref(
			isElectron()
				? platform.value === 'darwin'
					? 'macos'
					: 'frameless'
				: null
		)

		function onClose() {
			expandedIndex.value = null
		}

		function onClick(content: MalVal, i: number) {
			if (isVector(content)) {
				expandedIndex.value = i
			} else {
				ConsoleScope.eval(content)
				expandedIndex.value = null
			}
		}

		return {
			menu,
			expandedIndex,
			titleBar,
			platform,
			onClose,
			onClick,
		}
	},
})
</script>

<style lang="stylus" scoped>
$height = 3.4rem

.GlobalMenu
	position relative
	display flex
	overflow visible
	height $height
	border-bottom 1px solid var(--border)
	user-select none

	&.title-bar-macos
		padding-left 74px

	h1
		position relative
		overflow hidden
		margin 0 0 0 0.5rem
		padding 0rem
		width $height
		height $height
		background var(--comment)
		text-align center
		text-indent 10rem
		font-weight normal
		mask-image embedurl('./logo.png')
		mask-size 60% 60%
		mask-repeat no-repeat
		mask-position 50% 50%

	&__menu
		position relative
		z-index 100
		display flex
		flex-grow 1

	&__item
		position relative
		padding 0 1.5rem
		height 100%
		color var(--comment)
		// font-size 1.1rem
		// background red
		line-height 3.5rem
		cursor pointer
		-webkit-app-region no-drag

		&:hover, &.active
			color var(--hover)

	&__submenu
		position absolute
		top calc(100% + 0.4rem)
		left 0
		z-index 1000
</style>
