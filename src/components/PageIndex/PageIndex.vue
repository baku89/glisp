<template>
	<div id="app" class="PageIndex">
		<Viewer
			class="PageIndex__viewer"
			:exp="viewExp"
			:guideColor="guideColor"
			:viewTransform="viewTransform"
			@render="hasRenderError = !$event"
		/>
		<GlobalMenu class="PageIndex__global-menu" :dark="theme.dark" />
		<Splitpanes
			class="PageIndex__content default-theme"
			vertical
			@resize="onResizeSplitpanes"
		>
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
					@update:editingExp="setEditingExp"
				/>
			</Pane>
			<Pane :size="100 - controlPaneSize - listViewPaneSize">
				<div class="PageIndex__inspector" v-if="selectedExp">
					<Inspector
						:exp="selectedExp"
						@input="updateSelectedExp"
						@select="setSelectedExp"
						@end-tweak="tagLastHistory"
					/>
				</div>
				<ViewHandles
					ref="elHandles"
					class="PageIndex__view-handles"
					:exp="selectedExp"
					:viewTransform.sync="viewHandlesTransform"
					@input="updateSelectedExp"
					@tag-history="tagLastHistory"
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
							@select="setSelectedExp"
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
			</Pane>
		</Splitpanes>
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
	toRef,
} from '@vue/composition-api'
import {useOnResize} from 'vue-composable'

import GlobalMenu from '@/components/GlobalMenu'
import ExpEditor from '@/components/ExpEditor.vue'
import Viewer from '@/components/Viewer.vue'
import Console from '@/components/Console.vue'
import Inspector from '@/components/Inspector.vue'
import ViewHandles from '@/components/ViewHandles.vue'
import ListView from '@/components/ListView.vue'

import {printExp} from '@/mal'
import {
	MalVal,
	MalNode,
	isNode,
	MalAtom,
	createList as L,
	symbolFor as S,
} from '@/mal/types'

import {nonReactive, NonReactive} from '@/utils'
import ViewScope from '@/scopes/view'
import ConsoleScope from '@/scopes/console'
import {computeTheme, Theme, isValidColorString} from '@/theme'
import {mat2d} from 'gl-matrix'
import {useRem, useCommandDialog, useHitDetector} from '@/components/use'
import AppScope from '@/scopes/app'
import {
	replaceExp,
	watchExpOnReplace,
	unwatchExpOnReplace,
	generateExpAbsPath,
	getExpByPath,
} from '@/mal/utils'

import useAppCommands from './use-app-commands'
import useURLParser from './use-url-parser'
import {reconstructTree} from '@/mal/reader'

type ExpHistory = [NonReactive<MalNode>, string | undefined]

