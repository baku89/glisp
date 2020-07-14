<template>
	<div id="app" class="PageIndex">
		<Viewer
			class="PageIndex__viewer"
			:exp="viewExp"
			:selectedExp="selectedExp"
			:guide-color="guideColor"
			:view-transform="viewTransform"
			@render="hasRenderError = !$event"
		/>
		<GlobalMenu class="PageIndex__global-menu" :dark="theme.dark" />
		<Splitpanes class="PageIndex__content default-theme" vertical @resize="onResizeSplitpanes">
			<Pane class="left" :size="listViewPaneSize" :max-size="30">
				<ListView
					class="PageIndex__list-view"
					:exp="exp"
					mode="params"
					:editingExp="editingExp"
					:selectedExp="selectedExp"
					:hoveringExp="hoveringExp"
					@select="setSelectedExp"
					@update:exp="updateExp"
					@update:editingExp="switchEditingExp"
				/>
			</Pane>
			<Pane :size="100 - controlPaneSize - listViewPaneSize">
				<div class="PageIndex__inspector" v-if="selectedExp">
					<Inspector :exp="selectedExp" @input="updateSelectedExp" @select="setSelectedExp" />
				</div>
				<ViewHandles
					ref="elHandles"
					class="PageIndex__view-handles"
					:exp="selectedExp"
					:view-transform.sync="viewHandlesTransform"
					@input="updateSelectedExp"
				/>
			</Pane>
			<Pane :size="controlPaneSize" :max-size="40">
				<div class="PageIndex__control" :class="{compact}">
					<div class="PageIndex__editor">
						<ExpEditor
							v-if="editingExp"
							:exp="editingExp"
							:selectedExp="selectedExp"
							:hasParseError.sync="hasParseError"
							:editMode="editingExp.value === exp.value ? 'params' : 'node'"
							@input="updateEditingExp"
							@inputCode="onInputCode"
							@select="setSelectedExp"
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
			</Pane>
		</Splitpanes>
		<ModalsContainer />
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
	onMounted,
	toRef
} from '@vue/composition-api'
import {useOnResize} from 'vue-composable'

import GlobalMenu from '@/components/GlobalMenu'
import ExpEditor from '@/components/ExpEditor.vue'
import Viewer from '@/components/Viewer.vue'
import Console from '@/components/Console.vue'
import Inspector from '@/components/Inspector.vue'
import ViewHandles from '@/components/ViewHandles.vue'
import ListView from '@/components/ListView.vue'

import {printExp, readStr} from '@/mal'
import {
	MalVal,
	MalNode,
	isNode,
	expandExp,
	getOuter,
	MalAtom,
	createList,
	symbolFor,
	cloneExp,
	getName,
	isFunc,
	getMeta,
	MalType,
	MalError,
	isList,
	isSeq,
	MalSeq,
	M_FN,
	isVector,
	keywordFor as K,
	M_EVAL_PARAMS,
	getEvaluated
} from '@/mal/types'

import {nonReactive, NonReactive} from '@/utils'
import {printer} from '@/mal/printer'
import ViewScope from '@/scopes/view'
import ConsoleScope from '@/scopes/console'
import {computeTheme, Theme, isValidColorString} from '@/theme'
import {mat2d} from 'gl-matrix'
import {useRem, useCommandDialog, useHitDetector} from './use'
import AppScope from '../scopes/app'
import {
	getMapValue,
	replaceExp,
	applyParamModifier,
	getFnInfo
} from '@/mal/utils'

interface Data {
	exp: NonReactive<MalVal>
	viewExp: NonReactive<MalVal> | null
	hasError: boolean
	hasParseError: boolean
	hasEvalError: boolean
	hasRenderError: boolean
	selectedExp: NonReactive<MalNode> | null
	editingExp: NonReactive<MalNode> | null
	hoveringExp: NonReactive<MalNode> | null
}

interface UI {
	compact: boolean
	background: string
	theme: Theme
	guideColor: string
	viewTransform: mat2d
	viewHandlesTransform: mat2d
	controlPaneSize: number
	listViewPaneSize: number
}

function toSketchCode(code: string) {
	return `(sketch;__\n${code};__\n)`
}

function parseURL(onLoadExp: (exp: NonReactive<MalVal>) => void) {
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

	Promise.all([loadCodePromise, setupConsolePromise]).then(([code]) => {
		onLoadExp(nonReactive(readStr(toSketchCode(code as string))))
	})

	return {onSetupConsole}
}

