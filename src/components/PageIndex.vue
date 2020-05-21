<template>
	<div id="app" class="PageIndex" :style="colors">
		<GlobalMenu class="PageIndex__global-menu" />
		<div class="PageIndex__content">
			<div class="PageIndex__inspector" v-if="selectedExp">
				<Inspector :value="selectedExp" @input="onUpdateSelectedExp" />
			</div>
			<div class="PageIndex__viewer">
				<ViewHandles
					class="view-handles"
					:exp="selectedExp"
					@input="onUpdateSelectedExp"
				/>
				<Viewer
					:exp="viewExp"
					:guide-color="guideColor"
					@resize="viewerSize = $event"
					@render="hasRenderError = !$event"
					@set-background="onSetBackground"
				/>
			</div>
			<div class="PageIndex__control" :class="{compact}">
				<div class="PageIndex__editor">
					<Editor
						:value="code"
						:selection="selection"
						:activeRange="selectedExpRange"
						:dark="dark"
						@input="code = $event"
						@select="selection = $event"
					/>
				</div>
				<div class="PageIndex__console">
					<button
						class="PageIndex__console-toggle"
						:class="{error: hasError}"
						@click="compact = !compact"
					>
						{{ hasError ? '!' : '✓' }}
					</button>
					<Console :compact="compact" @setup="onSetupConsole" />
				</div>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
/* eslint-disable @typescript-eslint/no-use-before-define */
import 'normalize.css'
import {
	defineComponent,
	reactive,
	computed,
	watch,
	toRefs
} from '@vue/composition-api'
import Color from 'color'

import GlobalMenu from '@/components/GlobalMenu'
import Editor from '@/components/Editor'
import Viewer from '@/components/Viewer.vue'
import Console from '@/components/Console.vue'
import Inspector from '@/components/Inspector.vue'
import ViewHandles from '@/components/ViewHandles.vue'

import {printExp, readStr} from '@/mal'
import {
	MalVal,
	symbolFor as S,
	MalNode,
	M_EVAL,
	isMalNode,
	M_OUTER,
	MalNodeList,
	M_EXPANDED,
	M_OUTER_INDEX,
	MalSelection
} from '@/mal/types'

import {replaceRange, nonReactive, NonReactive} from '@/utils'
import {printer} from '@/mal/printer'
import {
	BlankException,
	findExpByRange,
	getRangeOfExp,
	getRangeOfExp2
} from '@/mal/reader'
import ViewScope from '@/scopes/view'
import ConsoleScope from '@/scopes/console'
import {replaceExp} from '@/mal/eval'

const OFFSET = 8 // length of "(sketch "

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

interface Data {
	code: string
	exp: NonReactive<MalVal> | null
	viewExp: NonReactive<MalVal> | null
	hasError: boolean
	hasParseError: boolean
	hasEvalError: boolean
	hasRenderError: boolean
	selection: [number, number]
	selectedExp: MalNode
	selectedExp2: MalSelection
	selectedExpRange: [number, number] | null
}

interface UI {
	compact: boolean
	background: string
	dark: boolean
	colors: {[k: string]: string}
	viewerSize: [number, number]
	guideColor: string
}

function parseURL(data: Data) {
	// URL
	const url = new URL(location.href)

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
				require('raw-loader!@/default-canvas.cljs').default
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
	})

	return {onSetupConsole}
}

function bindsConsole(data: Data, onUpdateSelectedExp: (val: MalVal) => any) {
	ConsoleScope.def('eval-selected', () => {
		if (data.selectedExp && isMalNode(data.selectedExp)) {
			let evaled
			if (M_EXPANDED in data.selectedExp) {
				evaled = (data.selectedExp as MalNodeList)[M_EXPANDED]
			} else if (M_EVAL in data.selectedExp) {
				evaled = data.selectedExp[M_EVAL]
			}
			if (evaled !== undefined) {
				onUpdateSelectedExp(evaled)
			}
		}
		return null
	})

	ConsoleScope.def('load-file', (url: MalVal) => {
		fetch(url as string).then(async res => {
			if (res.ok) {
				data.code = await res.text()
			} else {
				printer.error(`Failed to load from "${url}"`)
			}
		})
		return null
	})

	ConsoleScope.def('select-outer', () => {
		const {selection, selectedExp, selectedExpRange} = data

		if (selectedExpRange === null) {
			return null
		}

		if (
			selection[0] !== selectedExpRange[0] ||
			selection[1] !== selectedExpRange[1]
		) {
			data.selection = [...selectedExpRange] as [number, number]
		} else if (isMalNode(selectedExp) && selectedExp[M_OUTER]) {
			data.selectedExp = selectedExp[M_OUTER]
		}

		return null
	})

	ConsoleScope.def('insert-exp', (item: MalVal) => {
		const itemStr = printExp(item)

		const [start, end] = data.selection
		const [code, ...selection] = replaceRange(data.code, start, end, itemStr)

		data.code = code
		data.selection = selection

		return null
	})
}

