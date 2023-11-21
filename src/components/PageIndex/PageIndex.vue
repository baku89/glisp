<script lang="ts" setup>
import 'normalize.css'
import 'splitpanes/dist/splitpanes.css'

import {useElementSize} from '@vueuse/core'
import {mat2d} from 'linearly'
import {Pane, Splitpanes} from 'splitpanes'
import {computed, onMounted, reactive, Ref, ref, watch, watchEffect} from 'vue'

import Console from '@/components/Console.vue'
import GlobalMenu from '@/components/GlobalMenu'
import Inspector from '@/components/Inspector.vue'
import MalExpEditor from '@/components/mal-inputs/MalExpEditor.vue'
import PaneLayers from '@/components/PaneLayers.vue'
import {useRem} from '@/components/use'
import ViewHandles from '@/components/ViewHandles'
import {printExp} from '@/mal'
import {reconstructTree} from '@/mal/reader'
import {
	createList as L,
	isNode,
	MalAtom,
	MalNode,
	MalVal,
	symbolFor as S,
} from '@/mal/types'
import {replaceExp, unwatchExpOnReplace, watchExpOnReplace} from '@/mal/utils'
import ConsoleScope from '@/scopes/console'
import ViewScope from '@/scopes/view'
import {computeTheme, isValidColorString} from '@/theme'

import {
	useCompactScrollbar,
	useExpHistory,
	useHitDetector,
	useURLParser,
} from './use'
import {useModes} from './use/use-modes'

const OFFSET_START = 11 // length of "(sketch;__\n"
const OFFSET_END = 5 // length of ";__\n)"

const elHandles: Ref<any | null> = ref(null)

const rem = useRem()

const {width: windowWidth} = useElementSize(document.body)

const compact = ref(true)
const background = ref('whiteSmoke')
const theme = computed(() => computeTheme(background.value))
const guideColor = computed(() => theme.value.colors['--guide'])
const viewHandlesTransform = ref(mat2d.identity)

const viewTransform = computed(() => {
	const left = paneSizeInPixel.layers
	const {top} = elHandles.value?.$el.getBoundingClientRect() || {
		top: 0,
	}
	return mat2d.translate(viewHandlesTransform.value, [left, top])
})

const exp = ref(L(S('sketch'))) as Ref<MalNode>

const hasParseError = ref(false)
const hasEvalError = computed(() => viewExp.value === null)
const hasRenderError = ref(false)
const hasError = computed(
	() => hasParseError.value || hasEvalError.value || hasRenderError.value
)

const viewExp = computed(() => {
	let viewExp: MalVal | null = null

	if (exp.value) {
		ViewScope.setup({
			guideColor: guideColor.value,
		})

		const ret = ViewScope.eval(exp.value)

		if (ret !== undefined) {
			ConsoleScope.def('*view*', ret)
			viewExp = ret
		}
	}

	return viewExp
})

const selectedExp = ref([]) as Ref<MalNode[]>

const activeExp = computed(() => {
	return selectedExp.value.length === 0
		? null
		: (selectedExp.value[0] as MalNode)
})

const editingExp = ref(null) as Ref<MalNode | null>
const hoveringExp = ref(null)

// Centerize the origin of viewport on mounted
onMounted(() => {
	if (!elHandles.value) return

	const {top, bottom} = (
		elHandles.value.$el as SVGElement
	).getBoundingClientRect()

	const left = 0
	const right = window.innerWidth - paneSizeInPixel.control

	const xform = mat2d.fromTranslation([(left + right) / 2, (top + bottom) / 2])

	viewHandlesTransform.value = xform
})

const {pushExpHistory, tagExpHistory} = useExpHistory(exp, updateExp)

const {onSetupConsole} = useURLParser((exp: MalNode) => {
	updateExp(exp, false)
	pushExpHistory(exp, 'undo')
	setEditingExp(exp)
})

// Apply the theme
watch(
	() => theme.value.colors,
	colors => {
		Object.entries(colors).forEach(([name, value]) => {
			document.body.style.setProperty(name, value)
		})
	},
	{immediate: true}
)

// Events

// Exp
function updateExp(_exp: MalNode, pushHistory = true) {
	unwatchExpOnReplace(exp.value, onReplaced)
	if (pushHistory) {
		pushExpHistory(_exp)
	}
	// NOTE: might be redundant
	reconstructTree(exp.value)
	exp.value = _exp
	watchExpOnReplace(exp.value, onReplaced)

	function onReplaced(newExp: MalVal) {
		if (!isNode(newExp)) {
			throw new Error('data.exp cannot be non-node value')
		}
		updateExp(newExp)
	}
}

