<script lang="ts" setup>
import 'normalize.css'
import 'tweeq/global.styl'
import 'splitpanes/dist/splitpanes.css'

import {useElementSize} from '@vueuse/core'
import {mat2d} from 'linearly'
import {Pane, Splitpanes} from 'splitpanes'
import {useTweeq} from 'tweeq'
import Tq from 'tweeq'
import {computed, onMounted, reactive, Ref, ref, watch} from 'vue'

import Console from '@/components/Console.vue'
import ExprEditor from '@/components/expr-inputs/ExprEditor.vue'
import Inspector from '@/components/Inspector.vue'
import PaneLayers from '@/components/PaneLayers.vue'
import {useRem} from '@/components/use'
import ViewCanvas from '@/components/ViewCanvas.vue'
import {ExprAtom, ExprColl, printExpr} from '@/glisp'
import ConsoleScope from '@/scopes/console'
import {useSketchStore} from '@/stores/sketch'
import {computeTheme, isValidColorString} from '@/theme'

import {useCompactScrollbar, useHitDetector} from './use'
import {useModes} from './use/use-modes'

useTweeq('com.baku89.glisp', {
	colorMode: 'light',
	accentColor: '#0000ff',
})

const OFFSET_START = '(sketch;__\n'.length
const OFFSET_END = ';__\n)'.length

const elHandles: Ref<any | null> = ref(null)

const sketch = useSketchStore()

const rem = useRem()

const {width: windowWidth} = useElementSize(document.body)

const compact = ref(true)
const background = ref('whiteSmoke')
const theme = computed(() => computeTheme(background.value))
const viewHandlesTransform = ref(mat2d.identity)

const viewTransform = computed(() => {
	const left = paneSizeInPixel.layers
	const {top} = elHandles.value?.$el.getBoundingClientRect() || {
		top: 0,
	}
	return mat2d.translate(viewHandlesTransform.value, [left, top])
})

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
watch(
	() => sketch.expr as ExprColl,
	(expr: ExprColl) => {
		if (expr) {
			const code = printExpr(expr)
			const sketch = code.slice(OFFSET_START, -OFFSET_END)
			localStorage.setItem('saved_code', sketch)
			ConsoleScope.def('*sketch*', sketch)
		}
	}
)

// Watch the mutable states
watch(
	() => sketch.evaluated,
	() => {
		const bg = ConsoleScope.var('*app-background*') as ExprAtom
		if (
			typeof bg.value === 'string' &&
			isValidColorString(bg.value) &&
			background.value !== bg.value
		) {
			background.value = bg.value
		}
	}
)

// Scrollbar
useCompactScrollbar()

// Modes
const {modes, activeModeIndex} = useModes(elHandles, viewTransform)

// HitDetector
useHitDetector()
</script>

<template>
	<div id="app" class="PageIndex">
		<Tq.TitleBar name="Glisp" icon="favicon.svg" />
		<Splitpanes
			class="PageIndex__content default-theme"
			vertical
			@resize="onResizeSplitpanes"
		>
			<Pane class="left" :size="paneSizeInPercent.layers" :max-size="30">
				<PaneLayers class="PageIndex__list-view" />
			</Pane>
			<Pane :size="100 - paneSizeInPercent.layers - paneSizeInPercent.control">
				<div v-if="sketch.activeExpr" class="PageIndex__inspector">
					<Inspector v-model:expr="sketch.activeExpr" />
				</div>
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
						<ExprEditor />
					</div>
					<div class="PageIndex__console">
						<button
							class="PageIndex__console-toggle"
							:class="{error: sketch.hasError}"
							@click="compact = !compact"
						>
							{{ sketch.hasError ? '!' : '✓' }}
						</button>
						<Console :compact="compact" />
					</div>
				</div>
			</Pane>
		</Splitpanes>
		<ViewCanvas class="PageIndex__viewer" />
	</div>
</template>

<style lang="stylus">
@import '../style/common.styl'
@import '../style/global.styl'
@import '../style/vmodal.styl'

$compact-dur = 0.4s


.view-handles-axes
	position absolute
	top 3.4rem
	height calc(100vh - 3.4rem)
	pointer-events none


.PageIndex
	overflow hidden
	width 100%
	height 100vh

	&__content
		position fixed
		inset var(--app-margin-top) 0 0
		height auto

	&__list-view
		position relative
		width 100%
		height 100%
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
		pane-style()
		border-radius var(--tq-pane-border-radius)

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
				border-color var(--tq-color-error)
				background var(--tq-color-error)
				color var(--tq-color-background)
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
@/glis[@/glis[/reader@/glis[/types@/glis[/utils
