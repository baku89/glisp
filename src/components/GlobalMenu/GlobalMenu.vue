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
import {Component, Vue, Prop} from 'vue-property-decorator'
import ClickOutside from 'vue-click-outside'
import GlobalSubmenu from './GlobalSubmenu.vue'
import WindowTitleButtons from './WindowTitleButtons.vue'
import ConsoleScope from '@/scopes/console'
import isElectron from 'is-electron'
import {defineComponent} from '@vue/composition-api'

@Component({
	name: 'GlobalMenu',
	directives: {ClickOutside},
	components: {
		GlobalSubmenu,
		WindowTitleButtons
	}
})
export default class GlobalMenu extends Vue {
	private menu = [
		[
			'Export',
			[
				['Export', '(export)'],
				['Publish to Gist', '(publish-gist)'],
				['Save', '(save)']
			]
		],
		[
			'Edit',
			[
				['Eval Selected', '(eval-selected)'],
				['Select Outer', '(select-outer)']
			]
		],
		[
			'Examples',
			[
				['10 PRINT CHR', '(load-file "./examples/10-print-chr.cljs")'],
				['Hello World', '(load-file "./examples/hello-world.cljs")'],
				[
					'Primitive Definition',
					'(load-file "./examples/primitive-definition.cljs")'
				],
				['Transformation', '(load-file "./examples/transformation.cljs")'],
				['Replicator', '(load-file "./examples/replicator.cljs")'],
				['Path Modification', '(load-file "./examples/path-modification.cljs")']
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
	]

	private expandedIndex: number | null = null

	private get platform() {
		return eval('"process" in globalThis && globalThis.process.platform')
	}

	private titleBar = isElectron()
		? this.platform === 'darwin'
			? 'macos'
			: 'frameless'
		: null

	@Prop()
	private dark!: boolean

	private onClick(content: string | string[][], i: number) {
		if (Array.isArray(content)) {
			this.expandedIndex = i
		} else {
			ConsoleScope.readEval(content)
			this.expandedIndex = null
		}
	}

	private onClose() {
		this.expandedIndex = null
	}
}
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
	z-index 10

	&.title-bar-macos
		padding-left 70px

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
		mask-image embedurl('../../../public/assets/logo.png')
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
		line-height 3.4rem
		cursor pointer
		-webkit-app-region no-drag

		&:hover, &.active
			color var(--aqua)

			&:after
				border-top-color var(--aqua) !important

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
