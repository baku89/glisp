<template>
	<div id="app" class="app" :class="{compact}" :style="colors">
		<GlobalMenu class="app__global-menu" />
		<div class="app__content">
			<div class="app__inspector">
				<Inspector :value="selectedExpr" @input="onEditSelected" />
			</div>
			<div class="app__viewer">
				<ViewHandles class="view-handles" :exp="selectedExpr" @input="onEditSelected" />
				<Viewer
					:expr="viewExpr"
					:guide-color="guideColor"
					@resize="onResizeViewer"
					@render="onRender"
					@set-background="onSetBackground"
				/>
			</div>
			<div class="app__control">
				<div class="app__editor">
					<!-- <div class="app__editor-mode">
					<button :class="{active: editorMode == 'code'}" @click="editorMode = 'code'">&lt;/&gt;</button>
					<button :class="{active: editorMode == 'visual'}" @click="editorMode = 'visual'">👁</button>
					</div>-->
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
	</div>
</template>

<script lang="ts">
import 'normalize.css'

import {Component, Vue, Watch} from 'vue-property-decorator'
import Color from 'color'

import GlobalMenu from '@/components/GlobalMenu'
import Editor from '@/components/Editor.vue'
import Viewer from '@/components/Viewer.vue'
import Console from '@/components/Console.vue'
import Inspector from '@/components/Inspector.vue'
import ViewHandles from '@/components/ViewHandles.vue'
// import {TreeVector} from '@/components/Tree'

import {replEnv, printExp, readStr} from '@/mal'
import {
	MalVal,
	symbolFor as S,
	MalTreeWithRange,
	isList,
	M_START,
	M_END,
	M_META,
	M_FN,
	MalMap,
	isVector,
	M_EVAL,
	LispError
} from '@/mal/types'

import {replaceRange} from '@/utils'
import {printer} from '@/mal/printer'
import {BlankException, findAstByPosition, findAstByRange} from '@/mal/reader'
import {appHandler} from '@/mal/console'
import {viewREP} from './mal/view'
import Env from './mal/env'

const OFFSET = 19 // length of "(def $view (sketch "

@Component({
	name: 'App',
	components: {
		GlobalMenu,
		Editor,
		Viewer,
		Console,
		Inspector,
		ViewHandles
		// TreeVector
	}
})
export default class App extends Vue {
	private selection = [0, 0]
	private code = ''
	private background = 'whitesmoke'
	private compact = true
	private renderError = false
	private editorMode = 'code'
	private selectedExpr: MalVal = null
	private viewerSize = [0, 0]
	private setupCount = 0

	private expr: MalVal = null
	private viewExpr: MalVal = null
	private viewEnv: Env | null = null

	private initialCode!: string

	private get evalCode() {
		return `(def $view (sketch ${this.code} \n nil))`
	}

	@Watch('evalCode')
	private onEvalCodeUpdated() {
		this.readExpr()
		this.evalExpr()
	}

	private readExpr() {
		let expr
		try {
			expr = readStr(this.evalCode, true)
		} catch (err) {
			if (!(err instanceof BlankException)) {
				printer.error(err)
			}
			expr = null
		}

		this.expr = expr
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
					this.setupCount++
				} else {
					printer.error(`Failed to load from "${codeURL}"`)
				}