function useBindConsole(
	data: Data,
	callbacks: {
		updateExp: (exp: NonReactive<MalVal>) => void
		setSelectedExp: (exp: NonReactive<MalNode> | null) => any
		updateSelectedExp: (val: NonReactive<MalVal>) => any
	}
) {
	AppScope.def('expand-selected', () => {
		if (data.selectedExp) {
			const expanded = expandExp(data.selectedExp.value)
			if (expanded !== undefined) {
				callbacks.updateSelectedExp(nonReactive(expanded))
			}
		}
		return null
	})

	AppScope.def('group-selected', () => {
		if (!data.selectedExp) {
			return null
		}

		const exp = data.selectedExp.value
		const newExp = createList(symbolFor('g'), {}, exp)
		callbacks.updateSelectedExp(nonReactive(newExp))

		return null
	})

	AppScope.def('insert-item', (name: MalVal) => {
		const fnName = getName(name)
		const fn = ViewScope.var(fnName)
		const meta = getMeta(fn)
		const returnType =
			(getMapValue(meta, 'return/type', MalType.String) as string) || ''
		const initialParams =
			(getMapValue(meta, 'initial-params', MalType.Vector) as MalSeq) || null

		if (!isFunc(fn) || !['item', 'path'].includes(returnType)) {
			throw new MalError(`${fnName} is not a function that returns item/path`)
		}

		if (!initialParams) {
			throw new MalError(
				`Function ${fnName} does not have the :initial-params field`
			)
		}

		if (data.selectedExp && isSeq(data.selectedExp.value)) {
			const newExp = cloneExp(data.selectedExp.value)
			newExp.push(createList(symbolFor(fnName), ...initialParams))

			callbacks.updateSelectedExp(nonReactive(newExp))
		}

		return null
	})

	ConsoleScope.def('load-file', (url: MalVal) => {
		fetch(url as string).then(async res => {
			if (res.ok) {
				const code = await res.text()
				const exp = readStr(toSketchCode(code)) as MalNode
				const nonReactiveExp = nonReactive(exp)
				callbacks.updateExp(nonReactiveExp)
				callbacks.setSelectedExp(null)
				data.editingExp = nonReactiveExp
			} else {
				printer.error(`Failed to load from "${url}"`)
			}
		})
		return null
	})

	AppScope.def('select-outer', () => {
		const outer = getOuter(data.selectedExp?.value)
		if (outer && outer !== data.exp?.value) {
			callbacks.setSelectedExp(nonReactive(outer))
		}
		return null
	})
}

