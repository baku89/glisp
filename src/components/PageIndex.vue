<template>
	<div id="app" class="PageIndex">
		<Viewer
			class="PageIndex__viewer"
			:exp="viewExp"
			:guide-color="guideColor"
			:view-transform="viewTransform"
			@render="hasRenderError = !$event"
		/>
		<GlobalMenu class="PageIndex__global-menu" :dark="theme.dark" />
		<splitpanes class="PageIndex__content default-theme" vertical>
			<pane :size="100 - controlPaneSize">
				<div class="PageIndex__inspector" v-if="selectedExp">
					<Inspector :exp="selectedExp" @input="updateSelectedExp" @select="onSelectExp" />
				</div>
				<ViewHandles
					ref="elHandles"
					class="PageIndex__view-handles"
					:exp="selectedExp"
					:view-transform.sync="viewHandlesTransform"
					@input="updateSelectedExp"
				/>
			</pane>
			<pane :size="controlPaneSize" max-size="80">
				<div class="PageIndex__control" :class="{compact}">
					<div class="PageIndex__editor">
						<ExpEditor
							:preText="'(sketch '"
							:postText="'\nnil)'"
							:exp="exp"
							:selectedExp="selectedExp"
							:hasParseError.sync="hasParseError"
							@input="updateExp"
							@input-code="onInputCode"
							@select="onSelectExp"
						/>
					</div>
					<div class="PageIndex__console">
						<button
							class="PageIndex__console-toggle"
							:class="{error: hasError}"
							@click="compact = !compact"
						>{{ hasError ? '!' : '✓' }}</button>
						<Console :compact="compact" @setup="onSetupConsole" />
					</div>
				</div>
			</pane>
		</splitpanes>
		<modals-container />
	</div>
</template>

<script lang="ts">
/* eslint-disable @typescript-eslint/no-use-before-define */
import 'normalize.css'
import {Splitpanes, Pane} from 'splitpanes'
import 'splitpanes/dist/splitpanes.css'
import {
	defineComponent,
	reactive,
	computed,
	watch,
	toRefs,
	ref,
	Ref,
	onMounted
} from '@vue/composition-api'

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
	isNode,
	expandExp,
	getOuter,
	MalAtom
} from '@/mal/types'

import {nonReactive, NonReactive} from '@/utils'
import {printer} from '@/mal/printer'
import ViewScope from '@/scopes/view'
import ConsoleScope from '@/scopes/console'
import {replaceExp} from '@/mal/eval'
import {computeTheme, Theme, isValidColorString} from '@/theme'
import {mat2d} from 'gl-matrix'
import {useRem, useCommandDialog} from './use'

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
	theme: Theme
	guideColor: string
	viewTransform: mat2d
	viewHandlesTransform: mat2d
	controlPaneSize: number
}

function parseURL(updateExp: (exp: NonReactive<MalVal>) => void) {
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
				require('raw-loader!@/default-canvas.glisp').default
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
		updateExp(nonReactive(readStr(code, true)))
	})

	return {onSetupConsole}
}

