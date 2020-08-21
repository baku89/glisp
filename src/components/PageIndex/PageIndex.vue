<template>
	<div id="app" class="PageIndex">
		<PortalTarget
			class="PageIndex__view-handles-axes"
			name="view-handles-axes"
			:style="{
				left: `${paneSizeInPercent.layers}%`,
				right: `${paneSizeInPercent.control}%`,
			}"
		/>
		<ViewCanvas
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
			<Pane class="left" :size="paneSizeInPercent.layers" :max-size="30">
				<PaneLayers
					class="PageIndex__list-view"
					:exp="exp"
					:editingExp="editingExp"
					:selectedExp="selectedExp"
					:hoveringExp="hoveringExp"
					@select="setSelectedExp"
					@update:exp="updateExp"
					@update:editingExp="setEditingExp"
				/>
			</Pane>
			<Pane :size="100 - paneSizeInPercent.layers - paneSizeInPercent.control">
				<div class="PageIndex__inspector" v-if="activeExp">
					<Inspector
						:exp="activeExp"
						@input="updateSelectedExp"
						@select="setActiveExp"
						@end-tweak="tagExpHistory('undo')"
					/>
				</div>
				<ViewHandles
					ref="elHandles"
					class="PageIndex__view-handles"
					:activeExp="activeExp"
					:selectedExp="selectedExp"
					:viewTransform.sync="viewHandlesTransform"
					@tag-history="tagExpHistory('undo')"
				/>
			</Pane>
			<Pane :size="paneSizeInPercent.control" :max-size="40">
				<div class="PageIndex__control" :class="{compact}">
					<div class="PageIndex__editor">
						<MalExpEditor
							v-if="editingExp"
							:exp="editingExp"
							:selectedExp="activeExp"
							:hasParseError.sync="hasParseError"
							:editMode="editingPath === '/' ? 'params' : 'node'"
							@input="updateEditingExp"
							@select="setActiveExp"
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
	</div>
</template>

<script lang="ts">
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
import MalExpEditor from '@/components/mal-inputs/MalExpEditor.vue'
import ViewCanvas from '@/components/ViewCanvas.vue'
import Console from '@/components/Console.vue'
import Inspector from '@/components/Inspector.vue'
import ViewHandles from '@/components/ViewHandles'
import PaneLayers from '@/components/PaneLayers.vue'

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
import {
	useRem,
	useDialogCommand,
	useHitDetector,
	useDialogSettings,
} from '@/components/use'
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
import useCompactScrollbar from './use-compact-scrollbar'
import useExpHistory from './use-exp-history'
import {reconstructTree} from '@/mal/reader'

interface Data {
	exp: NonReactive<MalNode>
	viewExp: NonReactive<MalVal> | null
	hasError: boolean
	hasParseError: boolean
	hasEvalError: boolean
	hasRenderError: boolean
	selectedExp: NonReactive<MalNode>[]
	activeExp: NonReactive<MalNode> | null
	editingExp: NonReactive<MalNode> | null
	hoveringExp: NonReactive<MalNode> | null
	selectedPath: string[]
	editingPath: string
}

interface UI {
	compact: boolean
	background: string
	theme: Theme
	guideColor: string
	viewTransform: mat2d
	viewHandlesTransform: mat2d
}

const OFFSET_START = 11 // length of "(sketch;__\n"
const OFFSET_END = 5 // length of ";__\n)"

