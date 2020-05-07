<template>
	<div id="app" class="app" :class="{compact}" :style="colors">
		<GlobalMenu class="app__global-menu" />
		<div class="app__content">
			<div class="app__inspector" v-if="selectedExp">
				<Inspector :value="selectedExp" @input="onUpdateSelectedExp" />
			</div>
			<div class="app__viewer">
				<ViewHandles class="view-handles" :exp="selectedExp" @input="onUpdateSelectedExp" />
				<Viewer
					:exp="viewExp"
					:guide-color="guideColor"
					@resize="onViewerResized"
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
						:value="code"
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
import {
	defineComponent,
	reactive,
	ref,
	Ref,
	computed,
	watch,
	onMounted,
	toRefs
} from '@vue/composition-api'
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

import {replaceRange, NonReactive, nonReactive} from '@/utils'
import {printer} from '@/mal/printer'
import {BlankException, findAstByPosition, findAstByRange} from '@/mal/reader'
import {appHandler} from '@/mal/console'
import {viewREP} from './mal/view'
import Env from './mal/env'

const OFFSET = 19 // length of "(def $view (sketch "

const BRIGHT_COLORS = {
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

const DARK_COLORS = {
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

export default defineComponent({
	name: 'App',
	components: {
		GlobalMenu,
		Editor,
		Viewer,
		Console,
		Inspector,
		ViewHandles
	},
	setup() {
		const data = reactive({
			selection: [0, 0] as number[],
			activeRange: computed(() => {
				const selected = data.selectedExp as MalTreeWithRange
				if (selected !== null && selected[M_START] >= OFFSET) {
					return [selected[M_START] - OFFSET, selected[M_END] - OFFSET]
				} else {
					return null
				}
			}),
			codeHasLoaded: false,
			code: '',
			evalCode: computed(() => `(def $view (sketch ${data.code} \n nil))`),
			renderError: null as null | string,
			selectedExp: null as MalVal,
			editorMode: 'code',
			exp: null as MalVal,
			viewExp: null
		})

		const ui = reactive({
			compact: false,
			background: '',
			dark: computed(() => {
				try {
					return Color(ui.background).isDark() as boolean
				} catch (_) {
					return false
				}
			}),
			colors: computed(() => {
				const colors = ui.dark ? DARK_COLORS : BRIGHT_COLORS
				return {...colors, '--background': ui.background}
			}),
			viewerSize: [0, 0],
			guideColor: computed(() => ui.colors['--selection'])
		})

		function _getOuterRange(start: number, end: number) {
			const selected = findAstByRange(data.exp, start + OFFSET, end + OFFSET)

			if (selected !== null && selected[M_START] >= OFFSET) {
				return [selected[M_START] - OFFSET, selected[M_END] - OFFSET]
			} else {
				return null
			}
		}

		function onSelectOuter() {
			if (data.activeRange === null) {
				return
			}

			if (data.selection[0] === data.selection[1]) {
				data.selection = data.activeRange
			} else {
				const selection = _getOuterRange(
					data.activeRange[0] - 1,
					data.activeRange[1]
				)
				if (selection) {
					data.selection = selection
				}
			}
		}

		function onEdit(value: string) {
			localStorage.setItem('saved_code', value)
			data.code = value
		}

		// URL
		const url = new URL(location.href)

		ui.compact = url.searchParams.has('compact')

		if (url.searchParams.has('clear')) {
			localStorage.removeItem('saved_code')
			url.searchParams.delete('clear')
			history.pushState({}, document.title, url.pathname + url.search)
		}

		// Load initial codes
		const loadCodePromise = (async () => {
			let code = ''

			const queryCodeURL = url.searchParams.get('code_url')
			const queryCode = url.searchParams.get('code')

			if (queryCodeURL) {
				const codeURL = decodeURI(queryCodeURL)
				url.searchParams.delete('code_url')
				url.searchParams.delete('code')

				const res = await fetch(codeURL)
				if (res.ok) {
					code = await res.text()

					if (codeURL.startsWith('http')) {
						code = `;; Loaded from "${codeURL}"\n\n${code}`
					}
				} else {
					printer.error(`Failed to load from "${codeURL}"`)
				}

				history.pushState({}, document.title, url.pathname + url.search)
			} else if (queryCode) {
				code = decodeURI(queryCode)
				url.searchParams.delete('code')
				history.pushState({}, document.title, url.pathname + url.search)
			} else {
				code =
					localStorage.getItem('saved_code') ||
					require('raw-loader!./default-canvas.cljs').default
			}

			return code
		})()

		let onSetupConsole
		const setupConsolePromise = new Promise(resolve => {
			onSetupConsole = () => {
				resolve()
			}
		})

		Promise.all([loadCodePromise, setupConsolePromise]).then(ret => {
			data.code = ret[0] as string
			data.codeHasLoaded = true
		})

		function _updateSelectedExp() {
			const [start, end] = data.selection
			const selected = findAstByRange(data.exp, start + OFFSET, end + OFFSET)
			if (Array.isArray(selected) && selected[0] === S('sketch')) {
				data.selectedExp = null
			} else {
				data.selectedExp = selected
			}
		}

		function onSelect(selection: [number, number]) {
			data.selection = selection
			_updateSelectedExp()
		}

		function _readStr() {
			let exp
			try {
				exp = readStr(data.evalCode, true)
			} catch (err) {
				if (!(err instanceof BlankException)) {
					printer.error(err)
				}
				exp = null
			}
			data.exp = exp
		}

		function _evalExp() {
			try {
				const {output, env} = viewREP(data.exp, {
					width: ui.viewerSize[0],
					height: ui.viewerSize[1],
					updateConsole: true,
					guideColor: ui.guideColor
				})

				// this.viewEnv = nonReactive(env)
				data.viewExp = nonReactive(output)
			} catch (err) {
				if (err instanceof LispError) {
					printer.error(err.message)
				} else {
					printer.error(err)
				}
			}
		}

		// Init App Handler
		appHandler.on('eval-selected', () => {
			if (
				data.selectedExp &&
				data.activeRange &&
				typeof data.selectedExp === 'object' &&
				(data.selectedExp as any)[M_EVAL] !== undefined
			) {
				const evaled = (data.selectedExp as any)[M_EVAL]
				const str = printExp(evaled)

				const [start, end] = data.activeRange
				const [code, ...selection] = replaceRange(data.code, start, end, str)

				onEdit(code)
				data.selection = selection
			}
		})

		appHandler.on('load-file', async (url: string) => {
			const res = await fetch(url)
			if (res.ok) {
				data.code = await res.text()
			} else {
				printer.error(`Failed to load from "${url}"`)
			}
		})

		appHandler.on('select-outer', onSelectOuter)

		appHandler.on('insert-exp', (item: MalVal) => {
			const itemStr = printExp(item)

			const [start, end] = data.selection
			const [code, ...selection] = replaceRange(data.code, start, end, itemStr)

			onEdit(code)
			data.selection = selection
		})

		function onRender(succeed: boolean) {
			data.renderError = !succeed
			_updateSelectedExp()
		}

		function onViewerResized(size: [number, number]) {
			ui.viewerSize = size
			_evalExp()
		}

		// Background and theme
		function onSetBackground(bg: string) {
			let base

			try {
				base = Color(bg)
			} catch (err) {
				return
			}

			ui.background = bg
		}

		watch(
			() => data.code,
			() => {
				replEnv.set(S('$sketch'), data.code)
			}
		)

		watch(
			() => data.evalCode,
			() => {
				_readStr()
				_evalExp()
			}
		)

		function onUpdateSelectedExp(val: MalVal) {
			if (data.activeRange) {
				const itemStr = printExp(val)
				const [start, end] = data.activeRange
				const [code, ...selection] = replaceRange(
					data.code,
					start,
					end,
					itemStr
				)

				onEdit(code)
				data.selection = selection
			}
		}

		return {
			...toRefs(data),
			onEdit,
			onRender,
			onSelect,
			onSetupConsole,
			onViewerResized,
			onUpdateSelectedExp,
			onSelectOuter,

			...toRefs(ui),
			onSetBackground
		}
	}
})
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
