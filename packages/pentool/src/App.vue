<template lang="pug">
.App
	canvas.artboard(:class='{pan}', resize, ref='canvas')
	aside.sidebar(:class='{show: showSidebar}')
		.sidebar__split(@click='showSidebar = !showSidebar')
		.tool-editor
			.tool-editor__header
				input.icon(type='text', v-model='activeTool.icon', maxlength='2')
				input.label(type='text', v-model='activeTool.label', maxlength='20')
				button.btn-update(:class='{dirty: isDirty}', @click='recompileActiveTool') Update
				button.btn-menu(@click='openToolEditorMenu = !openToolEditorMenu') ⠇
				ul.menu(v-if='openToolEditorMenu', @click='openToolEditorMenu = false')
					li(@click='deleteTool') Delete
					li(@click='moveUpTool') Move Up
					li(@click='moveDownTool') Move Down
					li(@click='downloadTool') Download File
				.fill(v-if='openToolEditorMenu', @click='openToolEditorMenu = false')
			.tool-editor__editors
				Editor(
					:hide='toolEditMode !== "code"',
					v-model='editingCode',
					lang='javascript',
					@save='recompileActiveTool'
				)
				Editor(
					:hide='toolEditMode !== "params"',
					v-model='editingMeta',
					lang='json',
					@save='recompileActiveTool'
				)
			.tool-editor__tab
				button(
					:class='{active: toolEditMode === "code"}',
					@click='toolEditMode = "code"'
				) Code
				button(
					:class='{active: toolEditMode === "params"}',
					@click='toolEditMode = "params"'
				) Params

		ParameterControl(
			v-model='parameters',
			:scheme='activeTool.metadata.parameters',
			@update='updateParameter'
		)

	nav.toolbar
		ul.toolbar__tools
			li(
				v-for='({meta}, index) in tools',
				:key='index',
				:class='{active: index === activeToolIndex}'
			)
				input(
					type='radio',
					:id='meta.label',
					:value='index',
					v-model='activeToolIndex'
				)
				label(:for='meta.label') {{meta.label}}
				div(:class='{icon: true, tinyletter: meta.icon.length > 1}') {{meta.icon}}
			li.add(@click='addTool')

	.settings-button(@click='openSettingsMenu = !openSettingsMenu')

	ul.menu.settings(v-if='openSettingsMenu', @click='openSettingsMenu = false')
		li(@click='clearArtboard') Clear All
		li(@click='exportSVG') Export SVG
		li(@click='resetTools') Reset Tools
		li(@click='openToolURLPrompt') Load Tool from URL
	.fill(v-if='openSettingsMenu', @click='openSettingsMenu = false')
</template>

<script lang="ts">
import {
	computed,
	defineComponent,
	onMounted,
	reactive,
	ref,
	toRefs,
	watch,
} from '@vue/runtime-core'
import axios from 'axios'
import downloadAsFile from 'download-as-file'
import Mousetrap from 'mousetrap'
import paper from 'paper'
import queryString from 'query-string'

import Editor from './components/Editor.vue'
import ParameterControl from './components/ParameterControl.vue'
import Tool, {Parameters, ToolInfo} from './Tool'
import * as ToolPresets from './ToolPresets'
import {jsonStringify} from './util/JsonStringify'

paper.project.currentStyle.strokeCap = 'round'
paper.project.currentStyle.strokeJoin = 'round'

function getLocalStorage<T = any>(name: string, defaultValue: T): T {
	const str = localStorage.getItem(name) ?? 'null'
	return JSON.parse(str) ?? defaultValue
}

