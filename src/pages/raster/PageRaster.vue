<template>
	<div class="PageRaster">
		<GlobalMenu2 :menu="globalMenu">
			<template #left>
				<GlobalMenu2Breadcumb :items="[{label: 'Raster'}]" />
			</template>
		</GlobalMenu2>
		<Splitpanes class="glisp-theme" @resize="controlPaneWidth = $event[1].size">
			<Pane
				class="no-padding PageRaster__viewport"
				:size="100 - controlPaneWidth"
			>
				<Zoomable
					class="PageRaster__zoomable"
					v-model:transform="viewTransform"
					ref="viewport"
					@dragenter.prevent
					@dragover.prevent
					@drop="onDropFile"
				>
					<canvas
						class="PageRaster__canvas"
						ref="canvas"
						:width="canvasSize[0]"
						:height="canvasSize[1]"
						:style="{
							transform: `matrix(${viewTransform.join(
								','
							)}) scaleY(-1) translateY(-100%)`,
						}"
					/>
				</Zoomable>
				<ToolSelector
					class="PageRaster__tool-selector"
					v-model="currentBrushName"
					v-model:tools="brushes"
				/>
				<dl class="PageRaster__params">
					<template
						v-for="[name, def] in Object.entries(currentBrush.params)"
						:key="name"
					>
						<dt>{{ toLabel(name) }}</dt>
						<dd>
							<InputControl v-bind="def" v-model="params[name]" />
						</dd>
					</template>
				</dl>
			</Pane>
			<Pane class="PageRaster__control" :size="controlPaneWidth">
				<BrushSettings
					v-model="currentBrush"
					:fragDeclarations="fragDeclarations"
					:shaderErrors="shaderErrors"
				/>
			</Pane>
		</Splitpanes>
	</div>
	<div class="PageRaster__bg" />
</template>

<script lang="ts">
import 'normalize.css'
import 'splitpanes/dist/splitpanes.css'

import {templateRef, useLocalStorage} from '@vueuse/core'
import _ from 'lodash'
import {Pane, Splitpanes} from 'splitpanes'
import {computed, defineComponent, ref} from 'vue'
import YAML from 'yaml'

import GlobalMenu2, {GlobalMenu2Breadcumb} from '@/components/GlobalMenu2'
import useScheme from '@/components/use/use-scheme'

import Action from './action'
import BrushSettings from './BrushSettings.vue'
import BuiltinBrushes from './builtin-brushes'
import InputControl from './InputControl.vue'
import ToolSelector from './ToolSelector.vue'
import useViewport from './use-viewport'
import Zoomable from './Zoomable.vue'
export default defineComponent({
	name: 'PageRaster',
	components: {
		BrushSettings,
		InputControl,
		ToolSelector,
		GlobalMenu2,
		GlobalMenu2Breadcumb,
		Pane,
		Splitpanes,
		Zoomable,
	},
	setup() {
		useScheme()

		const viewportEl = templateRef('viewport')
		const canvasEl = templateRef('canvas')

		const controlPaneWidth = useLocalStorage('controlPaneWidth', 50)

		// Brushes
		const brushes = useLocalStorage('raster__brushes', BuiltinBrushes)
		const currentBrushName = useLocalStorage(
			'raster__currentBrushName',
			'brush'
		)
		if (!(currentBrushName.value in brushes.value)) {
			currentBrushName.value = _.keys(brushes.value)[0]
		}

		const currentBrush = computed({
			get: () => brushes.value[currentBrushName.value],
			set: v => {
				brushes.value[currentBrushName.value] = v
			},
		})

		const {
			state: viewportState,
			methods: {loadImage},
			actions: viewportActions,
		} = useViewport({
			viewportEl,
			canvasEl,
			currentBrush,
		})

		window.addEventListener(
			'paste',
			e => {
				loadImageFromDataTransfer((e as ClipboardEvent).clipboardData)
			},
			false
		)

		function onDropFile(e: DragEvent) {
			e.preventDefault()
			loadImageFromDataTransfer(e.dataTransfer)
		}

		function loadImageFromDataTransfer(dataTransfer: DataTransfer | null) {
			// Use thePasteEvent object here ...
			const image = dataTransfer?.files[0]

			if (image && image.type.startsWith('image')) {
				const reader = new FileReader()
				reader.readAsDataURL(image)
				reader.onload = () => {
					if (typeof reader.result === 'string') {
						loadImage(reader.result)
					}
				}
			}
		}

		const copyCurrentBrushUrl: Action = {
			name: 'Copy Current Brush URL',
			icon: '<path d="M12 2 L12 6 20 6 20 2 12 2 Z M11 4 L6 4 6 30 26 30 26 4 21 4" />',
			exec() {
				const data = YAML.stringify({
					[currentBrushName.value]: currentBrush.value,
				})
				const url = new URL('raster.html', window.location.href)
				url.searchParams.set('action', 'load_brush')
				url.searchParams.set('data', data)
				navigator.clipboard.writeText(url.toString())
			},
		}

		const globalMenu = ref([..._.values(viewportActions), copyCurrentBrushUrl])

		return {
			brushes,
			controlPaneWidth,
			currentBrush,
			currentBrushName,
			globalMenu,
			...viewportState,

			onDropFile,

			toLabel: _.startCase,
		}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/global.styl'
@import '~@/components/style/common.styl'

html, body
	overflow hidden

.PageRaster
	app()
	display grid
	height 100vh
	background transparent
	grid-template-rows auto 1fr

	&__bg
		position fixed
		z-index -20
		background base16('00')
		inset 0

	&__viewport
		position relative
		overflow hidden !important

	&__tool-selector
		position absolute
		top 1em
		left 1em

	&__control
		glass-bg('pane')

	&__zoomable
		width 100%
		height 100%

	&__canvas
		position fixed
		z-index -10
		display block
		transform-origin 0 0
		pointer-events none

	&__params
		position absolute
		top 1em
		right 1em
		display grid
		padding 1em
		border 1px solid $color-frame
		border-radius $popup-round
		glass-bg('pane')
		grid-template-columns minmax(5em, min-content) 1fr
		gap $input-horiz-margin

		& > dt
			height $input-height
			color base16('04')
			line-height $input-height

		& > dd
			display flex
			align-items center
			line-height $input-height

			& > span
				margin-left 1em
				color base16('04')
				font-monospace()
</style>
