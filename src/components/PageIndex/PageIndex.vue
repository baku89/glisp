<template>
	<div id="app" class="PageIndex">
		<Tq.TitleBar name="Glisp" icon="favicon.svg" />
		<Tq.PaneFloating
			name="tree-view"
			icon="mdi:folder"
			:position="{anchor: 'left-top', width: 100, height: 600}"
		>
			<PaneLayers />
		</Tq.PaneFloating>

		<Tq.PaneFloating
			name="inspector"
			icon="mdi:folder"
			:position="{anchor: 'right-bottom', width: 200, height: 200}"
		>
			<Inspector v-model:expr="sketch.activeExpr" />
		</Tq.PaneFloating>

		<Tq.PaneFloating
			name="code"
			icon="mdi:folder"
			:position="{anchor: 'right', width: 400}"
		>
			<div class="control" :class="{compact}">
				<div class="editor">
					<ExprEditor />
				</div>
				<div class="console">
					<Icon
						icon="mdi:chevron-up"
						class="console-toggle"
						:class="{error: sketch.hasError}"
					/>
					<Console :compact="compact" />
				</div>
			</div>
		</Tq.PaneFloating>
		<ViewCanvas class="viewer" />
	</div>
</template>

<script lang="ts" setup>
import 'normalize.css'
import 'tweeq/global.styl'
import 'splitpanes/dist/splitpanes.css'

import {Icon} from '@iconify/vue'
import {useTweeq} from 'tweeq'
import Tq from 'tweeq'
import {computed, ref, watch} from 'vue'

import Console from '@/components/Console.vue'
import ExprEditor from '@/components/expr-inputs/ExprEditor.vue'
import Inspector from '@/components/Inspector.vue'
import PaneLayers from '@/components/PaneLayers.vue'
import ViewCanvas from '@/components/ViewCanvas.vue'
import {useSketchStore} from '@/stores/sketch'
import {computeTheme} from '@/theme'

useTweeq('com.baku89.glisp', {
	colorMode: 'light',
	accentColor: '#0000ff',
})

const sketch = useSketchStore()

const compact = ref(true)
const background = ref('whiteSmoke')
const theme = computed(() => computeTheme(background.value))

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
</script>

<style lang="stylus" scoped>
@import '../style/common.styl'
@import '../style/global.styl'
@import '../style/vmodal.styl'

$compact-dur = 0.4s
.PageIndex
	overflow hidden
	width 100%
	height 100vh
.content
	position fixed
	inset var(--app-margin-top) 0 0
	height auto
.viewer
	position absolute !important
	top 0
	left 0
	margin-right 1rem
	width 100%
	height 100%
.control
	position relative
	display flex
	flex-direction column
	width 100%
	height 100%

.editor
	padding 0 0 1rem
	height 70%
	border-bottom 1px solid var(--border)
	transition height $compact-dur var(--ease)

.console
	position relative
	flex-grow 1
	padding 1rem 0 0
	background blasck

.console-toggle
	color var(--tq-color-background)
	position absolute
	right 0.7rem
	width calc(1.5 * var(--tq-input-height))
	height calc(1.5 * var(--tq-input-height))
	background var(--tq-color-primary)
	border-radius 50%

	&.error
		background var(--tq-color-error)
		color var(--tq-color-background)
</style>
