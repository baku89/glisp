import {useLocalStorage, useMouseInElement, useMousePressed} from '@vueuse/core'
import chroma from 'chroma-js'
import fileDialog from 'file-dialog'
import {mat2d, vec2} from 'gl-matrix'
import _ from 'lodash'
import Regl from 'regl'
import {
	computed,
	onMounted,
	onUnmounted,
	Ref,
	ref,
	shallowRef,
	watch,
} from 'vue'

import {loadImage as loadImagePromise, readImageAsDataURL} from '@/lib/promise'

import Action from './action'
import {BrushDefinition} from './brush-definition'
import useFragShaderValidator from './use-frag-shader-validator'
import {saveViewport} from './webgl-utils'

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

export default function useViewport({
	canvasEl,
	viewportEl,
	currentBrush,
}: {
	canvasEl: Ref<Element | null>
	viewportEl: Ref<Element | null>
	currentBrush: Ref<BrushDefinition>
}) {
	// WebGL
	const regl = shallowRef<Regl.Regl | null>(null)
	let fbo: [Regl.Framebuffer2D, Regl.Framebuffer2D] | null = null

	// States
	const canvasSize = ref([1024, 1024])

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

	// Brueh
	const params = useLocalStorage('raster__params', {} as {[name: string]: any})

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
					case 'seed':
						params.value[name] = Math.random()
						break
					case 'color':
						params.value[name] = def.default || '#ffffff'
						break
					case 'dropdown':
						params.value[name] = def.default || def.items.split(',')[0] || ''
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

	// WebGL contexts
	const fragDeclarations = computed(() => {
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
		return [fragDeclarations.value, '#line 1', currentBrush.value.frag].join(
			'\n'
		)
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
		}

		const defs = Object.entries(currentBrush.value.params)

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
			}

			;(options as any)[name] = value
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
	})

	// First render
	const didFirstRender = watch(viewportCommand, cmd => {
		if (!cmd || !fbo) return
		cmd({inputTexture: fbo[0]})
		didFirstRender()
	})

	onUnmounted(() => {
		if (regl.value) regl.value.destroy()
	})

	return {
		state: {
			canvasSize,
			fragDeclarations,
			params,
			shaderErrors,
			viewTransform,
		},
		methods: {
			loadImage,
		},
		actions: {
			open_image: {
				name: 'Open Image',
				icon: '<path d="M4 28 L28 28 30 12 14 12 10 8 2 8 Z M28 12 L28 4 4 4 4 8"/>',
				async exec() {
					const image = (await fileDialog({accept: 'image/*'}))[0]
					if (!image) return
					const url = await readImageAsDataURL(image)
					loadImage(url)
				},
			},
			download_image: {
				name: 'Download Image',
				icon: '<path d="M9 22 C0 23 1 12 9 13 6 2 23 2 22 10 32 7 32 23 23 22 M11 26 L16 30 21 26 M16 16 L16 30" />',
				exec: downloadImage,
			},
		} as Record<string, Action>,
	}
}
