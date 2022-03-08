<template>
	<div class="PageRaster">
		<AppHeader :menu="globalMenu">
			<!-- <template #left>
				<AppHeaderBreadcumb :items="[{label: 'Raster'}]" />
			</template> -->
			<template #center>
				<div class="PageRaster__document-title">
					<button @click="showHelp = true">
						<SvgIcon class="icon"
							><path d="M16 14 L16 23 M16 8 L16 10" />
							<circle cx="16" cy="16" r="14"
						/></SvgIcon>
						Help 遊び方
					</button>
				</div>
			</template>
			<template #right>
				<div class="PageRaster__screen-info">
					<SvgIcon class="icon" mode="block">
						<circle cx="17" cy="15" r="1" />
						<circle cx="16" cy="16" r="6" />
						<path
							d="M2 16 C2 16 7 6 16 6 25 6 30 16 30 16 30 16 25 26 16 26 7 26 2 16 2 16 Z"
						/>
					</SvgIcon>
					<div class="zoom-factor">{{ (zoomFactor * 100).toFixed() }}%</div>
				</div></template
			>
		</AppHeader>
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
					:contextmenu="toolSelectorContextmenu"
				/>
				<PaneBrushParams class="PageRaster__params" />
			</template>
			<template #side>
				<BrushSettings />
			</template>
		</SidePane>
	</div>
	<div
		class="PageRaster__help"
		:class="{show: showHelp}"
		@click="showHelp = false"
	>
		<div class="content">
			<SvgIcon :nonStrokeScaling="true" class="close"
				><path d="M2 30 L30 2 M30 30 L2 2"
			/></SvgIcon>
			<Markdown :source="help" />
		</div>
	</div>
	<div class="PageRaster__bg" />
</template>

<script lang="ts">
import {templateRef} from '@vueuse/core'
import _ from 'lodash'
import {defineComponent, onMounted, provide, ref} from 'vue'

import AppHeader, {AppHeaderBreadcumb} from '@/components/AppHeader'
import Markdown from '@/components/layouts/Markdown'
import {MenuItem} from '@/components/layouts/Menu.vue'
import SidePane from '@/components/layouts/SidePane.vue'
import SvgIcon from '@/components/layouts/SvgIcon.vue'
import useScheme from '@/components/use/use-scheme'
import {readImageAsDataURL} from '@/lib/promise'
import {createStore} from '@/lib/store'

import BrushSettings from './BrushSettings.vue'
import Help from './help.md'
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
		AppHeader,
		AppHeaderBreadcumb,
		PaneBrushParams,
		SidePane,
		SvgIcon,
		Zoomable,
		Markdown,
	},
	setup() {
		useScheme()

		const viewportEl = templateRef('viewport')
		const canvasEl = templateRef('canvas')

		const documentName = ref('Untitled')

		const help = ref(Help)

		const store = createStore({
			viewport: useModuleViewport(),
		})
		provide('store', store)
		;(window as any).store = store

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
			documentName.value = image.name.replace(/\.([^.]+)$/, '')
			store.commit('viewport.loadImage', url)
		}

		useLoadActions(store)

		onMounted(() => {
			store.commit('viewport.setupElements', {
				viewport: viewportEl.value,
				canvas: canvasEl.value,
			})
		})

		const globalMenu = [
			// 'viewport.openImage',
			// {name: 'viewport.downloadImage', payload: {name: documentName.value}},
			// 'viewport.resetBuiltinBrushes',
			'viewport.reload',
			'viewport.fitTransformToScreen',
		]

		const toolSelectorContextmenu: MenuItem[] = [
			{
				name: 'copyBrushUrl',
				label: 'Copy Brush URL',
				...store.getAction('viewport.copyBrushUrl'),
			},
			{
				name: 'copyBrushYaml',
				label: 'Copy Brush YAML',
				...store.getAction('viewport.copyBrushYaml'),
			},
		]

		const viewportTransform = store.getState('viewport.transform')
		const canvasSize = store.getState('viewport.canvasSize')
		const zoomFactor = store.getState('viewport.zoomFactor')
		const currentBrush = store.getState('viewport.currentBrush')
		const brushParams = store.getState('viewport.brushParams')
		const currentBrushName = store.getState('viewport.currentBrushName')
		const brushes = store.getState('viewport.brushes')

		const showHelp = ref(false)

		const sideBarDefaultWidth = ref(
			navigator.maxTouchPoints > 0 ? 0 : undefined
		)

		function reloadApp() {
			store.commit('viewport.reload', null)
		}

		// Auto-reload
		let timer: any
		function startAutoReloadTimer() {
			if (timer) clearTimeout(timer)

			timer = setTimeout(() => {
				store.commit('viewport.reload', null)
			}, 1000 * 60 * 2)
		}

		window.addEventListener('pointerdown', startAutoReloadTimer)
		window.addEventListener('pointermove', startAutoReloadTimer)
		startAutoReloadTimer()

		return {
			getState: store.getState,
			commit: store.commit,
			documentName,
			viewportTransform,
			currentBrush,
			toolSelectorContextmenu,
			canvasSize,
			brushParams,
			currentBrushName,
			brushes,
			zoomFactor,
			onDropFile,
			globalMenu,
			toLabel: _.startCase,
			help,
			showHelp,
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

	&__document-title
		font-size 1.3em
		line-height calc((var(--height) / 1.3))

		button:hover
			padding 0 .4em
			background base16('02')
			color base16('accent')


	&__screen-info
		display flex
		margin-right 1em
		line-height var(--height)

		& > *
			height var(--height)
			line-height var(--height)

		& > .icon
			width 1.3em

		& > .zoom-factor
			width 5ch
			font-numeric()
			text-align right

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


	&__help
		position fixed
		inset 0
		z-index 10000
		background base16('00', .9)
		backdrop-filter blur(3px)
		visibility hidden

		&.show
			visibility visible


		.content
			position absolute
			inset 5em
			margin 1.8em
			padding 1.8em
			glass-bg('pane')
			color base16('06')
			border 1px solid $color-frame
			border-radius $popup-round
			overflow scroll
			-webkit-overflow-scrolling touch


		.close
			position absolute
			top 1.8em
			right 1.8em

		img
			width 23%
			display inline-block
			margin-right 1em
			margin-bottom 1em
			vertical-align top
</style>