const OFFSET_START = 11 // length of "(sketch;__\n"
const OFFSET_END = 5 // length of ";__\n)"

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
		ListView,
		Pane
	},
	setup(_, context) {
		const elHandles: Ref<any | null> = ref(null)

		const rem = useRem()

		const {width: windowWidth} = useOnResize(document.body)

		const ui = reactive({
			compact: true,
			background: 'whiteSmoke',
			theme: computed(() => {
				return computeTheme(ui.background)
			}),
			guideColor: computed(() => ui.theme.colors['--guide']),
			viewHandlesTransform: mat2d.identity(mat2d.create()),
			viewTransform: computed(() => {
				const {top} = elHandles.value?.$el.getBoundingClientRect() || {
					top: 0
				}
				const left = (ui.listViewPaneSize / 100) * windowWidth.value
				const xform = mat2d.clone(ui.viewHandlesTransform)
				xform[4] += left
				xform[5] += top
				return xform as mat2d
			}),
			controlPaneSize: ((30 * rem.value) / window.innerWidth) * 100,
			listViewPaneSize: ((15 * rem.value) / window.innerWidth) * 100
		}) as UI

		const data = reactive({
			exp: nonReactive(createList(symbolFor('sketch'))),
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
			selectedExp: null,
			editingExp: null,
			hoveringExp: null
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

		function updateExp(exp: NonReactive<MalVal>) {
			if (data.exp.value === data.editingExp?.value) {
				data.editingExp = exp as NonReactive<MalNode>
			}
			data.exp = exp
		}

		const {onSetupConsole} = parseURL((exp: NonReactive<MalVal>) => {
			updateExp(exp)
			data.editingExp = exp as NonReactive<MalNode>
		})

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
		function setSelectedExp(exp: NonReactive<MalNode> | null) {
			data.selectedExp = exp
		}

		function hoverExp(exp: NonReactive<MalNode> | null) {
			data.hoveringExp = exp
		}

		function updateSelectedExp(exp: NonReactive<MalVal>) {
			if (!data.exp || !data.selectedExp) {
				return
			}

			const isExpNode = isNode(exp.value)

			replaceExp(data.selectedExp.value, exp.value)

			// Refresh
			updateExp(nonReactive(data.exp.value))

			// Update the editing exp if necessary
			if (
				data.editingExp &&
				data.editingExp.value === data.selectedExp.value &&
				isExpNode
			) {
				data.editingExp = exp as NonReactive<MalNode>
			}

			if (isExpNode) {
				data.selectedExp = exp as NonReactive<MalNode>
			} else {
				data.selectedExp = null
			}
		}

		function updateEditingExp(exp: NonReactive<MalVal>) {
			if (!data.exp || !data.editingExp) {
				return
			}

			if (data.editingExp.value === data.exp.value) {
				updateExp(exp)
			} else {
				replaceExp(data.editingExp.value, exp.value)
				updateExp(nonReactive(data.exp.value))
			}

			if (isNode(exp.value)) {
				data.editingExp = exp as NonReactive<MalNode>
			} else {
				data.editingExp = null
			}
		}

		// Save code
		function onInputCode(code: string) {
			// localStorage.setItem('saved_code', code)
			// ConsoleScope.def('*sketch*', code)
		}

		function onResizeSplitpanes(
			sizes: {min: number; max: number; size: number}[]
		) {
			ui.listViewPaneSize = sizes[0].size
			ui.controlPaneSize = sizes[2].size
		}

		function switchEditingExp(exp: NonReactive<MalNode>) {
			data.editingExp = exp
		}

		watch(
			() => data.exp,
			exp => {
				if (exp) {
					const code = printExp(exp.value)
					const sketch = code.slice(OFFSET_START, -OFFSET_END)
					localStorage.setItem('saved_code', sketch)
					ConsoleScope.def('*sketch*', sketch)
				}
			}
		)

		// Watch the mutable states
		watch(
			() => data.viewExp,
			() => {
				const bg = ConsoleScope.var('*app-background*') as MalAtom
				if (
					typeof bg.value === 'string' &&
					isValidColorString(bg.value) &&
					ui.background !== bg.value
				) {
					ui.background = bg.value
				}
			}
		)

		// transform selectedExp
		function onTransformSelectedExp(xform: mat2d) {
			if (!data.selectedExp) return

			const selected = data.selectedExp.value

			if (!isSeq(selected)) {
				return
			}

			const fnInfo = getFnInfo(selected)

			if (!fnInfo) {
				return
			}

			const {meta, primitive} = fnInfo
			const transformFn = getMapValue(meta, 'transform')

			if (!isFunc(transformFn)) {
				return
			}

			const originalParams = primitive
				? [getEvaluated(selected)]
				: selected[M_EVAL_PARAMS]
			const payload = {
				[K('params')]: originalParams,
				[K('transform')]: xform as MalVal
			}

			const modifier = transformFn(payload)
			let newParams: MalVal[] | null

			if (primitive) {
				newParams = modifier as MalSeq
			} else {
				newParams = applyParamModifier(modifier, originalParams)
				if (!newParams) {
					return
				}
			}

			const newExp = primitive
				? newParams[0]
				: createList(selected[0], ...newParams)

			updateSelectedExp(nonReactive(newExp))
		}

		// HitDetector
		useHitDetector(
			elHandles,
			toRef(data, 'exp'),
			toRef(ui, 'viewTransform'),
			setSelectedExp,
			hoverExp,
			onTransformSelectedExp
		)

		// Setup scopes
		useBindConsole(data, {
			updateExp,
			setSelectedExp,
			updateSelectedExp
		})
		useCommandDialog(context)

		// After setup, execute the app configuration code
		AppScope.readEval(`(do
			(register-keybind "ctrl+e" '(expand-selected))
			(register-keybind "ctrl+p" '(select-outer))
			(register-keybind "ctrl+g" '(group-selected))
		)`)

		return {
			elHandles,
			...toRefs(data as any),
			onSetupConsole,
			updateSelectedExp,
			updateEditingExp,
			switchEditingExp,

			...toRefs(ui as any),
			updateExp,
			setSelectedExp,
			onInputCode,
			onResizeSplitpanes
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
		z-index 100
		background-attachment fixed
		-webkit-app-region drag
		translucent-bg()

	&__content
		position relative
		// display flex
		// flex-grow 1
		height calc(100vh - 3.4rem)

	&__list-view
		position relative
		padding-top 1rem
		width 100%
		height 100%
		translucent-bg()
		overflow-y scroll

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

	&__inspector
		position absolute
		bottom 1rem
		left 1rem
		z-index 1000
		width 30rem
		border 1px solid var(--border)
		translucent-bg()

	&__control
		position relative
		display flex
		flex-direction column
		width 100%
		height 100%
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
	height calc(100% - 0.4rem - 2rem - 1.5rem)

.compact .PageIndex__console
	height 0.4rem

// Overwrite splitpanes
.splitpanes.default-theme
	.splitpanes__pane
		position relative
		background transparent

	.splitpanes__splitter
		z-index 10
		margin-right -1rem
		width 1rem
		border-left-color var(--border)
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

.splitpanes.default-theme
	.left + .splitpanes__splitter
		margin-right 0
		margin-left -1rem
		border-right 1px solid var(--border)
		border-left none
</style>
