<template>
	<div id="app" :class="{'background-set': backgroundSet, compact}" :style="colors">
		<div class="app__viewer">
			<Viewer :ast="ast" :selection="selection" @render="onRender" @set-background="onSetBackground" />
		</div>
		<div class="app__control">
			<div class="app__editor">
				<div class="app__editor-mode">
					<button :class="{active: editorMode == 'code'}" @click="editorMode = 'code'">&lt;/&gt;</button>
					<button :class="{active: editorMode == 'visual'}" @click="editorMode = 'visual'">👁</button>
				</div>
				<Editor
					v-if="editorMode == 'code'"
					:code="code"
					:selection="selection"
					:activeRange="activeRange"
					:dark="dark"
					@input="onEdit"
					@select="onSelect"
					@select-outer="onSelectOuter"
				/>
				<Tree v-else :ast="sketchAst" @update="onUpdateAst" />
			</div>
			<div class="app__console">
				<button
					class="app__console-toggle"
					:class="{error: renderError}"
					@click="compact = !compact"
				>{{ renderError ? '!' : '✓' }}</button>
				<Console :compact="compact" @setup="onSetupConsole" />
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import 'normalize.css'

import {Component, Vue, Watch} from 'vue-property-decorator'
import Color from 'color'

import Editor from '@/components/Editor.vue'
import Viewer from '@/components/Viewer.vue'
import Console from '@/components/Console.vue'
import Tree from '@/components/Tree.vue'

import {replEnv, printExp, readStr} from '@/mal'
import {viewHandler} from '@/mal/view'
import {MalVal, symbolFor as S, MalTreeWithRange, isList} from '@/mal/types'

import {replaceRange} from '@/utils'
import {printer} from './mal/printer'
import {BlankException, findAstByPosition, findAstByRange} from './mal/reader'

@Component({
	components: {
		Editor,
		Viewer,
		Console,
		Tree
	}
})
export default class App extends Vue {
	private selection = [0, 0]
	private code = ''
	private background = 'whitesmoke'
	private backgroundSet = false
	private compact = true
	private renderError = false
	private editorMode = 'code'

	private initialCode!: string

	private get evalCode() {
		const lines = this.code.split('\n').map(s => s.replace(/;.*$/, '').trim())
		const trimmed = lines.join('')

		return trimmed ? `(def $view (eval-sketch ${this.code}))` : ''
	}

	private get ast(): MalVal {
		try {
			return readStr(this.evalCode, true)
		} catch (err) {
			if (!(err instanceof BlankException)) {
				printer.error(err)
			}
			return null
		}
	}

	private get sketchAst(): MalVal {
		return isList(this.ast) ? (this.ast[2] as MalVal[]).slice(1) : []
	}

	private created() {
		const url = new URL(location.href)

		const queryCodeURL = url.searchParams.get('code_url')
		const queryCode = url.searchParams.get('code')
		const doClear = url.searchParams.has('clear')

		if (doClear) {
			localStorage.removeItem('saved_code')
			url.searchParams.delete('clear')
			history.pushState({}, document.title, url.pathname + url.search)
		}

		this.compact = url.searchParams.has('compact')

		if (queryCodeURL) {
			const codeURL = decodeURI(queryCodeURL)
			url.searchParams.delete('code_url')
			url.searchParams.delete('code')

			const getCode = async () => {
				const res = await fetch(codeURL)
				if (res.ok) {
					const code = await res.text()
					this.initialCode = `;; Loaded from "${codeURL}"\n\n${code}`
				} else {
					printer.error(`Failed to load from "${codeURL}"`)
				}

				history.pushState({}, document.title, url.pathname + url.search)
			}
			getCode()
		} else if (queryCode) {
			this.initialCode = decodeURI(queryCode)
			url.searchParams.delete('code')
			history.pushState({}, document.title, url.pathname + url.search)
		} else {
			this.initialCode =
				localStorage.getItem('saved_code') ||
				require('raw-loader!./default-canvas.cljs').default
		}

		viewHandler.on('$insert', (item: MalVal) => {
			const itemStr = printExp(item)

			const [start, end] = this.selection
			const [code, ...selection] = replaceRange(this.code, start, end, itemStr)

			this.onEdit(code)
			this.selection = selection
		})
	}

	private onUpdateAst(ast: MalVal[]) {
		this.code = (ast as any).map((val: MalVal) => printExp(val)).join('\n')
	}

	private onSetupConsole() {
		// Wait the initial rendering until the console has been mounted
		this.code = this.initialCode
		replEnv.set(S('$canvas'), this.code)
	}

	private onRender(succeed: boolean) {
		this.renderError = !succeed
	}

	private onEdit(value: string) {
		localStorage.setItem('saved_code', value)

		this.code = value
		replEnv.set(S('$canvas'), value)
	}

	private onSelect(selection: [number, number]) {
		this.selection = selection
	}

	private get activeRange() {
		const [start, end] = this.selection

		return this.getOuterRange(start, end)
	}

	private getOuterRange(start: number, end: number) {
		const offset = 24 // length of "(def $view (eval-sketch "

		const selected = findAstByRange(this.ast, start + offset, end + offset)

		if (selected && selected.start >= offset) {
			return [selected.start - offset, selected.end - offset]
		} else {
			return null
		}
	}

