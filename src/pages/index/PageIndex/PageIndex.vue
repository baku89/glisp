<template>
	<div id="app" class="PageIndex">
		<ViewCanvas
			class="PageIndex__viewer"
			:exp="viewExp"
			:guide-color="guideColor"
			:view-transform="viewTransform"
			@render="hasRenderError = !$event"
		/>
		<GlobalMenu class="PageIndex__global-menu" :dark="theme.dark" />
		<GlobalPanes class="PageIndex__content">
			<template #left>
				<PaneLayers
					class="PageIndex__list-view"
					:exp="exp"
					b
					:editing-exp="editingExp"
					:selected-exp="selectedExp"
					:hovering-exp="hoveringExp"
					@select="setSelectedExp"
					@update:exp="updateExp"
					@update:editing-exp="setEditingExp"
				/>
			</template>
			<template #main>
				<div class="PageIndex__inspector" v-if="activeExp">
					<Inspector
						:exp="activeExp"
						@input="updateSelectedExp"
						@select="setActiveExp"
						@end-tweak="tagExpHistory('undo')"
					/>
				</div>
				<ViewHandles
					class="PageIndex__view-handles"
					:selected-exp="selectedExp"
					v-model:view-transform="viewTransform"
					@tag-history="tagExpHistory('undo')"
					@setup="handleEl = $event"
				/>
				<div class="PageIndex__modes">
					<button
						class="PageIndex__modes-button"
						v-for="({name, handlers}, i) in modes"
						:key="name"
						:class="{active: i === activeModeIndex}"
						@click="activeModeIndex = i"
					>
						<span class="icon" v-if="handlers.icon.type === 'character'">{{
							handlers.icon.value
						}}</span>
						<i
							class="icon"
							v-else-if="handlers.icon.type === 'fontawesome'"
							:class="handlers.icon.value"
						/>

						<span class="label">{{ handlers.label }}</span>
					</button>
				</div>
			</template>
			<template #right>
				<div class="PageIndex__control" :class="{compact}">
					<div class="PageIndex__editor">
						<MalExpEditor
							v-if="editingExp"
							:exp="editingExp"
							:selected-exp="activeExp"
							v-model:has-parse-error="hasParseError"
							:edit-mode="editingPath === '/' ? 'params' : 'node'"
							@input="updateEditingExp"
							@select="setActiveExp"
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
			</template>
		</GlobalPanes>
	</div>
</template>

<script lang="ts">
import 'normalize.css'

import {mat2d} from 'gl-matrix'
import {
	computed,
	defineComponent,
	reactive,
	ref,
	toRef,
	toRefs,
	watch,
} from 'vue'

import Console from '@/components/Console.vue'
import GlobalMenu from '@/components/GlobalMenu'
import Inspector from '@/components/Inspector.vue'
import GlobalPanes from '@/components/layouts/GlobalPanes.vue'
import MalExpEditor from '@/components/mal-inputs/MalExpEditor.vue'
import PaneLayers from '@/components/PaneLayers.vue'
import ViewCanvas from '@/components/ViewCanvas.vue'
import ViewHandles from '@/components/ViewHandles'
import {
	isMalColl,
	MalAtom,
	MalColl,
	MalList,
	MalString,
	MalSymbol,
	MalVal,
} from '@/mal/types'
import {
	generateExpAbsPath,
	getExpByPath,
	reconstructTree,
	replaceExp,
} from '@/mal/utils'
import ConsoleScope from '@/scopes/console'
import ViewScope from '@/scopes/view'
import {computeTheme, isValidColorString, Theme} from '@/theme'

import {
	useAppCommands,
	useCompactScrollbar,
	useDialogCommand,
	useDialogSettings,
	useExpHistory,
	useHitDetector,
	useURLParser,
} from './use'
import {useModes} from './use/use-modes'

interface Data {
	exp: MalVal
	hasError: boolean
	hasParseError: boolean
	hasEvalError: boolean
	hasRenderError: boolean
	viewExp: MalVal | undefined
	selectedPath: string[]
	selectedExp: MalColl[]
	activeExp: MalVal | undefined
	editingPath: string
	editingExp: MalVal | undefined
	hoveringExp: MalVal | undefined
}

