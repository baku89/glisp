<template>
	<div class="PageRaster">
		<GlobalMenu2>
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
				>
					<canvas
						class="PageRaster__canvas"
						ref="canvas"
						:width="canvasSize[0]"
						:height="canvasSize[1]"
						:style="{
							transform: `matrix(${viewTransform.join(',')})`,
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
						v-for="name in Object.keys(currentBrush.params)"
						:key="name"
					>
						<dt>{{ toLabel(name) }}</dt>
						<dd>
							<InputControl
								v-bind="currentBrush.params[name]"
								v-model="params[name]"
							/>
						</dd>
					</template>
				</dl>
			</Pane>
			<Pane class="no-padding PageRaster__control" :size="controlPaneWidth">
				<Tab :tabs="['settings', 'code']" initialTab="settings">
					<template #head-settings>
						<SvgIcon mode="inline" style="font-size: 1.2em">
							<path
								d="M28 6 L4 6 M28 16 L4 16 M28 26 L4 26 M24 3 L24 9 M8 13 L8 19 M20 23 L20 29"
							/>
						</SvgIcon>
						Settings
					</template>
					<template #head-code>
						<SvgIcon mode="inline" style="font-size: 1.2em">
							<path d="M10 9 L3 17 10 25 M22 9 L29 17 22 25 M18 7 L14 27" />
						</SvgIcon>
						Code
					</template>
					<template #panel-settings>
						<BrushSettings
							v-model="currentBrush"
							:fragDeclarations="fragDeclarations"
							:shaderErrors="shaderErrors"
						/>
					</template>
					<template #panel-code>
						<MonacoEditor :modelValue="currentBrushCode" lang="yaml" />
					</template>
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
import hotkeys from 'hotkeys-js'
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
import YAML from 'yaml'

import GlobalMenu2, {GlobalMenu2Breadcumb} from '@/components/GlobalMenu2'
import MonacoEditor from '@/components/layouts/MonacoEditor/MonacoEditor.vue'
import SvgIcon from '@/components/layouts/SvgIcon.vue'
import Tab from '@/components/layouts/Tab.vue'
import useScheme from '@/components/use/use-scheme'