interface Data {
	exp: NonReactive<MalNode>
	expHistory: ExpHistory[]
	viewExp: NonReactive<MalVal> | null
	hasError: boolean
	hasParseError: boolean
	hasEvalError: boolean
	hasRenderError: boolean
	selectedExp: NonReactive<MalNode> | null
	editingExp: NonReactive<MalNode> | null
	hoveringExp: NonReactive<MalNode> | null
	selectedPath: string
	editingPath: string
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
		Pane,
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
					top: 0,
				}
				const left = (ui.listViewPaneSize / 100) * windowWidth.value
				const xform = mat2d.clone(ui.viewHandlesTransform)
				xform[4] += left
				xform[5] += top
				return xform as mat2d
			}),
			controlPaneSize: ((30 * rem.value) / window.innerWidth) * 100,
			listViewPaneSize: ((15 * rem.value) / window.innerWidth) * 100,
		}) as UI

		const data = reactive({
			exp: nonReactive(L(S('sketch'))),
			expHistory: [],
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
						guideColor: ui.guideColor,
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
			selectedExp: computed(() =>
				data.selectedPath
					? nonReactive(getExpByPath(data.exp.value, data.selectedPath))
					: null
			),
			editingExp: computed(() =>
				data.editingPath
					? nonReactive(getExpByPath(data.exp.value, data.editingPath))
					: null
			),
			hoveringExp: null,

			// Paths
			selectedPath: '',
			editingPath: '',
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
				(top + bottom) / 2,
			])

			ui.viewHandlesTransform = xform
		})

		const {onSetupConsole} = useURLParser((exp: NonReactive<MalNode>) => {
			updateExp(exp, false)
			data.expHistory = [[exp, 'undo']]
			setEditingExp(exp)
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

		// Exp
		function updateExp(exp: NonReactive<MalNode>, addHistory = true) {
			unwatchExpOnReplace(data.exp.value, onReplaced)
			if (addHistory) {
				data.expHistory.push([exp, undefined])
			}
			data.exp = exp
			watchExpOnReplace(exp.value, onReplaced)

			function onReplaced(newExp: MalVal) {
				if (!isNode(newExp)) {
					throw new Error('data.exp cannot be non-node value')
				}
				updateExp(nonReactive(newExp))
			}
		}

		// SelectedExp
		function setSelectedExp(exp: NonReactive<MalNode> | null) {
			if (exp) {
				data.selectedPath = generateExpAbsPath(exp.value)
			} else {
				data.selectedPath = ''
			}
		}

		function updateSelectedExp(exp: NonReactive<MalVal>) {
			if (!data.selectedExp) {
				return
			}
			replaceExp(data.selectedExp.value, exp.value)
		}

		// Editing
		function setEditingExp(exp: NonReactive<MalNode>) {
			if (exp) {
				data.editingPath = generateExpAbsPath(exp.value)
			} else {
				data.editingPath = ''
			}
		}

		function updateEditingExp(exp: NonReactive<MalVal>) {
			if (!data.editingExp) return
			replaceExp(data.editingExp.value, exp.value)
		}

		// Hovering
		function setHoveringExp(exp: NonReactive<MalNode> | null) {
			data.hoveringExp = exp
		}

		// Others
		function onResizeSplitpanes(
			sizes: {min: number; max: number; size: number}[]
		) {
			ui.listViewPaneSize = sizes[0].size
			ui.controlPaneSize = sizes[2].size
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
			ConsoleScope.eval(L(S('transform-selected'), xform as MalVal[]))
		}

		// HitDetector
		useHitDetector(
			elHandles,
			toRef(data, 'exp'),
			toRef(ui, 'viewTransform'),
			setSelectedExp,
			setHoveringExp,
			onTransformSelectedExp,
			tagLastHistory
		)

		// History
		function undoExp(tag?: string) {
			let index = -1
			if (tag) {
				for (let i = data.expHistory.length - 2; i >= 0; i--) {
					if (data.expHistory[i][1] === tag) {
						index = i
						break
					}
				}
			} else {
				if (data.expHistory.length > 2) {
					index = data.expHistory.length - 2
				}
			}

			if (index === -1) {
				return false
			}

			const [prev] = data.expHistory[index]
			data.expHistory.length = index + 1
			reconstructTree(prev.value)
			updateExp(prev, false)

			return true
		}

		AppScope.def('undo', (arg: MalVal) => {
			if (arg === null) {
				return undoExp()
			} else {
				const tag = typeof arg === 'string' ? arg : 'undo'
				return undoExp(tag)
			}
		})

		function tagLastHistory(tag = 'undo') {
			console.log('undo', tag)
			if (data.expHistory.length > 0) {
				data.expHistory[data.expHistory.length - 1][1] = tag
			}
		}

		// Setup scopes
		useAppCommands(data, {
			updateExp,
			setSelectedExp,
			updateSelectedExp,
		})
		useCommandDialog(context)

		// After setup, execute the app configuration code
		AppScope.readEval(`(do
			(register-keybind "mod+e" '(expand-selected))
			(register-keybind "mod+p" '(select-outer))
			(register-keybind "mod+g" '(group-selected))
			(register-keybind "up" '(transform-selected (translate [0 -1])))
			(register-keybind "down" '(transform-selected (translate [0 1])))
			(register-keybind "right" '(transform-selected (translate [1 0])))
			(register-keybind "left" '(transform-selected (translate [-1 0])))
			(register-keybind "mod+z" '(undo))
			(register-keybind "mod+alt+z" '(undo nil))
			(register-keybind "mod+s" '(download-sketch))
			)
		)`)

		return {
			elHandles,
			...toRefs(data as any),
			onSetupConsole,
			updateSelectedExp,
			updateEditingExp,
			setEditingExp,
			...toRefs(ui as any),
			updateExp,
			setSelectedExp,
			onResizeSplitpanes,
			tagLastHistory,
		}
	},
})
</script>

<style lang="stylus">
@import '../style/common.styl'
@import '../style/global.styl'
@import '../style/vmodal.styl'

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