export default defineComponent({
	name: 'PageIndex',
	components: {
		GlobalMenu,
		Editor,
		Viewer,
		Console,
		Inspector,
		ViewHandles
	},
	setup() {
		let expNotEvaluated = false

		const ui = reactive({
			compact: false,
			background: 'whiteSmoke',
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
		}) as UI

		const data = reactive({
			code: '',
			exp: null,
			hasError: computed(() => {
				return data.hasParseError || data.hasEvalError || data.hasRenderError
			}),
			hasParseError: false,
			hasEvalError: computed(() => data.viewExp === null),
			hasRenderError: false,
			viewExp: computed(() => {
				return evalExp()
			}),

			// Selection
			selection: [0, 0],
			selectedExp: computed({
				get: () => {
					if (!data.exp || data.hasParseError) {
						return null
					}

					evalExpIfNeeded()

					const [start, end] = data.selection
					const selected = findExpByRange(
						data.exp.value,
						start + OFFSET,
						end + OFFSET
					)
					if (Array.isArray(selected) && selected[0] === S('sketch')) {
						return null
					} else {
						return selected
					}
				},
				set: (exp: MalVal) => {
					const selection = getRangeOfExp(exp as MalNode)

					if (selection) {
						const [start, end] = selection
						data.selection = [start - OFFSET, end - OFFSET]
					} else {
						data.selection = [0, 0]
					}
				}
			}),
			selectedExp2: computed(() => {
				if (data.selectedExp) {
					if (data.selectedExp[M_OUTER]) {
						return {
							outer: data.selectedExp[M_OUTER],
							index: data.selectedExp[M_OUTER_INDEX]
						}
					} else {
						return {root: data.selectedExp}
					}
				} else {
					null
				}
			}),
			selectedExpRange: computed(() => {
				const sel = data.selectedExp2
				if (sel) {
					const ret = getRangeOfExp2(sel)
					if (ret) {
						const [start, end] = ret
						return [start - OFFSET, end - OFFSET]
					} else {
						return null
					}
				} else {
					return null
				}
			})
		}) as Data

		function evalExp() {
			const exp = data.exp

			if (!exp) {
				return null
			}

			ViewScope.setup({
				width: ui.viewerSize[0],
				height: ui.viewerSize[1],
				guideColor: ui.guideColor
			})

			expNotEvaluated = false
			const viewExp = ViewScope.eval(exp.value)
			if (viewExp !== undefined) {
				ConsoleScope.def('*view*', viewExp)
				return nonReactive(viewExp)
			} else {
				return null
			}
		}

		function evalExpIfNeeded() {
			if (expNotEvaluated) {
				evalExp()
			}
		}

		// Code <-> Exp Conversion
		watch(
			() => data.code,
			code => {
				ConsoleScope.def('*sketch*', data.code)
				const evalCode = `(sketch ${code}\nnil)`
				let exp
				try {
					exp = nonReactive(readStr(evalCode, true))
				} catch (err) {
					if (!(err instanceof BlankException)) {
						printer.error(err)
					}
					data.hasParseError = true
					return
				}
				data.hasParseError = false
				data.exp = exp
			}
		)

		watch(
			() => data.exp,
			() => {
				if (data.exp) {
					data.code = printExp(data.exp.value).slice(OFFSET, -5)
				} else {
					data.code = ''
				}
			}
		)

		const {onSetupConsole} = parseURL(data)

		// Background and theme
		function onSetBackground(bg: string) {
			try {
				Color(bg)
			} catch (err) {
				return
			}

			ui.background = bg
		}

		watch(
			() => data.code,
			code => {
				if (code.length > 0) {
					localStorage.setItem('saved_code', code)
				}
			}
		)

		function onUpdateSelectedExp(exp: MalVal) {
			if (!data.exp) {
				return
			}

			replaceExp(data.selectedExp as MalNode, exp)
			expNotEvaluated = true

			// Assign new exp
			const root = data.exp.value
			data.exp = nonReactive(root)

			if (isMalNode(exp)) {
				data.selectedExp = exp
			}
		}

		// Init App Handler
		bindsConsole(data, onUpdateSelectedExp)

		return {
			...toRefs(data as any),
			onSetupConsole,
			onUpdateSelectedExp,

			...toRefs(ui as any),
			onSetBackground
		}
	}
})
</script>

<style lang="stylus">
@import "./style/common.styl"

$compact-dur = 0.4s

html, body
	overflow hidden
	height 100vh
	--ease cubic-bezier(0.22, 0, 0.02, 1)

.PageIndex
	position relative
	overflow hidden
	width 100%
	height 100%
	height 100vh
	background var(--background)
	color var(--foreground)

	&__content, position relative
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

.compact .PageIndex__editor
	height calc(100% - 2rem - 2.2rem - 1.5rem)

.compact .PageIndex__console
	height 2.2rem
</style>