export default defineComponent({
	name: 'App',
	components: {
		Editor,
		ParameterControl,
	},
	setup() {
		const canvas = ref<null | HTMLCanvasElement>(null)

		const data = reactive({
			tools: getLocalStorage<ToolInfo[]>('tools', []),
			parameters: {} as Parameters,
			parametersCache: getLocalStorage<Parameters>('parametersCache', {}),
			editingCode: '',
			editingMeta: '',
			activeToolIndex: getLocalStorage('activeToolIndex', 0),
			pan: false,
			showSidebar: true,
			toolEditMode: 'code' as 'params' | 'code',
			openToolEditorMenu: false,
			openSettingsMenu: false,
		})

		const activeTool = computed({
			get: () => data.tools[data.activeToolIndex],
			set: activeTool => (data.tools[data.activeToolIndex] = activeTool),
		})

		const isDirty = computed(() => {
			return (
				data.editingCode !== activeTool.value.code ||
				jsonStringify(activeTool.value.meta) !== data.editingMeta
			)
		})

		// load
		const {tool_url} = queryString.parse(location.search)

		if (tool_url) {
			loadToolFromURL(tool_url)
		}

		// Canvas setup
		onMounted(() => {
			if (!canvas.value) return
			paper.setup(canvas.value)

			canvas.value.addEventListener('mousewheel', (e: any) => {
				const view = paper.project.view

				if (e.altKey || e.ctrlKey) {
					const zoomDelta = 1 + -e.deltaY / 100
					const pivot = view.projectToView(new paper.Point(e.x, e.y))
					view.scale(zoomDelta, pivot)
					view.emit('zoom', view.scaling.x as any)
				} else {
					view.translate(new paper.Point(-e.deltaX, -e.deltaY))
				}
			})

			project.view.on('zoom', (zoom: number) => {
				guideLayer.children.forEach(child => {
					scaleGuide(child, zoom)
				})
			})

			// project.view.applyMatrix = false

			activeLayer.activate()
		})

		const project = paper.project
		const activeLayer = paper.project.activeLayer
		const guideLayer = new paper.Layer()
		guideLayer.bringToFront()
		guideLayer.name = 'guide'

		const scaleGuide = (item: paper.Item, zoom: number) => {
			if (item.data.isMarker) {
				const s = 1 / zoom
				item.scaling = new paper.Point(s, s)
			}

			if (item.children) {
				item.children.forEach(child => scaleGuide(child, zoom))
			}
		}

		// canvas navigation
		{
			let px: number,
				py: number,
				isDragging = false

			const mousedown = ({x, y}: MouseEvent) => {
				isDragging = true
				px = x
				py = y
			}

			const mousemove = ({x, y}: MouseEvent) => {
				if (isDragging) {
					const layer = paper.project.activeLayer

					const dx = x - px
					const dy = y - py

					layer.translate(new paper.Point(dx, dy))
					px = x
					py = y
				}
			}

			const mouseup = () => {
				isDragging = false
			}

			Mousetrap.bind(
				'space',
				() => {
					if (!canvas.value) return
					data.pan = true
					toolInstance?.pause()

					canvas.value.addEventListener('mousedown', mousedown)
					canvas.value.addEventListener('mousemove', mousemove)
					canvas.value.addEventListener('mouseup', mouseup)
				},
				'keydown'
			)

			Mousetrap.bind(
				'space',
				() => {
					if (!canvas.value) return

					data.pan = false
					toolInstance?.resume()

					canvas.value.removeEventListener('mousedown', mousedown)
					canvas.value.removeEventListener('mousemove', mousemove)
					canvas.value.removeEventListener('mouseup', mouseup)
				},
				'keyup'
			)
		}

		// other keybinds
		Mousetrap.bind(['command+del', 'command+backspace'], clearArtboard)

		// Initialize tool instances from info
		let toolInstance: Tool | null = null
		watch(
			activeTool,
			tool => {
				toolInstance?.deactivate()
				toolInstance = Tool.compile(tool, data.parameters)
				toolInstance.activate()
			},
			{
				immediate: true,
			}
		)

		function recompileActiveTool() {
			toolInstance?.deactivate()

			activeTool.value = {
				...activeTool.value,
				code: data.editingCode,
				meta: JSON.parse(data.editingMeta),
			}
		}

		function addTool() {
			data.tools.push(ToolPresets.createNew())
			data.activeToolIndex = data.tools.length - 1
		}

		function deleteTool() {
			data.tools = data.tools.splice(data.activeToolIndex, 1)
			data.activeToolIndex = Math.min(
				data.activeToolIndex,
				data.tools.length - 1
			)
		}

		function clearArtboard() {
			paper.project.activeLayer.removeChildren()
			toolInstance?.end()
		}

		function exportSVG() {
			const svg = paper.project.exportSVG({
				bounds: paper.project.activeLayer.strokeBounds,
			})
			const svgText = typeof svg === 'string' ? svg : svg.outerHTML

			downloadAsFile({
				data: svgText,
				filename: 'artboard.svg',
			})
		}

		function moveUpTool() {
			// if (this.activeToolIndex > 0) {
			// 	const activeTool = this.activeTool
			// 	this.activeTool = this.tools[this.activeToolIndex - 1]
			// 	this.tools[this.activeToolIndex - 1] = activeTool
			// 	this.activeToolIndex -= 1
			// }
		}

		function moveDownTool() {
			// if (activeToolIndex.value < data.tools.length - 1) {
			// 	const activeTool = activeTool
			// 	this.activeTool = this.tools[this.activeToolIndex + 1]
			// 	this.tools[this.activeToolIndex + 1] = activeTool
			// 	data.activeToolIndex += 1
			// }
		}

		function downloadTool() {
			if (!toolInstance) return

			const data = toolInstance.exportText()

			downloadAsFile({
				data,
				filename: activeTool.value.meta.label + '.js',
			})
		}

		async function loadToolFromURL(url: string) {
			const received = await axios.get(url)

			const tool = Tool.parse(received.data)

			if (data.tools.findIndex(t => tool.meta.id === t.meta.id) !== -1) {
				console.error('Already has same id: ', url)
				return
			}

			data.tools.push(tool)
			data.activeToolIndex = data.tools.length - 1
		}

		function resetTools() {
			localStorage.clear()
			location.reload()
		}

		function openToolURLPrompt() {
			const url = prompt('Please Enter the URL', '')

			if (url) {
				loadToolFromURL(url)
			}
		}

		function updateParameter(name: string, value: string | number) {
			data.parameters[name] = value
		}

		// Watchers
		watch(
			() => data.tools,
			tools => {
				localStorage.setItem('tools', JSON.stringify(tools))
			},
			{deep: true}
		)

		watch(
			() => [data.parameters, data.parametersCache],
			([cache, params]) => {
				const parameters = {...cache, ...params}
				localStorage.setItem('parametersCache', JSON.stringify(parameters))
			},
			{deep: true}
		)

		return {
			canvas,
			...toRefs(data),
			activeTool,
			isDirty,
			updateParameter,
			resetTools,
			addTool,
			deleteTool,
			moveUpTool,
			moveDownTool,
			openToolURLPrompt,
			recompileActiveTool,
			downloadTool,
			exportSVG,
		}
	},
})
</script>

