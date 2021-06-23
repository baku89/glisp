import {useLocalStorage, useMouseInElement, useMousePressed} from '@vueuse/core'
import BezierEasing from 'bezier-easing'
import chroma from 'chroma-js'
import fileDialog from 'file-dialog'
import {mat2d, vec2} from 'gl-matrix'
import _ from 'lodash'
import Regl from 'regl'
import {computed, ref, shallowRef, watch} from 'vue'
import YAML from 'yaml'

import {loadImage as loadImagePromise, readImageAsDataURL} from '@/lib/promise'
import {postTextToGlispServer} from '@/lib/promise'
import {StoreModule} from '@/lib/store'

import {BrushDefinition} from '../brush-definition'
import BuiltinBrushes from '../builtin-brushes'
import useFragShaderValidator from '../use-frag-shader-validator'
import {saveViewport} from '../webgl-utils'

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

export default function useModuleViewport(): StoreModule {
	// WebGL
	const regl = shallowRef<Regl.Regl | null>(null)
	let fbo: [Regl.Framebuffer2D, Regl.Framebuffer2D] | null = null

	// States
	const canvasSize = ref([1024, 1024])

	const viewportEl = ref<Element | null>(null)
	const {elementX: viewportX, elementY: viewportY} =
		useMouseInElement(viewportEl)
	const {pressed} = useMousePressed({target: viewportEl})

	const viewTransform = ref(mat2d.create())

	const cursorPos = computed(() => {
		const xform = vec2.fromValues(viewportX.value, viewportY.value)
		const xformInv = mat2d.invert(mat2d.create(), viewTransform.value)
		vec2.transformMat2d(xform, xform, xformInv)
		return vec2.div(xform, xform, canvasSize.value as vec2)
	})

	const zoomFactor = computed(() => {
		const xform = viewTransform.value
		const axis = vec2.fromValues(xform[0], xform[1])
		return vec2.len(axis)
	})

	// brush
	const brushes = useLocalStorage('raster__brushes', BuiltinBrushes)
	const currentBrushName = useLocalStorage('raster__currentBrushName', 'brush')
	if (!(currentBrushName.value in brushes.value)) {
		currentBrushName.value = _.keys(brushes.value)[0]
	}

	const currentBrush = computed({
		get: () => brushes.value[currentBrushName.value],
		set: v => {
			brushes.value[currentBrushName.value] = v
		},
	})

	const params = useLocalStorage('raster__params', {} as {[name: string]: any})

	// uniformData
	const uniformData = computed(() => {
		if (!regl.value || !currentBrush.value) return {}

		const defs = Object.entries(currentBrush.value.params)

		const data = {} as Record<string, any>

		const textureCache = {} as Record<string, Regl.Texture2D>

		for (const [name, def] of defs) {
			let value = params.value[name]

			switch (def.type) {
				case 'color':
					value = chroma(value)
						.rgba()
						.map((v, i) => (i < 3 ? v / 255 : v))
					break
				case 'dropdown':
					value = def.items.split(',').indexOf(value)
					break
				case 'cubicBezier': {
					textureCache[name]?.destroy()

					const [x1, y1, x2, y2] = value as number[]
					const easing = BezierEasing(x1, y1, x2, y2)
					const data = Array(32)
						.fill(0)
						.map((_, i) => easing(i / 31))
					value = regl.value.texture({
						width: 32,
						height: 1,
						format: 'luminance',
						type: 'float32',
						mag: 'linear',
						data: new Float32Array(data),
					})
					textureCache[name] = value
					break
				}
			}

			data[name] = value
		}
		return data
	})

	// Update brush params
	watch(
		currentBrush,
		(brush, oldBrush) => {
			if (!brush) return

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
					case 'seed':
						params.value[name] = Math.random()
						break
					case 'color':
						params.value[name] = def.default || '#ffffff'
						break
					case 'dropdown':
						params.value[name] = def.default || def.items.split(',')[0] || ''
						break
					case 'cubicBezier':
						params.value[name] = def.default || [0.5, 0, 0.5, 1]
						break
				}
			}
		},
		{immediate: true}
	)

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

	// Commands
	const drawCommand = computed(() => {
		if (!regl.value || !currentBrush.value) return null
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

	// WebGL contexts
	const fragDeclarations = computed(() => {
		if (!currentBrush.value) return ''

		const variables = _.entries(currentBrush.value.params).map(
			([name, def]) => {
				let glslType: string
				let defines: string[] = []

				switch (def.type) {
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
						break
					case 'dropdown': {
						glslType = 'int'
						const prefix = _.toUpper(_.snakeCase(name))
						defines = def.items
							.split(',')
							.map(
								(v, i) => `#define ${prefix}_${_.toUpper(_.snakeCase(v))} ${i}`
							)
						break
					}
					case 'cubicBezier': {
						glslType = 'sampler2D'
						break
					}
				}
				return [`uniform ${glslType} ${name};`, ...defines]
			}
		)

		return [
			'precision mediump float;',
			'varying vec2 uv;                  // normalized uv',
			'uniform sampler2D inputTexture;   // input image',
			'uniform vec2 cursor;              // cursor coordinate (in UV)',
			'uniform float deltaTime;          // render time (in sec)',
			'uniform vec2 resolution;          // artboard resolution (in px)',
			'uniform int frame;                // frame number',
			...variables,
		]
			.flat()
			.join('\n')
	})

	const generatedFrag = computed(() => {
		return !currentBrush.value
			? ''
			: [fragDeclarations.value, '#line 1', currentBrush.value.frag].join('\n')
	})

	const {validFrag, shaderErrors} = useFragShaderValidator(generatedFrag, regl)

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

		fbo = [fbo[1], fbo[0]]

		const options = {
			inputTexture: fbo[1],
			cursor: cursorPos.value,
			deltaTime: 1 / 60,
			resolution: canvasSize.value,
			frame: context.tick,
			...uniformData.value,
		}

		fbo[0].use(() => _drawCommand(options))
		viewportCommand.value({inputTexture: fbo[0]})
	}

	async function loadImage(url: string) {
		if (!regl.value || !fbo || !passthruCommand.value || !viewportCommand.value)
			return

		const _regl = regl.value
		const _fbo = fbo
		const _passthruCommand = passthruCommand.value
		const _viewportCommand = viewportCommand.value

		const img = await loadImagePromise(url)
		const {width, height} = img
		canvasSize.value = [width, height]
		const tex = _regl.texture(img)

		_fbo[0].resize(width, height)
		_fbo[1].resize(width, height)

		_fbo[0].use(() => _passthruCommand({inputTexture: tex}))
		_fbo[1].use(() => _passthruCommand({inputTexture: tex}))

		tex.destroy()

		setTimeout(() => {
			_viewportCommand({inputTexture: _fbo[0]})
		}, 1)
	}

	function downloadImage() {
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

	// Hooks
	function setupElements({
		viewport,
		canvas,
	}: {
		viewport: Element
		canvas: HTMLCanvasElement
	}) {
		viewportEl.value = viewport

		const _gl = Regl({
			attributes: {
				preserveDrawingBuffer: true,
				depth: false,
				premultipliedAlpha: false,
			},
			extensions: ['OES_texture_float', 'OES_texture_float_linear'],
			canvas,
		})
		regl.value = _gl

		const fboOptions: Regl.FramebufferOptions = {
			radius: 1024,
			colorType: 'float',
		}

		fbo = [_gl.framebuffer(fboOptions), _gl.framebuffer(fboOptions)]
	}

	// First render
	const didFirstRender = watch(viewportCommand, cmd => {
		if (!cmd || !fbo) return
		cmd({inputTexture: fbo[0]})
		didFirstRender()
	})

	return {
		state: {
			brushes,
			currentBrush,
			currentBrushName,
			canvasSize,
			fragDeclarations,
			params,
			shaderErrors,
			viewTransform,
			zoomFactor,
		},
		actions: {
			setupElements: {
				exec: setupElements,
			},
			loadImage: {
				label: 'Load Iamge',
				exec: loadImage,
			},
			openImage: {
				label: 'Open Image',
				icon: '<path d="M4 28 L28 28 30 12 14 12 10 8 2 8 Z M28 12 L28 4 4 4 4 8"/>',
				async exec() {
					const image = (await fileDialog({accept: 'image/*'}))[0]
					if (!image) return
					const url = await readImageAsDataURL(image)
					loadImage(url)
				},
			},
			downloadImage: {
				label: 'Download Image',
				icon: '<path d="M9 22 C0 23 1 12 9 13 6 2 23 2 22 10 32 7 32 23 23 22 M11 26 L16 30 21 26 M16 16 L16 30" />',
				exec: downloadImage,
			},
			addBrush: {
				exec({name, brush}: {name: string; brush: BrushDefinition}) {
					let doAppend = false

					if (name in brushes.value) {
						// Compare
						const existingBrush = brushes.value[name]
						if (!_.isEqual(brush, existingBrush)) {
							const msg =
								`A brush named ${brush.label} has already existed. ` +
								'Are you sure to overwrite it?'

							if (confirm(msg)) doAppend = true
						}
					} else {
						doAppend = true
					}
					if (doAppend) {
						const newBrushes = {...brushes.value}
						newBrushes[name] = brush
						brushes.value = newBrushes
						currentBrushName.value = name
					}
				},
			},
			copyCurrentBrushUrl: {
				label: 'Copy Current Brush URL',
				icon: '<path d="M12 2 L12 6 20 6 20 2 12 2 Z M11 4 L6 4 6 30 26 30 26 4 21 4" />',
				async exec() {
					const data = YAML.stringify({
						[currentBrushName.value]: currentBrush.value,
					})
					const result = await postTextToGlispServer(
						'raster_brush',
						'name',
						data
					)

					const url = new URL(window.location.href)
					url.searchParams.set('action', 'load_brush')
					url.searchParams.set('d', result.id.toString())
					navigator.clipboard.writeText(url.toString())
				},
			},
			copyCurrentBrushYaml: {
				label: 'Copy Current Brush in YAML',
				icon: '<path d="M12 2 L12 6 20 6 20 2 12 2 Z M11 4 L6 4 6 30 26 30 26 4 21 4" />',
				async exec() {
					const data = YAML.stringify({
						[currentBrushName.value]: currentBrush.value,
					})
					navigator.clipboard.writeText(data)
				},
			},
		},
	}
}
