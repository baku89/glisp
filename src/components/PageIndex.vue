<template>
	<div id="app" class="PageIndex" :style="colors">
		<GlobalMenu class="PageIndex__global-menu" :dark="dark" />
		<div class="PageIndex__content">
			<div class="PageIndex__inspector" v-if="selectedExp">
				<Inspector :exp="selectedExp" @input="onUpdateSelectedExp" />
			</div>
			<div class="PageIndex__viewer">
				<ViewHandles
					class="view-handles"
					:exp="selectedExp"
					:view-transform.sync="viewTransform"
					@input="onUpdateSelectedExp"
				/>
				<Viewer
					:exp="viewExp"
					:guide-color="guideColor"
					:view-transform="viewTransform"
					@resize="viewerSize = $event"
					@render="hasRenderError = !$event"
					@set-background="onSetBackground"
				/>
			</div>
			<div class="PageIndex__control" :class="{compact}">
				<div class="PageIndex__editor">
					<ExpEditor
						:exp="exp"
						:selectedExp="selectedExp"
						:dark="dark"
						:hasParseError.sync="hasParseError"
						@input="onUpdateExp"
						@select="onSelectExp"
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
	toRefs,
	ref
} from '@vue/composition-api'
import Color from 'color'

import GlobalMenu from '@/components/GlobalMenu'
import ExpEditor from '@/components/ExpEditor.vue'
import Viewer from '@/components/Viewer.vue'
import Console from '@/components/Console.vue'
import Inspector from '@/components/Inspector.vue'
import ViewHandles from '@/components/ViewHandles.vue'

import {printExp, readStr} from '@/mal'
import {
	MalVal,
	MalNode,
	M_EVAL,
	isMalNode,
	M_OUTER,
	MalNodeSeq,
	M_EXPANDED
} from '@/mal/types'

import {nonReactive, NonReactive} from '@/utils'
import {printer} from '@/mal/printer'
import ViewScope from '@/scopes/view'
import ConsoleScope from '@/scopes/console'
import {replaceExp} from '@/mal/eval'
import {BRIGHT_COLORS, DARK_COLORS} from '@/theme'
import {mat2d} from 'gl-matrix'

interface Data {
	exp: NonReactive<MalVal> | null
	viewExp: NonReactive<MalVal> | null
	hasError: boolean
	hasParseError: boolean
	hasEvalError: boolean
	hasRenderError: boolean
	selectedExp: NonReactive<MalNode> | null
}

interface UI {
	compact: boolean
	background: string
	dark: boolean
	colors: {[k: string]: string}
	viewerSize: [number, number]
	guideColor: string
}

function parseURL(onUpdateExp: (exp: NonReactive<MalVal>) => void) {
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
		const code = `(sketch ${ret[0]}\nnil)`
		onUpdateExp(nonReactive(readStr(code, true)))
	})

	return {onSetupConsole}
}

function bindsConsole(
	data: Data,
	onUpdateSelectedExp: (val: NonReactive<MalVal>) => any,
	onUpdateExp: (exp: NonReactive<MalVal>) => void
) {
	ConsoleScope.def('eval-selected', () => {
		if (data.selectedExp) {
			let evaled
			if (M_EXPANDED in data.selectedExp.value) {
				evaled = (data.selectedExp.value as MalNodeSeq)[M_EXPANDED]
			} else if (M_EVAL in data.selectedExp.value) {
				evaled = data.selectedExp.value[M_EVAL]
			}
			if (evaled !== undefined) {
				onUpdateSelectedExp(nonReactive(evaled))
			}
		}
		return null
	})

	ConsoleScope.def('load-file', (url: MalVal) => {
		fetch(url as string).then(async res => {
			if (res.ok) {
				const code = await res.text()
				const exp = readStr(`(sketch ${code}\nnil)`, true)
				onUpdateExp(nonReactive(exp))
				data.selectedExp = null
			} else {
				printer.error(`Failed to load from "${url}"`)
			}
		})
		return null
	})

	ConsoleScope.def('select-outer', () => {
		if (data.selectedExp && data.selectedExp.value[M_OUTER]) {
			data.selectedExp = nonReactive(data.selectedExp.value[M_OUTER])
		}

		return null
	})

	// ConsoleScope.def('insert-exp', (item: MalVal) => {
	// 	const itemStr = printExp(item)

	// 	const [start, end] = data.selection
	// 	const [code, ...selection] = replaceRange(data.code, start, end, itemStr)

	// 	data.code = code
	// 	data.selection = selection

	// 	return null
	// })
}

const OFFSET = 8 // length of "(sketch "

export default defineComponent({
	name: 'PageIndex',
	components: {
		GlobalMenu,
		ExpEditor,
		Viewer,
		Console,
		Inspector,
		ViewHandles
	},
	setup() {
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
			guideColor: computed(() => ui.colors['--selection']),
			viewTransform: mat2d.identity(mat2d.create())
		}) as UI

		const data = reactive({
			exp: null,
			hasError: computed(() => {
				return data.hasParseError || data.hasEvalError || data.hasRenderError
			}),
			hasParseError: false,
			hasEvalError: computed(() => data.viewExp === null),
			hasRenderError: false,
			viewExp: computed(() => {
				let viewExp: NonReactive<MalVal> | null = null

				if (data.exp) {
					ViewScope.setup({
						width: ui.viewerSize[0],
						height: ui.viewerSize[1],
						guideColor: ui.guideColor
					})

					const ret = ViewScope.eval(data.exp.value)

					if (ret !== undefined) {
						ConsoleScope.def('*view*', ret)
						viewExp = nonReactive(ret)
					}
				}

				return viewExp
			}),
			// Selection
			selectedExp: null
		}) as Data

		function onUpdateExp(exp: NonReactive<MalVal> | null) {
			data.exp = exp
		}

		const {onSetupConsole} = parseURL(onUpdateExp)

		// Background and theme
		function onSetBackground(bg: string) {
			try {
				Color(bg)
			} catch (err) {
				return
			}

			ui.background = bg
		}

		// Save code
		watch(
			() => data.exp,
			exp => {
				if (exp) {
					const code = printExp(exp.value)
					localStorage.setItem('saved_code', code.slice(OFFSET, -5))
				}
			}
		)

		function onSelectExp(exp: NonReactive<MalNode>) {
			data.selectedExp = exp
		}

		function onUpdateSelectedExp(exp: NonReactive<MalVal>) {
			if (!data.exp || !data.selectedExp) {
				return
			}

			replaceExp(data.selectedExp.value, exp.value)

			// Refresh
			onUpdateExp(nonReactive(data.exp.value))

			if (isMalNode(exp.value)) {
				data.selectedExp = exp as NonReactive<MalNode>
			}
		}

		// Init App Handler
		bindsConsole(data, onUpdateSelectedExp, onUpdateExp)

		return {
			...toRefs(data as any),
			onSetupConsole,
			onUpdateSelectedExp,

			...toRefs(ui as any),
			onSetBackground,
			onUpdateExp,
			onSelectExp
		}
	}
})
</script>

<style lang="stylus">
@import './style/common.styl'

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

	&__global-menu
	background-attachment fixed
		-webkit-app-region drag

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

.compact .PageIndex__editor
	height calc(100% - 2rem - 2.2rem - 1.5rem)

.compact .PageIndex__console
	height 2.2rem
</style>
