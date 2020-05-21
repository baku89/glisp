<template>
	<div class="GlobalMenu">
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
	</div>
</template>

<script lang="ts">
import {Component, Vue} from 'vue-property-decorator'
import ClickOutside from 'vue-click-outside'
import GlobalSubmenu from './GlobalSubmenu.vue'
import ConsoleScope from '@/scopes/console'

@Component({
	name: 'GlobalMenu',
	directives: {ClickOutside},
	components: {
		GlobalSubmenu
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
.GlobalMenu
	position relative
	display flex
	overflow visible
	height 3.5rem
	border-bottom 1px dashed var(--comment)
	user-select none

	h1
		position relative
		margin 0
		padding 0rem
		width 10rem
		height 3.5rem
		border-right 1px solid var(--comment)
		text-align center
		letter-spacing 0.2em
		font-size 1.1rem
		line-height 3.5rem

	&__menu
		display flex
		flex-grow 1

	&__item
		position relative
		padding 0 1.5rem
		height 100%
		color var(--comment)
		font-size 1.1rem
		// background red
		line-height 3.5rem
		cursor pointer

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