import BrushSettings from './BrushSettings.vue'
import BuiltinBrushes from './builtin-brushes'
import InputControl from './InputControl.vue'
import ToolSelector from './ToolSelector.vue'
import useFragShaderValidator from './use-frag-shader-validator'
import {saveViewport} from './webgl-utils'
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
		BrushSettings,
		InputControl,
		ToolSelector,
		GlobalMenu2,
		GlobalMenu2Breadcumb,
		MonacoEditor,
		Pane,
		Splitpanes,
		SvgIcon,
		Tab,
		Zoomable,
	},
	setup() {
		useScheme()

		const viewportEl = templateRef('viewport')
		const canvasEl = templateRef('canvas')

		const controlPaneWidth = useLocalStorage('controlPaneWidth', 50)
		const viewTransform = ref(mat2d.create())

		const canvasSize = ref([1024, 1024])

		const {elementX: viewportX, elementY: viewportY} =
			useMouseInElement(viewportEl)
		const {pressed} = useMousePressed({target: viewportEl})

		const cursorPos = computed(() => {
			const xform = vec2.fromValues(viewportX.value, viewportY.value)
			const xformInv = mat2d.invert(mat2d.create(), viewTransform.value)
			vec2.transformMat2d(xform, xform, xformInv)
			xform[0] = xform[0] / canvasSize.value[0]
			xform[1] = 1 - xform[1] / canvasSize.value[1]
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
		const params = reactive<{[name: string]: any}>({})

		const currentBrushCode = computed(() => YAML.stringify(currentBrush.value))

		// Update brush params
		watch(
			currentBrush,
			(brush, oldBrush) => {
				const oldParams = oldBrush?.params || {}
				const newParams = brush.params

				for (const name in newParams) {
					const param = newParams[name]
					if (oldParams[name]?.type === param.type) {
						continue
					}
					// Set default
					switch (param.type) {
						case 'slider':
						case 'angle':
							params[name] ||= param.default || 0
							break
						case 'color':
							params[name] ||= param.default || '#ffffff'
							break
						case 'seed':
							params[name] ||= Math.random()
							break
					}
				}
			},
			{immediate: true}
		)

		// WebGL contexts
		const regl = shallowRef<Regl.Regl | null>(null)

		const fragDeclarations = computed(() => {
			const variables = _.entries(currentBrush.value.params).map(
				([name, info]) => {
					let glslType: string
					switch (info.type) {
						case 'slider':
						case 'seed':
						case 'angle':
							glslType = 'float'
							break
						case 'color':
							glslType = 'vec4'
							break
					}
					return `uniform ${glslType} ${name};`
				}
			)

			return [
				'precision mediump float;',
				'varying vec2 uv;',
				'uniform sampler2D inputTexture;',
				'uniform vec2 cursor;',
				...variables,
			].join('\n')
		})

		const generatedFrag = computed(() => {
			return [fragDeclarations.value, '#line 1', currentBrush.value.frag].join(
				'\n'
			)
		})

		const {validFrag, shaderErrors} = useFragShaderValidator(
			generatedFrag,
			regl
		)

		const draw = computed(() => {
			if (!regl.value) return null
			const prop = regl.value.prop as any

			const uniforms: {[name: string]: any} = {
				inputTexture: prop('inputTexture'),
				cursor: prop('cursor'),
				..._.mapValues(currentBrush.value.params, (_, n) => prop(n)),
			}

			return regl.value({
				...REGL_QUAD_DEFAULT,
				frag: validFrag.value,
				uniforms,
			})
		})

		const passthru = computed(() => {
			if (!regl.value) return

			return regl.value({
				...REGL_QUAD_DEFAULT,
				frag: `
					precision mediump float;
					uniform sampler2D inputTexture;
					varying vec2 uv;
					void main() {
						gl_FragColor = texture2D(inputTexture, uv);
					}`,
				uniforms: {
					inputTexture: (regl.value.prop as any)('inputTexture'),
				},
			})
		})

		let fbo: [Regl.Framebuffer2D, Regl.Framebuffer2D] | null = null

		onMounted(() => {
			if (!canvasEl.value) return

			const canvas = canvasEl.value as HTMLCanvasElement
			const _gl = Regl({
				attributes: {
					preserveDrawingBuffer: true,
					depth: false,
					premultipliedAlpha: false,
				},
				extensions: ['OES_texture_float'],
				canvas,
			})
			regl.value = _gl

			const fboOptions: Regl.FramebufferOptions = {
				radius: 1024,
				colorType: 'float',
				colorFormat: 'rgba',
			}

			fbo = [_gl.framebuffer(fboOptions), _gl.framebuffer(fboOptions)]

			loadImage('/default_img.jpg')
		})

		function render() {
			if (
				!regl.value ||
				!pressed.value ||
				!draw.value ||
				!passthru.value ||
				!fbo
			)
				return
			const _draw = draw.value

			const options = {
				inputTexture: fbo[1],
				cursor: cursorPos.value,
			}

			const paramDefs = Object.entries(currentBrush.value.params)

			for (const [name, info] of paramDefs) {
				let value = params[name]

				switch (info.type) {
					case 'color':
						value = chroma(value)
							.rgba()
							.map((v, i) => (i < 3 ? v / 255 : v))
						break
				}

				;(options as any)[name] = value
			}

			fbo[0].use(() => _draw(options))

			passthru.value({inputTexture: fbo[0]})

			fbo = [fbo[1], fbo[0]]
		}

		async function loadImage(url: string) {
			if (!regl.value || !fbo || !passthru.value) return

			const _regl = regl.value
			const _fbo = fbo
			const _passthru = passthru.value

			const img = new Image()
			img.src = url
			img.onload = () => {
				const {width, height} = img
				canvasSize.value = [width, height]
				const tex = _regl.texture(img)
				_fbo[1].use(() => _passthru({inputTexture: tex}))
				_passthru({inputTexture: _fbo[1]})
			}
		}

		function saveImage(e: Event) {
			e.preventDefault()
			if (!regl.value) return
			saveViewport(regl.value, 'image.png')
		}

		hotkeys('command+s, ctrl+s', saveImage)

		onUnmounted(() => {
			if (regl.value) regl.value.destroy()
		})

		return {
			canvasSize,
			viewTransform,
			brushes,
			controlPaneWidth,
			currentBrush,
			currentBrushCode,
			currentBrushName,
			fragDeclarations,
			params,
			shaderErrors,
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
		background-checkerboard(10px)
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