// SelectedExp
function setSelectedExp(targets: MalNode[]) {
	selectedExp.value = targets
}

function setActiveExp(target: MalNode | null) {
	if (target) {
		selectedExp.value = target !== exp.value ? [target] : []
	} else {
		selectedExp.value = []
	}
}

function updateSelectedExp(target: MalVal) {
	if (!activeExp.value) {
		return
	}
	replaceExp(activeExp.value, target)
}

// Editing
function setEditingExp(target: MalNode) {
	editingExp.value = target
}

function updateEditingExp(_exp: MalVal) {
	if (!editingExp.value) return
	replaceExp(editingExp.value, _exp)
	pushExpHistory(exp.value, 'undo')
}

// Splitpanes
const paneSizeInPixel = reactive({
	layers: 15 * rem.value,
	control: 30 * rem.value,
})

const paneSizeInPercent = reactive({
	layers: computed(() => (paneSizeInPixel.layers / windowWidth.value) * 100),
	control: computed(() => (paneSizeInPixel.control / windowWidth.value) * 100),
})

function onResizeSplitpanes(sizes: {min: number; max: number; size: number}[]) {
	const [layers, , control] = sizes.map(s => s.size)

	paneSizeInPixel.layers = windowWidth.value * (layers / 100)
	paneSizeInPixel.control = windowWidth.value * (control / 100)
}

// Save code
watch(exp, exp => {
	if (exp) {
		const code = printExp(exp)
		const sketch = code.slice(OFFSET_START, -OFFSET_END)
		localStorage.setItem('saved_code', sketch)
		ConsoleScope.def('*sketch*', sketch)
	}
})

// Watch the mutable states
watch(viewExp, () => {
	const bg = ConsoleScope.var('*app-background*') as MalAtom
	if (
		typeof bg.value === 'string' &&
		isValidColorString(bg.value) &&
		background.value !== bg.value
	) {
		background.value = bg.value
	}
})

// Setup scopes
// useAppCommands({
// 	exp,
// 	activeExp,
// 	selectedExp,
// 	editingExp,
// 	updateExp,
// 	setActiveExp,
// 	setSelectedExp,
// })
// useDialogCommand(context)
// useDialogSettings(context)

// Scrollbar
useCompactScrollbar()

// Modes
const {modes, activeModeIndex} = useModes(elHandles, viewTransform)

// HitDetector
useHitDetector(exp)

// ...toRefs(data as any),
// ...toRefs(ui as any),

const viewHandlesAxes = document.getElementById('view-handles-axes')!

watchEffect(() => {
	viewHandlesAxes.style.left = paneSizeInPercent.layers + '%'
	viewHandlesAxes.style.right = paneSizeInPercent.control + '%'
})
</script>

<template>
	<div id="app" class="PageIndex">
		<!-- <ViewCanvas
			class="PageIndex__viewer"
			:exp="viewExp"
			:guideColor="guideColor"
			:viewTransform="viewTransform"
			@render="hasRenderError = !$event"
		/> -->
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
				<div v-if="activeExp" class="PageIndex__inspector">
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
				<div class="PageIndex__modes">
					<button
						v-for="({name, handlers}, i) in modes"
						:key="name"
						class="PageIndex__modes-button"
						:class="{active: i === activeModeIndex}"
						@click="activeModeIndex = i"
					>
						<span v-if="handlers.icon.type === 'character'" class="icon">{{
							handlers.icon.value
						}}</span>
						<i
							v-else-if="handlers.icon.type === 'fontawesome'"
							class="icon"
							:class="handlers.icon.value"
						/>

						<span class="label">{{ handlers.label }}</span>
					</button>
				</div>
			</Pane>
			<Pane :size="paneSizeInPercent.control" :max-size="40">
				<div class="PageIndex__control" :class="{compact}">
					<div class="PageIndex__editor">
						<MalExpEditor
							v-if="editingExp"
							v-model:hasParseError="hasParseError"
							:exp="editingExp"
							:selectedExp="activeExp"
							:editMode="editingExp === exp ? 'params' : 'node'"
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
			</Pane>
		</Splitpanes>
	</div>
</template>

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

	&__modes
		position absolute
		top 1rem
		left 1rem
		display flex
		flex-direction column
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
			border-radius (0.5 * $width)rem
			background var(--foreground)
			color var(--background)
			text-align center
			line-height $width
			transition all 0.1s ease
			transform-origin 0.5 * $width 0.5 * $width
			pointer-events all

			&:hover, &.active
				width auto

			&:hover
				background var(--hover)
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
