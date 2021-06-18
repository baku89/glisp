<template>
	<div class="PageRaster">
		<menu class="PageRaster__gmenu">
			<h1 class="PageRaster__gmenu-title">'(GLISP)</h1>
			<h2>Top > Programmable Image Editor</h2>
		</menu>
		<Splitpanes class="glisp-theme" @resize="controlPaneWidth = $event[1].size">
			<Pane
				class="no-padding PageRaster__viewport"
				:size="100 - controlPaneWidth"
			>
				<Zoomable
					class="PageRaster__zoomable"
					v-model:transform="viewTransform"
					ref="viewport"
				>
					<canvas
						class="PageRaster__canvas"
						ref="canvas"
						:style="{
							transform: `matrix(${viewTransform.join(',')})`,
						}"
					/>
				</Zoomable>
				<ToolSelector
					class="PageRaster__tool-selector"
					v-model="currentBrushName"
					:tools="brushes"
				/>
				<dl class="PageRaster__parameters">
					<template
						v-for="name in Object.keys(currentBrush.parameters)"
						:key="name"
					>
						<dt>{{ name }}</dt>
						<dd>
							<InputControl
								v-bind="currentBrush.parameters[name]"
								v-model="parameters[name]"
							/>
						</dd>
					</template>
				</dl>
			</Pane>
			<Pane class="no-padding PageRaster__control" :size="controlPaneWidth">
				<Tab :tabs="['parameters', 'shader']" initialTab="control">
					<template #panel-parameters> </template>
					<template #panel-shader> </template>
				</Tab>
			</Pane>
		</Splitpanes>
	</div>
	<div class="PageRaster__bg" />
</template>

<script lang="ts">
import 'normalize.css'
import 'splitpanes/dist/splitpanes.css'

import {
	templateRef,
	useLocalStorage,
	useMouseInElement,
	useMousePressed,
} from '@vueuse/core'
import chroma from 'chroma-js'
import {mat2d, vec2} from 'gl-matrix'
import _ from 'lodash'
import Regl from 'regl'
import {Pane, Splitpanes} from 'splitpanes'
import {
	computed,
	defineComponent,
	onMounted,
	onUnmounted,
	reactive,
	ref,
	shallowRef,
	watch,
} from 'vue'

import Tab from '@/components/layouts/Tab.vue'
import useScheme from '@/components/use/use-scheme'

import BuiltinBrushes from './builtin-brushes'
import InputControl from './InputControl.vue'
import ToolSelector from './ToolSelector.vue'
import Zoomable from './Zoomable.vue'

const REGL_QUAD_DEFAULT: Regl.DrawConfig = {
	vert: `
	precision mediump float;
	attribute vec2 position;
	varying vec2 uv;
	void main() {
		uv = position / 2.0 + 0.5;
		gl_Position = vec4(position, 0, 1);
	}`,
	attributes: {
		position: [-1, -1, 1, -1, -1, 1, 1, 1],
	},
	depth: {
		enable: false,
	},
	count: 4,
	primitive: 'triangle strip',
}

