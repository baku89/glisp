<template>
	<header
		class="GlobalMenu"
		:class="{dark, 'title-bar-macos': titleBar === 'macos'}"
	>
		<h1>'(GLISP)</h1>
		<div v-click-outside="onClose" class="GlobalMenu__menu">
			<div
				v-for="([label, content], i) in menu"
				:key="label"
				class="GlobalMenu__item"
				:class="{
					active: expandedIndex === i,
				}"
				@click="onClick(content, i)"
			>
				{{ label }}
				<i class="fas fa-caret-down" />
				<GlobalSubmenu
					v-if="expandedIndex === i"
					class="GlobalMenu__submenu"
					:menu="content"
					@click="onClick"
				/>
			</div>
		</div>
	</header>
</template>

<script lang="ts">
import {defineComponent, Ref, ref} from 'vue'
import ClickOutside from 'vue-click-outside'

import {Expr, isVector} from '@/glisp'
import AppScope from '@/scopes/app'
import ConsoleScope from '@/scopes/console'

import GlobalSubmenu from './GlobalSubmenu.vue'

export default defineComponent({
	name: 'GlobalMenu',
	directives: {ClickOutside},
	components: {
		GlobalSubmenu,
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

		const titleBar = ref(null)

		function onClose() {
			expandedIndex.value = null
		}

		function onClick(content: Expr, i: number) {
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
@/glis[/types
