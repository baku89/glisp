<template>
	<div class="PageRaster">
		<GlobalMenu2 :menu="globalMenu">
			<template #left>
				<GlobalMenu2Breadcumb :items="[{label: 'Raster'}]" />
			</template>
		</GlobalMenu2>
		<SidePane
			uid="globalSidePane"
			:mainAttr="{class: 'PageRaster__viewport'}"
			:sideAttr="{class: 'PageRaster__control'}"
		>
			<template #main>
				<Zoomable
					class="PageRaster__zoomable"
					:transform="viewportTransform"
					@update:transform="commit('viewport.setTransform', $event)"
					ref="viewport"
					@dragenter.prevent
					@dragover.prevent
					@drop.prevent="onDropFile"
				>
					<canvas
						class="PageRaster__canvas"
						:class="{mag: zoomFactor > 2}"
						ref="canvas"
						:width="canvasSize[0]"
						:height="canvasSize[1]"
						:style="{
							transform: `matrix(${viewportTransform.join(
								','
							)}) scaleY(-1) translateY(-100%)`,
						}"
					/>
				</Zoomable>
				<ToolSelector
					class="PageRaster__tool-selector"
					:modelValue="currentBrushName"
					@update:modelValue="commit('viewport.switchBrush', $event)"
					:tools="brushes"
					@update:tools="commit('viewport.setBrushes', $event)"
				/>
				<PaneBrushParams class="PageRaster__params" />
			</template>
			<template #side>
				<BrushSettings />
			</template>
		</SidePane>
	</div>
	<div class="PageRaster__bg" />
</template>

<script lang="ts">
import 'normalize.css'
import 'splitpanes/dist/splitpanes.css'

import {templateRef} from '@vueuse/core'
import _ from 'lodash'
import {defineComponent, onMounted, provide, ref} from 'vue'

import GlobalMenu2, {GlobalMenu2Breadcumb} from '@/components/GlobalMenu2'
import SidePane from '@/components/layouts/SidePane.vue'
import useScheme from '@/components/use/use-scheme'
import {readImageAsDataURL} from '@/lib/promise'
import {createStore} from '@/lib/store'

import BrushSettings from './BrushSettings.vue'
import PaneBrushParams from './PaneBrushParams.vue'
import useModuleViewport from './stores/viewport'
import ToolSelector from './ToolSelector.vue'
import useLoadActions from './use-load-actions'
import Zoomable from './Zoomable.vue'

export default defineComponent({
	name: 'PageRaster',
	components: {
		BrushSettings,
		ToolSelector,
		GlobalMenu2,
		GlobalMenu2Breadcumb,
		PaneBrushParams,
		SidePane,
		Zoomable,
	},
	setup() {
		useScheme()

		const viewportEl = templateRef('viewport')
		const canvasEl = templateRef('canvas')

		const store = createStore({
			viewport: useModuleViewport(),
		})
		provide('store', store)

		// Open Image actions
		window.addEventListener(
			'paste',
			e => loadImageFromDataTransfer((e as ClipboardEvent).clipboardData),
			false
		)

		function onDropFile(e: DragEvent) {
			loadImageFromDataTransfer(e.dataTransfer)
		}

		async function loadImageFromDataTransfer(
			dataTransfer: DataTransfer | null
		) {
			// Use thePasteEvent object here ...
			const image = dataTransfer?.files[0]
			if (!image || !image.type.startsWith('image')) return
			const url = await readImageAsDataURL(image)
			store.commit('viewport.loadImage', url)
		}

		useLoadActions(store)

		onMounted(() => {
			store.commit('viewport.setupElements', {
				viewport: viewportEl.value,
				canvas: canvasEl.value,
			})
		})

		const globalMenu = ref([
			'viewport.openImage',
			'viewport.downloadImage',
			'viewport.copyCurrentBrushUrl',
			'viewport.copyCurrentBrushYaml',
		])

		const viewportTransform = store.getState('viewport.transform')
		const canvasSize = store.getState('viewport.canvasSize')
		const zoomFactor = store.getState('viewport.zoomFactor')
		const currentBrush = store.getState('viewport.currentBrush')
		const brushParams = store.getState('viewport.brushParams')
		const currentBrushName = store.getState('viewport.currentBrushName')
		const brushes = store.getState('viewport.brushes')

		return {
			getState: store.getState,
			commit: store.commit,
			viewportTransform,
			currentBrush,
			canvasSize,
			brushParams,
			currentBrushName,
			brushes,
			zoomFactor,
			onDropFile,
			globalMenu,
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
		padding 1.8em
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

		&.mag
			image-rendering pixelated

	&__params
		position absolute
		top 1em
		right 1em
		display grid
		padding 1em
		border 1px solid $color-frame
		border-radius $popup-round
		glass-bg('pane')
</style>