<style lang="stylus">
@import './style/common.styl'

global-reset()

*, ::after, ::before
	box-sizing border-box
	outline none

html, body
	overflow hidden
	margin 0
	padding 0
	width 100%
	height 100%
	border 0
	color FG

html
	background FG
	font-size 14px
	font-family sans-serif

button, input
	margin 0
	outline none
	border 0
	background none
	color inherit
	font inherit
	appearance none
	-webkit-appearance none

button, input[type=text], input[type=number]
	padding 0.8em
	border 1px solid FG
	color #c6c8c6

button
	&:hover
		background FG
		color BG

input[type=text], input[type=number]
	&:hover
		background SELECTION // lighten(BG, 10)

.menu
	position absolute
	z-index 100
	// width 10em
	background #282a2e
	cursor default

	li
		padding 1em

		&:hover
			background SELECTION

.fill
	position fixed
	top 0
	left 0
	z-index 0
	width 100%
	height 100%

.artboard
	position absolute
	width 100%
	height 100%
	background CANVAS_BG

	&.pan
		cursor grab
		cursor -webkit-grab

.sidebar
	position absolute
	top 0
	right 0
	width 30rem
	height 100%
	transition all 0.2s ease
	transform translateX(100%)

	&.show
		transform none

	&__split
		position absolute
		top 50%
		right 100%
		z-index 20
		margin-top -0.5 * @height
		margin-right 0
		width 1rem
		height 8rem
		border-top-left-radius 5px
		border-bottom-left-radius 5px
		background BG
		text-align center
		font-size 0.8rem
		cursor pointer
		transition all 250ms

		&:before
			position relative
			left 0.1em
			display inline-block
			line-height @height

		&:hover
			width 1.2rem
			background SELECTION

	&.show &__split:before
		left 0.4em