export default defineComponent({
	name: 'PageRaster',
	components: {
		Splitpanes,
		Pane,
		Tab,
		Zoomable,
		InputControl,
		ToolSelector,
	},
	setup() {
		useScheme()

		const viewportEl = templateRef('viewport')
		const canvasEl = templateRef('canvas')

		const controlPaneWidth = useLocalStorage('controlPaneWidth', 50)
		const viewTransform = ref(mat2d.create())

		const imgUrl = '/default_img.jpg'
		const imgSize = ref(vec2.fromValues(1, 1))

		const {elementX: viewportX, elementY: viewportY} =
			useMouseInElement(viewportEl)
		const {pressed} = useMousePressed({target: viewportEl})

		const cursorPos = computed(() => {
			const xform = vec2.fromValues(viewportX.value, viewportY.value)
			const xformInv = mat2d.invert(mat2d.create(), viewTransform.value)
			vec2.transformMat2d(xform, xform, xformInv)
			xform[0] = xform[0] / imgSize.value[0]
			xform[1] = 1 - xform[1] / imgSize.value[1]
			return xform
		})

		// Render
		let cancelRender: Regl.Cancellable | null = null
		watch(pressed, pressed => {
			if (!regl.value) return

			if (pressed) {
				cancelRender = regl.value.frame(render)
			} else {
				if (cancelRender) cancelRender.cancel()
			}
		})

		// Brushes
		const brushes = ref(BuiltinBrushes)
		const currentBrushName = ref('brush')
		const currentBrush = computed(() => brushes.value[currentBrushName.value])
		const parameters = reactive<{[name: string]: any}>({})

		// Update brush parameters
		watch(
			currentBrushName,
			(brushName, prevBrushName) => {
				const oldParams = prevBrushName
					? brushes.value[prevBrushName].parameters
					: {}
				const newParams = brushes.value[brushName].parameters

				for (const name in newParams) {
					const param = newParams[name]
					if (oldParams[name]?.type === param.type) {
						continue
					}
					// Set default
					switch (param.type) {
						case 'slider':
							parameters[name] = param.initial || 0
							break
						case 'color':
							parameters[name] = param.initial || '#ffffff'
							break
						case 'seed':
							parameters[name] = Math.random()
							break
					}
				}
			},
			{immediate: true}
		)

		// WebGL contexts
		let regl = shallowRef<Regl.Regl | null>(null)
		let updateFunc = computed(() => {
			if (!regl.value) return null
			const prop = regl.value.prop as any

			const uniforms: {[name: string]: any} = {
				inputTexture: prop('inputTexture'),
				cursor: prop('cursor'),
				..._.mapValues(currentBrush.value.parameters, (_, n) => prop(n)),
			}

			return regl.value({
				...REGL_QUAD_DEFAULT,
				frag: currentBrush.value.frag,
				uniforms,
			})
		})
		const inputTexture = shallowRef<Regl.Texture2D | null>(null)
		watch(inputTexture, (_, old) => old?.destroy())

		onMounted(() => {
			if (!canvasEl.value) return

			const canvas = canvasEl.value as HTMLCanvasElement
			const _gl = Regl(canvas)
			regl.value = _gl

			inputTexture.value = _gl.texture()

			const passthru = _gl({
				...REGL_QUAD_DEFAULT,
				frag: `
					precision mediump float;
					uniform sampler2D inputTexture;
					varying vec2 uv;
					void main() {
						gl_FragColor = texture2D(inputTexture, uv);
					}`,
				uniforms: {
					inputTexture: (_gl.prop as any)('inputTexture'),
				},
			})

			const img = new Image()
			img.src = imgUrl

			img.onload = () => {
				imgSize.value = vec2.fromValues(img.width, img.height)
				canvas.width = img.width
				canvas.height = img.height
				inputTexture.value = _gl.texture({
					wrapS: 'mirror',
					wrapT: 'mirror',
					data: img,
				})

				const c = _gl.frame(() => {
					passthru({inputTexture: inputTexture.value})
					c.cancel()
				})
			}
		})

		function render() {
			if (!pressed.value || !updateFunc.value || !inputTexture.value) return

			const params = {
				inputTexture: inputTexture.value,
				cursor: cursorPos.value,
			}

			const paramDefs = Object.entries(currentBrush.value.parameters)

			for (const [name, info] of paramDefs) {
				let value = parameters[name]

				switch (info.type) {
					case 'color':
						value = chroma(value)
							.rgba()
							.map((v, i) => (i < 3 ? v / 255 : v))
						break
				}

				;(params as any)[name] = value
			}

			updateFunc.value(params)
			inputTexture.value({copy: true})
		}

		onUnmounted(() => {
			if (regl.value) regl.value.destroy()
		})

		return {
			viewTransform,
			controlPaneWidth,
			currentBrushName,
			brushes,
			currentBrush,
			parameters,
		}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/global.styl'
@import '~@/components/style/common.styl'

$height = 3.4em

html, body
	overflow hidden

glass-bg()
	background base16('00', 0.9)
	backdrop-filter blur(10px) grayscale(1)

.PageRaster
	app()
	height 100vh
	background transparent
	grid-template-rows $height 1fr

	&__bg
		position fixed
		z-index -20
		background base16('00')
		inset 0

	&__gmenu
		position relative
		display flex
		overflow visible
		height $height
		border-bottom 1px solid $color-frame
		glass-bg()
		user-select none

		&-title
			position relative
			overflow hidden
			margin 0 0 0 0.5em
			width $height
			height $height
			background base16('05')
			background-size 100% 100%
			text-align center
			text-indent 10em
			font-weight normal
			font-size 1em
			mask-image url('../../logo.png')
			mask-size 60% 60%
			mask-repeat no-repeat
			mask-position 50% 50%

		h2
			margin 0
			margin-left 1em
			padding 0
			font-size 1em
			line-height $height

	&__viewport
		position relative
		overflow hidden !important

	&__tool-selector
		position absolute
		top 1em
		left 1em

	&__control
		glass-bg()

	&__zoomable
		width 100%
		height 100%

	&__canvas
		position fixed
		z-index -10
		display block
		transform-origin 0 0
		pointer-events none

	&__parameters
		position absolute
		top 1em
		right 1em
		display grid
		padding 1em
		border 1px solid $color-frame
		border-radius 4px
		background base16('00', 0.7)
		backdrop-filter blur(10px)
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
