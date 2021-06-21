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
	ref,
	shallowRef,
	watch,
} from 'vue'
import YAML from 'yaml'

import GlobalMenu2, {GlobalMenu2Breadcumb} from '@/components/GlobalMenu2'
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
		Pane,
		Splitpanes,
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
			vec2.div(xform, xform, canvasSize.value as vec2)
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
		const params = useLocalStorage(
			'raster__params',
			{} as {[name: string]: any}
		)

		const brushesCode = computed(() => YAML.stringify(brushes.value, {}))

		// Update brush params
		watch(
			currentBrush,
			(brush, oldBrush) => {
				const newDefs = brush.params
				const oldDefs = oldBrush?.params || newDefs

				for (const name in newDefs) {
					const def = newDefs[name]
					if (oldDefs[name]?.type === def.type && name in params.value) {
						continue
					}
					// Set default
					switch (def.type) {
						case 'slider':
						case 'angle':
							params.value[name] = def.default || 0
							break
						case 'color':
							params.value[name] = def.default || '#ffffff'
							break
						case 'seed':
							params.value[name] = Math.random()
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
						case 'checkbox':
							glslType = 'bool'
					}
					return `uniform ${glslType} ${name};`
				}
			)

			return [
				'precision mediump float;',
				'varying vec2 uv;',
				'uniform sampler2D inputTexture;',
				'uniform vec2 cursor;',
				'uniform float deltaTime;',
				'uniform vec2 resolution;',
				'uniform int frame;',
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

		// Commands
		const drawCommand = computed(() => {
			if (!regl.value) return null
			const prop = regl.value.prop as any

			const uniforms: {[name: string]: any} = {
				inputTexture: prop('inputTexture'),
				cursor: prop('cursor'),
				deltaTime: prop('deltaTime'),
				resolution: prop('resolution'),
				frame: prop('frame'),
				..._.mapValues(currentBrush.value.params, (_, n) => prop(n)),
			}

			return regl.value({
				...REGL_QUAD_DEFAULT,
				frag: validFrag.value,
				uniforms,
			})
		})

		const passthruCommand = computed(() => {
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

		const viewportCommand = computed(() => {
			if (!regl.value) return

			return regl.value({
				...REGL_QUAD_DEFAULT,
				frag: `
					precision mediump float;
					uniform sampler2D inputTexture;
					uniform vec2 resolution;
					varying vec2 uv;

					#define CHECKER_A vec3(1)
					#define CHECKER_B vec3(.87)

					vec4 blendOver(vec4 A, vec4 B) {
						float alpha = B.a + A.a * (1. - B.a);
						vec3 rgb = (B.rgb * B.a + A.rgb * A.a * (1. - B.a)) / alpha;
						return vec4(rgb, alpha);
					}

					float checkerboard(vec2 coord) {
						return mod(
							step(mod(coord.x, 2.), 1.) +
							step(mod(coord.y, 2.), 1.),
							2.0
						);
					}

					void main() {
						vec2 coord = uv * resolution;
						vec4 bg = vec4(mix(CHECKER_A, CHECKER_B, checkerboard(coord / 10.)), 1.);
						vec4 img = texture2D(inputTexture, uv);
						gl_FragColor = blendOver(bg, img);
					}`,
				context: {
					resolution(context) {
						return [context.viewportWidth, context.viewportHeight]
					},
				},
				uniforms: {
					inputTexture: (regl.value.prop as any)('inputTexture'),
					resolution: (regl.value.context as any)('resolution'),
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
			}

			fbo = [_gl.framebuffer(fboOptions), _gl.framebuffer(fboOptions)]

			loadImage('/default_img.jpg')
		})

		function render(context: Regl.DefaultContext) {
			if (
				!regl.value ||
				!pressed.value ||
				!drawCommand.value ||
				!viewportCommand.value ||
				!fbo
			) {
				return
			}

			const _drawCommand = drawCommand.value

			const options = {
				inputTexture: fbo[1],
				cursor: cursorPos.value,
				deltaTime: 1 / 60,
				resolution: canvasSize.value,
				frame: context.tick,
			}

			const paramDefs = Object.entries(currentBrush.value.params)

			for (const [name, info] of paramDefs) {
				let value = params.value[name]

				switch (info.type) {
					case 'color':
						value = chroma(value)
							.rgba()
							.map((v, i) => (i < 3 ? v / 255 : v))
						break
				}

				;(options as any)[name] = value
			}

			fbo[0].use(() => _drawCommand(options))

			viewportCommand.value({inputTexture: fbo[0]})

			fbo = [fbo[1], fbo[0]]
		}

		async function loadImage(url: string) {
			if (!regl.value || !fbo || !passthruCommand.value) return

			const _regl = regl.value
			const _fbo = fbo
			const _passthruCommand = passthruCommand.value

			const img = new Image()
			img.src = url
			img.onload = () => {
				const {width, height} = img
				canvasSize.value = [width, height]
				const tex = _regl.texture(img)
				_fbo[1].use(() => _passthruCommand({inputTexture: tex}))
				_passthruCommand({inputTexture: _fbo[1]})
			}
		}

		function saveImage(e: Event) {
			e.preventDefault()
			if (!regl.value || !fbo || !passthruCommand.value) return

			const _regl = regl.value
			const _fbo = fbo
			const _passthruCommand = passthruCommand.value

			const {width, height} = regl.value._gl.canvas

			const saveFbo = regl.value.framebuffer({width, height})

			saveFbo.use(() => {
				_passthruCommand({inputTexture: _fbo[0]})
				saveViewport(_regl, 'image.png')
			})

			saveFbo.destroy()
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
			brushesCode,
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
