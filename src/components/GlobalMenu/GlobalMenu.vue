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
					'has-submenu': Array.isArray(content),
					active: expandedIndex === i
				}"
				@click="onClick(content, i)"
				:key="label"
			>
				{{ label }}
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
import {defineComponent, ref, Ref} from '@vue/composition-api'

export default defineComponent({
	name: 'GlobalMenu',
	directives: {ClickOutside},
	components: {
		GlobalSubmenu,
		WindowTitleButtons
	},
	props: {
		dark: {
			type: Boolean
		}
	},
	setup() {
		const menu = ref([
			[
				'File',
				[
					['Download Sketch', '(download-sketch)'],
					['Export Image', "(show-command-dialog 'export-image)"],
					['Publish to Gist', "(show-command-dialog 'publish-gist)"],
					['Generate Sketch URL', "(show-command-dialog 'generate-sketch-url)"]
				]
			],
			[
				'Edit',
				[
					['Expand Selected', '(expand-selected)'],
					['Select Outer', '(select-outer)']
				]
			],
			[
				'Examples',
				[
					['10 PRINT CHR', '(load-file "./examples/10-print-chr.glisp")'],
					['Hello World', '(load-file "./examples/hello-world.glisp")'],
					[
						'Primitive Definition',
						'(load-file "./examples/primitive-definition.glisp")'
					],
					['Transformation', '(load-file "./examples/transformation.glisp")'],
					['Replicator', '(load-file "./examples/replicator.glisp")'],
					[
						'Path Modification',
						'(load-file "./examples/path-modification.glisp")'
					]
				]
			],
			[
				'?',
				[
					['Documentation', '(open-link "https://baku89.com/glisp/docs/")'],
					['Jump to Repo', '(open-link "https://github.com/baku89/glisp")'],
					['Made by Baku Hashimoto', '(open-link "https://baku89.com")']
				]
			]
		])

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

		function onClick(content: string | string[][], i: number) {
			if (Array.isArray(content)) {
				expandedIndex.value = i
			} else {
				ConsoleScope.readEval(content)
				expandedIndex.value = null
			}
		}

		return {
			menu,
			expandedIndex,
			titleBar,
			platform,
			onClose,
			onClick
		}
	}
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
	z-index 1

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
		mask-image embedurl('../../../assets/logo.png')
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

			&:after
				border-top-color var(--hover) !important

		&.has-submenu:after
			display inline-block
			margin-bottom 0.1em
			margin-left 0.2em
			width 0
			height 0
			border-width 0.5em 0.3em 0 0.3em
			border-style solid
			border-color var(--comment) transparent transparent transparent
			content ''
			vertical-align middle

	&__submenu
		position absolute
		top calc(100% + 0.4rem)
		left 0
		z-index 1000
</style>