export default defineComponent({
	name: 'PageIndex',
	components: {
		GlobalMenu,
		MalExpEditor,
		ViewCanvas,
		Console,
		Inspector,
		ViewHandles,
		Splitpanes,
		PaneLayers,
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
				const left = paneSizeInPixel.layers
				const xform = mat2d.clone(ui.viewHandlesTransform)
				xform[4] += left
				xform[5] += top
				return xform as mat2d
			}),
		}) as UI

		const data = reactive({
			exp: nonReactive(L(S('sketch'))),
			hasError: computed(
				() => data.hasParseError || data.hasEvalError || data.hasRenderError
			),
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
				data.selectedPath.map(path =>
					nonReactive(getExpByPath(data.exp.value, path))
				)
			),
			activeExp: computed(() =>
				data.selectedExp.length === 0 ? null : data.selectedExp[0]
			),
			editingExp: computed(() =>
				data.editingPath
					? nonReactive(getExpByPath(data.exp.value, data.editingPath))
					: null
			),
			hoveringExp: null,

			// Paths
			selectedPath: [],
			editingPath: '',
		}) as Data

		// Centerize the origin of viewport on mounted
		onMounted(() => {
			if (!elHandles.value) return

			const {top, bottom} = (elHandles.value
				.$el as SVGElement).getBoundingClientRect()

			const left = 0
			const right = window.innerWidth - paneSizeInPixel.control

			const xform = mat2d.fromTranslation(mat2d.create(), [
				(left + right) / 2,
				(top + bottom) / 2,
			])

			ui.viewHandlesTransform = xform
		})

		const {pushExpHistory, tagExpHistory} = useExpHistory(
			toRef(data, 'exp'),
			updateExp
		)

		const {onSetupConsole} = useURLParser((exp: NonReactive<MalNode>) => {
			updateExp(exp, false)
			pushExpHistory(exp, 'undo')
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
		function updateExp(exp: NonReactive<MalNode>, pushHistory = true) {
			unwatchExpOnReplace(data.exp.value, onReplaced)
			if (pushHistory) {
				pushExpHistory(exp)
			}
			// NOTE: might be redundant
			reconstructTree(exp.value)
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
		function setSelectedExp(exp: NonReactive<MalNode>[]) {
			data.selectedPath = exp.map(e => generateExpAbsPath(e.value))
		}
		function toggleSelectedExp(exp: NonReactive<MalNode>) {
			const selectedExp = [...data.selectedExp]
			const index = selectedExp.findIndex(e => e.value === exp.value)
			if (index >= 0) {
				selectedExp.splice(index, 1)
			} else {
				selectedExp.push(exp)
			}
			setSelectedExp(selectedExp)
		}

		function setActiveExp(exp: NonReactive<MalNode> | null) {
			if (exp) {
				const path = generateExpAbsPath(exp.value)
				data.selectedPath = path !== '/' ? [path] : []
			} else {
				data.selectedPath = []
			}
		}

		function updateSelectedExp(exp: NonReactive<MalVal>) {
			if (data.selectedExp.length === 0) {
				return
			}
			replaceExp(data.selectedExp[0].value, exp.value)
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
			pushExpHistory(data.exp, 'undo')
		}

		// Hovering
		function setHoveringExp(exp: NonReactive<MalNode> | null) {
			data.hoveringExp = exp
		}

		// Splitpanes
		const paneSizeInPixel = reactive({
			layers: 15 * rem.value,
			control: 30 * rem.value,
		})

		const paneSizeInPercent = reactive({
			layers: computed(
				() => (paneSizeInPixel.layers / windowWidth.value) * 100
			),
			control: computed(
				() => (paneSizeInPixel.control / windowWidth.value) * 100
			),
		})

		function onResizeSplitpanes(
			sizes: {min: number; max: number; size: number}[]
		) {
			const [layers, , control] = sizes.map(s => s.size)

			paneSizeInPixel.layers = windowWidth.value * (layers / 100)
			paneSizeInPixel.control = windowWidth.value * (control / 100)
		}

		// Save code
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
			setActiveExp,
			toggleSelectedExp,
			setHoveringExp,
			onTransformSelectedExp,
			() => tagExpHistory('undo')
		)

		// Setup scopes
		useAppCommands(data, {
			updateExp,
			setActiveExp,
			setSelectedExp,
		})
		useDialogCommand(context)
		useDialogSettings(context)

		// Scrollbar
		useCompactScrollbar()

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
			setActiveExp,
			onResizeSplitpanes,
			tagExpHistory,

			paneSizeInPercent,
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
		width 100%
		height 100%
		translucent-bg()
		overflow-y scroll

	&__view-handles-axes
		position absolute !important
		top 3.4rem
		height calc(100vh - 3.4rem)

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
			border-radius 50%
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