interface UI {
	compact: boolean
	background: string
	theme: Theme
	guideColor: string
	viewTransform: mat2d
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
		PaneLayers,
		GlobalPanes,
	},
	setup(_, context) {
		const ui = reactive({
			compact: true,
			background: 'whiteSmoke',
			theme: computed(() => {
				return computeTheme(ui.background)
			}),
			guideColor: computed(() => ui.theme.colors['--guide']),
			viewTransform: mat2d.create(),
		}) as UI

		const data: Data = reactive({
			exp: MalList.from(MalSymbol.from('sketch')),
			hasError: computed(
				() => data.hasParseError || data.hasEvalError || data.hasRenderError
			),
			hasParseError: false,
			hasEvalError: computed(() => data.viewExp === undefined),
			hasRenderError: false,
			viewExp: computed(() => {
				let viewExp: MalVal | undefined = undefined

				if (data.exp) {
					ViewScope.setup({
						guideColor: ui.guideColor,
					})

					const ret = ViewScope.eval(data.exp)

					if (ret !== undefined) {
						ConsoleScope.def('*view*', ret)
						viewExp = ret
					}
				}

				return viewExp
			}),
			// Selection
			selectedPath: [] as string[],
			selectedExp: computed(() =>
				data.selectedPath.map(path => getExpByPath(data.exp, path))
			),
			activeExp: computed(() =>
				data.selectedExp.length === 0 ? undefined : data.selectedExp[0]
			),

			editingPath: '',
			editingExp: computed(() =>
				data.editingPath
					? (getExpByPath(data.exp, data.editingPath) as MalColl)
					: undefined
			),
			hoveringExp: undefined,
		}) as any

		// Modes
		const handleEl = ref<null | HTMLElement>(null)
		const {modes, modeState, activeModeIndex, setupModes} = useModes(
			handleEl,
			toRef(ui, 'viewTransform')
		)

		const {pushExpHistory, tagExpHistory} = useExpHistory(
			activeModeIndex,
			modeState as any,
			updateExp
		)

		const {onSetupConsole} = useURLParser((exp: MalColl) => {
			updateExp(exp, false)
			pushExpHistory(exp, 'undo')
			setEditingExp(exp)
			setupModes()
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
		function updateExp(exp: MalColl, pushHistory = true) {
			if (pushHistory) {
				pushExpHistory(exp)
			}
			// NOTE: might be redundant
			reconstructTree(exp)
			data.exp = exp

			function onReplaced(newExp: MalVal) {
				if (!isMalColl(newExp)) {
					throw new Error('data.exp cannot be non-node value')
				}
				updateExp(newExp)
			}
		}

		// SelectedExp
		function setSelectedExp(exp: MalColl[]) {
			data.selectedPath = exp.map(generateExpAbsPath)
		}

		function setActiveExp(exp: MalColl | undefined) {
			if (exp) {
				const path = generateExpAbsPath(exp)
				data.selectedPath = path !== '/' ? [path] : []
			} else {
				data.selectedPath = []
			}
		}

		function updateSelectedExp(exp: MalVal) {
			if (data.selectedExp.length === 0) {
				return
			}
			replaceExp(data.selectedExp[0], exp)
		}

		// Editing
		function setEditingExp(exp: MalColl) {
			if (exp) {
				data.editingPath = generateExpAbsPath(exp)
			} else {
				data.editingPath = ''
			}
		}

		function updateEditingExp(exp: MalVal) {
			if (!data.editingExp) return
			replaceExp(data.editingExp, exp)
			pushExpHistory(data.exp, 'undo')
		}

		// Save code
		watch(
			() => data.exp,
			exp => {
				if (exp) {
					const code = printExp(exp)
					const sketch = code.slice(OFFSET_START, -OFFSET_END)
					localStorage.setItem('saved_code', sketch)
					ConsoleScope.def('*sketch*', MalString.from(sketch))
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

		// HitDetector
		useHitDetector(toRef(data, 'exp'))

		return {
			handleEl,
			...toRefs(data),
			onSetupConsole,
			updateSelectedExp,
			updateEditingExp,
			setEditingExp,
			...toRefs(ui),
			updateExp,
			setSelectedExp,
			setActiveExp,
			tagExpHistory,

			// modes
			modes,
			activeModeIndex,
		}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'
@import '~@/components/style/global.styl'
@import '~@/components/style/vmodal.styl'

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
	// background var(--background)
	color var(--textcolor)

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
		border 1px solid var(--frame)
		translucent-bg()

	&__modes
		position absolute
		top 1rem
		left 1rem
		width 10rem
		pointer-events none

		&-button
			$width = 2.5rem
			position relative
			display flex
			overflow hidden
			margin-bottom 0.4rem
			padding 0
			width $width
			height $width
			border-radius: (0.5 * $width)rem
			background var(--textcolor)
			color var(--background)
			text-align center
			line-height $width
			transition all 0.1s ease
			transform-origin 0.5 * $width 0.5 * $width
			pointer-events all

			&:hover, &.active
				width auto

			&:hover
				background var(--highlight)
				transform scale(1.1)

			& > .icon
				display block
				flex 0 0 $width
				width $width
				height $width
				font-weight bold
				font-size 1.2rem
				line-height $width

			& > .label
				display block
				padding-right 1rem
				width auto
				height $width

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
		border-bottom 1px solid var(--frame)
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
			font-monospace()
			line-height 2.2rem
			transition all $compact-dur var(--ease)
			--textcolor var(--comment)

			&.error
				border-color var(--error)
				background var(--error)
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
		border-left-color var(--frame)
		background transparent

		&:before, &:after
			width 0
			height 19px
			border-left 1px dotted var(--frame)
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
		border-right 1px solid var(--frame)
		border-left none
</style>