	private onSelectOuter() {
		if (this.activeRange === null) {
			return
		}

		if (this.selection[0] === this.selection[1]) {
			this.selection = this.activeRange
		} else {
			const selection = this.getOuterRange(
				this.activeRange[0] - 1,
				this.activeRange[1]
			)
			if (selection) {
				this.selection = selection
			}
		}
	}

	private get dark() {
		return Color(this.background).isDark()
	}

	private get colors() {
		const brightColors = {
			'--currentline': '#efefef',
			'--selection': '#d6d6d6',
			'--foreground': '#4d4d4c',
			'--comment': '#8e908c',
			'--red': '#c82829',
			'--orange': '#f5871f',
			'--yellow': '#eab700',
			'--green': '#718c00',
			'--aqua': '#3e999f',
			'--blue': '#4271ae',
			'--purple': '#8959a8'
		}

		const darkColors = {
			'--currentline': '#282a2e',
			'--selection': '#373b41',
			'--foreground': '#c5c8c6',
			'--comment': '#969896',
			'--red': '#cc6666',
			'--orange': '#de935f',
			'--yellow': '#f0c674',
			'--green': '#b5bd68',
			'--aqua': '#8abeb7',
			'--blue': '#81a2be',
			'--purple': '#b294bb'
		}

		const colors = this.dark ? darkColors : brightColors

		replEnv.set(S('$guide-color'), colors['--selection'])

		return {...colors, '--background': this.background}
	}

	private onSetBackground(bg: string) {
		if (this.background === bg) {
			return
		}

		let base

		try {
			base = Color(bg)
		} catch (err) {
			return
		}

		replEnv.set(S('$background'), this.background)

		this.background = bg
		if (!this.backgroundSet) {
			setTimeout(() => (this.backgroundSet = true), 1)
		}
	}
}
</script>

<style lang="stylus">
*, ::after, ::before
	box-sizing border-box
	outline none
	-webkit-tap-highlight-color transparent

html, body
	overflow hidden
	height 100vh
	--ease cubic-bezier(0.22, 0, 0.02, 1)

html
	font-size 12px
	font-family 'Fira Code', monospace

button
	outline none
	border none
	background none
	user-select none

#app
	display flex
	overflow hidden
	width 100%
	height 100vh
	background var(--background)
	color var(--foreground)
	text-align center
	transition background var(--tdur) var(--ease)
	--tdur 0
	-webkit-font-smoothing antialiased
	-moz-osx-font-smoothing grayscale

	&.background-set
		--tdur 1s

$compact-dur = 0.4s

.app
	&__tree
		position absolute
		bottom 0
		left 0
		width 30rem
		height 30rem
		background red

	&__viewer
		position relative
		margin-right 1rem
		width 60%

		&:after
			position absolute
			top 1rem
			right -0.5rem
			bottom @top
			display block
			width 1px
			background var(--comment)
			content ''
			transition background var(--tdur) var(--ease)

	&__control
		position relative
		width calc(40% - 1rem)

	&__editor
		position relative
		margin 1rem 0.5rem 1rem 1rem
		height calc(70% - 2rem)
		transition height $compact-dur var(--ease)

		&:after
			position absolute
			right 0
			bottom -0.5rem
			left -1rem
			display block
			height 1px
			background var(--comment)
			content ''
			transition background var(--tdur) var(--ease)

	&__editor-mode
		position absolute
		top 0
		right 0
		z-index 100
		display flex
		padding 0 0.3rem
		border 1px solid var(--comment)
		border-radius 1.5rem
		background var(--background)
		font-size 2rem

		button
			display block
			padding 0.3rem 0.5rem
			color var(--comment)
			line-height 1.5rem

			&.active
				color var(--blue)

			&:first-child
				font-size 0.7em

			&:not(:first-child)
				border-left 1px dotted var(--comment)

	&__console
		position absolute
		bottom 0
		margin 0.5rem 0.5rem 1rem 1rem
		width calc(100% - 1.5rem)
		height calc(30% - 1.5rem)
		transition height $compact-dur var(--ease)

		&-toggle
			$size = 2.5rem
			position absolute
			top -3rem
			right 0
			margin-top -0.5 * $size
			width $size
			height $size
			border 1px solid var(--comment)
			border-radius 0.5 * $size
			background var(--background)
			color var(--comment)
			font-size 1.3rem
			line-height 2.2rem
			transition all $compact-dur var(--ease)
			--textcolor var(--comment)

			&.error
				border-color var(--red)
				background var(--red)
				color var(--background)
				--textcolor var(--background)

			&:hover
				height 1.5 * $size
				color transparent

				&:before
					opacity 1

			&:before
				position absolute
				bottom 0
				left 0
				width $size
				height $size
				border-radius 0.5 * $size
				color var(--textcolor)
				// background red
				content '<'
				line-height $size
				opacity 0
				transition all $compact-dur var(--ease)
				transform rotate(-90deg)

			.compact &
				&:hover
					transform translateY(-1.5rem)

				&:before
					top 0
					bottom none
					transform rotate(90deg)

.compact .app__editor
	height calc(100% - 2rem - 2.2rem - 1.5rem)

.compact .app__console
	height 2.2rem
</style>