				history.pushState({}, document.title, url.pathname + url.search)
			}
			getCode()
		} else if (queryCode) {
			this.initialCode = decodeURI(queryCode)
			this.setupCount++
			url.searchParams.delete('code')
			history.pushState({}, document.title, url.pathname + url.search)
		} else {
			this.initialCode =
				localStorage.getItem('saved_code') ||
				require('raw-loader!./default-canvas.cljs').default
			this.setupCount++
		}

		appHandler.on('eval-selected', () => {
			if (
				this.selectedExpr &&
				this.activeRange &&
				typeof this.selectedExpr === 'object' &&
				(this.selectedExpr as any)[M_EVAL] !== undefined
			) {
				const evaled = (this.selectedExpr as any)[M_EVAL]
				const str = printExp(evaled)

				const [start, end] = this.activeRange
				const [code, ...selection] = replaceRange(this.code, start, end, str)

				this.onEdit(code)
				this.selection = selection
			}
		})

		appHandler.on('load-file', async (url: string) => {
			const res = await fetch(url)
			if (res.ok) {
				this.code = await res.text()
			} else {
				printer.error(`Failed to load from "${url}"`)
			}
		})

		appHandler.on('select-outer', this.onSelectOuter)

		appHandler.on('insert-exp', (item: MalVal) => {
			const itemStr = printExp(item)

			const [start, end] = this.selection
			const [code, ...selection] = replaceRange(this.code, start, end, itemStr)

			this.onEdit(code)
			this.selection = selection
		})
	}

	private evalExpr() {
		try {
			const {output, env} = viewREP(this.expr, {
				width: this.viewerSize[0],
				height: this.viewerSize[1],
				updateConsole: true,
				guideColor: this.guideColor
			})

			this.viewEnv = env
			this.viewExpr = output
		} catch (err) {
			if (err instanceof LispError) {
				printer.error(err.message)
			} else {
				printer.error(err)
			}
		}
	}

	private onEditSelected(val: MalVal) {
		if (this.activeRange) {
			const itemStr = printExp(val)
			const [start, end] = this.activeRange
			const [code, ...selection] = replaceRange(this.code, start, end, itemStr)

			this.onEdit(code)
			this.selection = selection
		}
	}

	// private onUpdateAst(ast: MalVal[]) {
	// 	this.code = (ast as any).map((val: MalVal) => printExp(val)).join('\n')
	// }

	private onSetupConsole() {
		this.setupCount++
	}

	@Watch('setupCount')
	private onSetupFinished() {
		if (this.setupCount === 2) {
			// Wait the initial rendering until the console has been mounted
			this.code = this.initialCode || ''
			this.onEdit(this.code)
			replEnv.set(S('$sketch'), this.code)
		}
	}

	private onRender(succeed: boolean) {
		this.renderError = !succeed
		this.updateselectedExpr()
	}

	private onEdit(value: string) {
		localStorage.setItem('saved_code', value)

		this.code = value
		replEnv.set(S('$sketch'), value)
	}

	private onResizeViewer(size: [number, number]) {
		this.viewerSize = size
		this.evalExpr()
	}

	private onSelect(selection: [number, number]) {
		this.selection = selection
		this.updateselectedExpr()
	}

	private get activeRange() {
		const selected = this.selectedExpr as MalTreeWithRange

		if (selected !== null && selected[M_START] >= OFFSET) {
			return [selected[M_START] - OFFSET, selected[M_END] - OFFSET]
		} else {
			return null
		}
	}

	private updateselectedExpr() {
		const [start, end] = this.selection
		const selected = findAstByRange(this.expr, start + OFFSET, end + OFFSET)
		if (Array.isArray(selected) && selected[0] === S('sketch')) {
			this.selectedExpr = null
		} else {
			this.selectedExpr = selected
		}
	}

	private getOuterRange(start: number, end: number) {
		const selected = findAstByRange(this.expr, start + OFFSET, end + OFFSET)

		if (selected !== null && selected[M_START] >= OFFSET) {
			return [selected[M_START] - OFFSET, selected[M_END] - OFFSET]
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

		return {...colors, '--background': this.background}
	}

	private get guideColor() {
		return this.colors['--selection']
	}

	private onSetBackground(bg: string) {
		console.log('onset background')
		let base

		try {
			base = Color(bg)
		} catch (err) {
			return
		}

		this.background = bg
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

$compact-dur = 0.4s

.app
	position relative
	overflow hidden
	width 100%
	height 100%
	height 100vh
	background var(--background)
	color var(--foreground)
	-webkit-font-smoothing antialiased
	-moz-osx-font-smoothing grayscale

	&__content
		position relative
		display flex
		height calc(100vh - 3.5rem)

	&__inspector
		position absolute
		bottom 1rem
		left 1rem
		z-index 1000
		width 30rem
		border 1px solid var(--comment)

	&__viewer
		position relative
		margin-right 1rem
		width 60%

		.view-handles
			position absolute
			top 0
			left 0
			z-index 100
			width 100%
			height 100%

		&:after
			position absolute
			top 1rem
			right -0.5rem
			bottom @top
			display block
			width 1px
			background var(--comment)
			content ''

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