function bindsConsole(
	data: Data,
	callbacks: {
		updateSelectedExp: (val: NonReactive<MalVal>) => any
		updateExp: (exp: NonReactive<MalVal>) => void
		selectOuterExp: () => void
	}
) {
	ConsoleScope.def('expand-selected', () => {
		if (data.selectedExp) {
			const expanded = expandExp(data.selectedExp.value)
			if (expanded !== undefined) {
				callbacks.updateSelectedExp(nonReactive(expanded))
			}
		}
		return null
	})

	ConsoleScope.def('load-file', (url: MalVal) => {
		fetch(url as string).then(async res => {
			if (res.ok) {
				const code = await res.text()
				const exp = readStr(`(sketch ${code}\nnil)`, true)
				callbacks.updateExp(nonReactive(exp))
				data.selectedExp = null
			} else {
				printer.error(`Failed to load from "${url}"`)
			}
		})
		return null
	})

	ConsoleScope.def('select-outer', () => {
		callbacks.selectOuterExp()
		return null
	})
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
		ViewHandles,
		Splitpanes,
		Pane
	},
	setup(_, context) {
		const elHandles: Ref<any | null> = ref(null)

		const rem = useRem()

		const ui = reactive({
			compact: false,
			background: 'whiteSmoke',
			theme: computed(() => {
				return computeTheme(ui.background)
			}),
			guideColor: computed(() => ui.theme.colors['--guide']),
			viewHandlesTransform: mat2d.identity(mat2d.create()),
			viewTransform: computed(() => {
				const {top} = elHandles.value?.$el.getBoundingClientRect() || {top: 0}
				const xform = mat2d.clone(ui.viewHandlesTransform)
				xform[5] += top
				return xform as mat2d
			}),
			controlPaneSize: ((30 * rem.value) / window.innerWidth) * 100
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

		// Centerize the origin of viewport on mounted
		onMounted(() => {
			if (!elHandles.value) return

			const {top, bottom} = (elHandles.value
				.$el as SVGElement).getBoundingClientRect()

			const left = 0
			const right = window.innerWidth * (1 - ui.controlPaneSize / 100)

			const xform = mat2d.fromTranslation(mat2d.create(), [
				(left + right) / 2,
				(top + bottom) / 2
			])

			ui.viewHandlesTransform = xform
		})

		function updateExp(exp: NonReactive<MalVal> | null) {
			data.exp = exp
		}

		const {onSetupConsole} = parseURL(updateExp)

		// Apply the theme
		watch(
			() => ui.theme.colors,
			colors => {
				Object.entries(colors).forEach(([name, value]) => {
					document.body.style.setProperty(name, value)
				})
			},
			{immediate: true}
		)

		// Events
		function onSelectExp(exp: NonReactive<MalNode> | null) {
			data.selectedExp = exp
		}

		function updateSelectedExp(exp: NonReactive<MalVal>) {
			if (!data.exp || !data.selectedExp) {
				return
			}

			replaceExp(data.selectedExp.value, exp.value)

			// Refresh
			updateExp(nonReactive(data.exp.value))

			if (isNode(exp.value)) {
				data.selectedExp = exp as NonReactive<MalNode>
			} else {
				data.selectedExp = null
			}
		}

		function selectOuterExp() {
			const outer = getOuter(data.selectedExp?.value)
			if (outer && outer !== data.exp?.value) {
				data.selectedExp = nonReactive(outer)
			}
		}

		// Save code
		function onInputCode(code: string) {
			localStorage.setItem('saved_code', code)
			ConsoleScope.def('*sketch*', code)
		}
		watch(
			() => data.exp,
			exp => {
				if (exp) {
					const code = printExp(exp.value)
					const sketch = code.slice(OFFSET, -5)
					localStorage.setItem('saved_code', sketch)
					ConsoleScope.def('*sketch*', sketch)
				}
			}
		)

		// Watch the mutable states
		watch(
			() => data.viewExp,
			() => {
				const bg = ConsoleScope.var('app-background') as MalAtom
				if (
					typeof bg.value === 'string' &&
					isValidColorString(bg.value) &&
					ui.background !== bg.value
				) {
					ui.background = bg.value
				}
			}
		)

		// Init App Handler
		bindsConsole(data, {
			updateSelectedExp,
			updateExp,
			selectOuterExp
		})

		useCommandDialog(context)

		return {
			elHandles,
			...toRefs(data as any),
			onSetupConsole,
			updateSelectedExp,

			...toRefs(ui as any),
			updateExp,
			onSelectExp,
			onInputCode,
			selectOuterExp
		}
	}
})
</script>

<style lang="stylus">
@import 'style/common.styl'
@import 'style/global.styl'
@import 'style/vmodal.styl'

$compact-dur = 0.4s

html, body
	overflow hidden
	height 100vh
	--ease cubic-bezier(0.22, 0, 0.02, 1)

.PageIndex
	position relative
	display flex
	flex-direction column
	overflow hidden
	width 100%
	height 100%
	height 100vh
	background var(--background)
	color var(--foreground)

	&__global-menu
		background-attachment fixed
		-webkit-app-region drag
		translucent-bg()

	&__content
		position relative
		// display flex
		// flex-grow 1
		height calc(100vh - 3.4rem)

	&__inspector
		position absolute
		bottom 1rem
		left 1rem
		z-index 1000
		width 30rem
		border 1px solid var(--border)

	&__viewer
		position absolute !important
		top 0
		left 0
		margin-right 1rem
		width 100%
		height 100%

	&__view-handles
		// width calc(100% - 30rem)
		width 100%
		height 100%

	&__control
		position relative
		display flex
		flex-direction column
		width 100%
		height 100%
		// border-left 1px solid var(--border)
		translucent-bg()

	&__editor
		padding 1rem 0.5rem 1rem 1rem
		height 70%
		border-bottom 1px solid var(--border)
		transition height $compact-dur var(--ease)

	&__console
		position relative
		flex-grow 1
		padding 0.5rem 0.5rem 1rem 1rem
		transition height $compact-dur var(--ease)

		&-toggle
			$size = 2.5rem
			position absolute
			top -2rem
			right 0.7rem
			margin-top -0.5 * $size
			width $size
			height $size
			border 1px solid var(--comment)
			border-radius 0.5 * $size
			color var(--comment)
			font-size 1.3rem
			line-height 2.2rem
			transition all $compact-dur var(--ease)
			font-monospace()
			--textcolor var(--comment)

			&.error
				border-color var(--warning)
				background var(--warning)
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

// Overwrite splitpanes
.splitpanes.default-theme
	.splitpanes__pane
		background transparent

	.splitpanes__splitter
		z-index 10
		margin-right -1rem
		width 1rem
		border-right none
		border-left-color var(--border)
		// translucent-bg()
		background transparent

		&:before, &:after
			width 0
			height 19px
			border-left 1px dotted var(--border)
			background transparent
			transition border-left-color 0.3s

		&:hover
			&:before, &:after
				border-left-color var(--highlight)
				background-color transparent
</style>
