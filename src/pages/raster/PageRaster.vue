<template>
	<div class="PageRaster">
		<GlobalMenu2>
			<template #left>
				<GlobalMenu2Breadcumb :items="[{label: 'Image Editor'}]" />
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
				<Tab :tabs="['settings', 'shader']" initialTab="shader">
					<template #head-settings>
						<SvgIcon mode="inline" style="font-size: 1.2em">
							<path
								d="M28 6 L4 6 M28 16 L4 16 M28 26 L4 26 M24 3 L24 9 M8 13 L8 19 M20 23 L20 29"
							/>
						</SvgIcon>
						Settings
					</template>
					<template #head-shader>
						<SvgIcon mode="inline" style="font-size: 1.2em">
							<rect x="1" y="1" class="st0" width="24" height="24" />
							<line class="st0" x1="1" y1="17" x2="25" y2="17" />
							<line class="st0" x1="1" y1="9" x2="24" y2="9" />
							<line class="st0" x1="17" y1="1" x2="17" y2="25" />
							<line class="st0" x1="9" y1="1" x2="9" y2="24" />
						</SvgIcon>
						Shader
					</template>
					<template #panel-parameters> </template>
					<template #panel-shader>
						<MonacoEditor
							:modelValue="currentBrush.frag"
							:markers="shaderErrors"
							@update:modelValue="onUpdateFrag"
							lang="glsl"
						/>
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

import GlobalMenu2, {GlobalMenu2Breadcumb} from '@/components/GlobalMenu2'
import MonacoEditor from '@/components/layouts/MonacoEditor/MonacoEditor.vue'
import SvgIcon from '@/components/layouts/SvgIcon.vue'
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

		function parseErrorLog(errLog: string | null) {
			if (!errLog) return []

			var result: {line: number; message: string}[] = []
			errLog.split('\n').forEach(function (errMsg) {
				if (errMsg.length < 5) {
					return
				}
				var parts = /^ERROR:\s+(\d+):(\d+):\s*(.*)$/.exec(errMsg)
				if (parts) {
					result.push({
						line: parseInt(parts[2]) || 0,
						message: parts[3].trim(),
					})
				} else if (errMsg.length > 0) {
					result.push({line: 0, message: errMsg})
				}
			})
			return result
		}

		function onUpdateFrag(frag: string) {
			if (!regl.value) return

			const gl = regl.value._gl

			const fragShader = gl.createShader(gl.FRAGMENT_SHADER)
			if (!fragShader) return
			gl.shaderSource(fragShader, frag)
			gl.compileShader(fragShader)

			if (!gl.getShaderParameter(fragShader, gl.COMPILE_STATUS)) {
				const errLog = gl.getShaderInfoLog(fragShader)
				shaderErrors.value = parseErrorLog(errLog)
			} else {
				// Succeed
				shaderErrors.value = []
				brushes.value[currentBrushName.value].frag = frag
			}
		}

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
		let drawFunc = computed(() => {
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

		const shaderErrors = ref<any[]>([])

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
			if (!pressed.value || !drawFunc.value || !inputTexture.value) return

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

			drawFunc.value(params)
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
			shaderErrors,
			onUpdateFrag,
		}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/global.styl'
@import '~@/components/style/common.styl'

html, body
	overflow hidden

glass-bg()
	background base16('00', 0.9)
	backdrop-filter blur(10px)

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
		border-radius $popup-round
		glass-bg()
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