.toolbar
	SIZE = 2.5rem
	position absolute
	top 0.5rem
	left @top
	font-size 0.5 * SIZE
	user-select none

	&__tools
		display flex
		flex-direction column
		align-items flex-start

	li
		position relative
		display flex
		overflow hidden
		margin-bottom 1px
		width auto
		height SIZE
		border-radius 0.5 * SIZE
		background BG
		color CANVAS_BG
		transition all 0.1s ease
		transform-origin 0.5 * SIZE 0.5 * SIZE

		&.active
			transform scale(1)

		&:hover
			transform scale(1)

		&:hover, &.active
			width auto

			label
				padding 0 0.5 * SIZE 0 0
				width auto
				opacity 1

		&:checked
			background red
			transform scale(1)

	input
		display block
		flex 0 0 SIZE
		float left
		width SIZE
		height SIZE
		opacity 0
		cursor pointer

	label
		display block
		overflow hidden
		padding 0
		width 0
		height SIZE
		color CANVAS_BG
		font-size 0.7em
		line-height SIZE
		opacity 0
		transition all 250ms ease

	.icon
		position absolute
		top 0
		left 0
		z-index 10
		width SIZE
		height SIZE
		text-align center
		line-height SIZE
		pointer-events none

		&.tinyletter
			font-size 0.9em
			line-height 1.1 * SIZE

	.add
		width SIZE !important
		border 1px dashed BG
		background CANVAS_BG
		cursor pointer

		&:before
			display block
			width 100%
			height 100%
			color black
			content '+'
			text-align center
			line-height 0.9 * SIZE

.settings-button
	position absolute
	bottom @left
	left 0.5rem
	overflow hidden
	width 2.5rem
	height @width
	border-radius 1.5em
	background-image url('./gear.svg')
	background-position center
	background-size 2em
	background-repeat no-repeat
	cursor pointer
	transition all 250ms ease

	&:hover
		transform scale(1.2) rotate(30deg)

.settings
	position absolute
	bottom 0.8rem
	left 4.5rem
	border 1px solid #d6d6d6
	background CANVAS_BG
	color BG

	li:hover
		background #efefef

.tool-editor
	position relative
	display flex
	flex-direction column
	align-items stretch
	width 100%
	height 100%
	background BG

	&__header
		z-index 10
		display block
		height 3rem
		border-bottom 1px solid SELECTION

		.btn-update
			position absolute
			top -0.1em
			top 0.75em
			right 2.5em
			display inline-block
			margin 0
			padding 0 1em
			border 0
			border-radius 20px
			background SELECTION
			font-size 0.9em
			line-height 1.75em
			cursor pointer

			&:hover
				background-color white

			&.dirty:after
				position absolute
				top 0.7em
				right 0.4em
				display block
				content '*'

		input
			margin-right 1rem
			padding 0.5rem
			border 0px

			&.icon
				margin-right 0
				padding-right 0
				padding-left 0
				width 2em
				height 100%
				background transparent
				text-align center
				font-size 1.5em
				cursor pointer

				&:hover
					color white

			&.label
				position absolute
				top 0.25em
				left 3em
				flex-grow 1
				width calc(100% - 12em)
				height 3em
				background-color transparent
				font-size 0.9rem
				line-height 2.4em
				cursor pointer

				&:hover
					color white

		.btn-menu
			position absolute
			top 0em
			right 0em
			padding 0 0.25em
			border 0
			font-size 1.5rem
			line-height 2em
			cursor pointer

			&:hover
				background-color transparent
				color white

		.menu
			top 3.5rem
			right 0.5rem

	&__editors
		position relative
		margin 1em 1em 0
		height calc(100vh - 7em)

	&__tab, display flex, button
		flex-grow 1
		padding 0
		height 3rem
		border 0
		color #888
		line-height 3rem
		cursor pointer
		transition background-color 250ms

		&.active
			background SELECTION

		&:hover
			background FG
			color CURRENT_LINE
</style>
