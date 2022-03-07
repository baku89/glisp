import {unrefElement, useLocalStorage} from '@vueuse/core'
import BezierEasing from 'bezier-easing'
import chroma from 'chroma-js'
import fileDialog from 'file-dialog'
import {mat2d, vec2} from 'gl-matrix'
import gsap from 'gsap'
import _ from 'lodash'
import Regl from 'regl'
import {computed, ref, shallowRef, watch} from 'vue'
import YAML from 'yaml'

import useDraggable from '@/components/use/use-draggable'
import {loadImage as loadImagePromise, readImageAsDataURL} from '@/lib/promise'
import {postTextToGlispServer} from '@/lib/promise'
import {StoreModule} from '@/lib/store'
import {REGL_QUAD_DEFAULT} from '@/lib/webgl'
import {fit01} from '@/utils'

import {BrushDefinition} from '../brush-definition'
import BuiltinBrushes from '../builtin-brushes'
import useFragShaderValidator from '../use-frag-shader-validator'
import {saveViewport} from '../webgl-utils'

export default function useModuleViewport(): StoreModule {
	// WebGL
	const regl = shallowRef<Regl.Regl | null>(null)
	let fbo: [Regl.Framebuffer2D, Regl.Framebuffer2D] | null = null

	// States
	const canvasSize = ref([1024, 1024])

	const viewportEl = ref<Element | null>(null)
	const {
		isMousedown: pressed,
		pos: absoluteCursorPos,
		left: viewportLeft,
		top: viewportTop,
	} = useDraggable(viewportEl as any, {pointerType: ['mouse', 'pen']})

	const transform = ref(mat2d.create())
	const transformTween = ref<gsap.core.Tween | null>(null)

	const cursor = computed(() => {
		const viewportOffset: vec2 = [viewportLeft.value, viewportTop.value]
		const xform = vec2.sub(
			vec2.create(),
			absoluteCursorPos.value,
			viewportOffset
		)
		const xformInv = mat2d.invert(mat2d.create(), transform.value)
		vec2.transformMat2d(xform, xform, xformInv)
		return vec2.div(xform, xform, canvasSize.value as vec2)
	})
	const prevCursor = ref(vec2.clone(cursor.value))

	const zoomFactor = computed(() => {
		const xform = transform.value
		const axis = vec2.fromValues(xform[0], xform[1])
		return vec2.len(axis)
	})

	// brush
	const brushes = useLocalStorage('raster__brushes', BuiltinBrushes)
	const currentBrushName = useLocalStorage<string | null>(
		'raster__currentBrushName',
		'brush'
	)
	if (
		currentBrushName.value === null ||
		!(currentBrushName.value in brushes.value)
	) {
		currentBrushName.value = null
	}

	const currentBrush = computed({
		get: () =>
			currentBrushName.value === null
				? null
				: brushes.value[currentBrushName.value],
		set: v => {
			const name = currentBrushName.value
			if (name !== null && v) brushes.value[name] = v
		},
	})

	const params = useLocalStorage('raster__params', {} as Record<string, any>)

	// uniformData
	const uniformData = computed(() => {
		if (!regl.value || !currentBrush.value) return {}

		const defs = Object.entries(currentBrush.value.params)

		const data = {} as Record<string, any>

		const textureCache = {} as Record<string, Regl.Texture2D>

		for (const [name, def] of defs) {
			let uniformName = name
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
					uniformName += 'Texture'

					const [x1, y1, x2, y2] = value as number[]
					const easing = BezierEasing(x1, y1, x2, y2)
					const data = _.times(32, i => easing(i / 31))
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

			data[uniformName] = value
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
				const current = params.value[name]
				switch (def.type) {
					case 'slider':
					case 'angle':
						params.value[name] = _.isNumber(current)
							? current
							: def.default || 0
						break
					case 'seed':
						params.value[name] = _.isNumber(current) ? current : Math.random()
						break
					case 'color':
						params.value[name] = _.isString(current)
							? current
							: def.default || '#ffffff'
						break
					case 'dropdown':
						params.value[name] = _.isString(current)
							? current
							: def.default || def.items.split(',')[0] || ''
						break
					case 'cubicBezier':
						params.value[name] = _.isArray(current)
							? current
							: def.default || [0.5, 0, 0.5, 1]
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
			prevCursor.value = cursor.value
			cancelRender = regl.value.frame(render)
		} else {
			if (cancelRender) cancelRender.cancel()
		}
	})

	// Commands
	const drawCommand = computed(() => {
		if (!regl.value || !currentBrush.value) return null
		const prop = regl.value.prop as any

		const uniforms: Record<string, any> = {
			inputTexture: prop('inputTexture'),
			cursor: prop('cursor'),
			prevCursor: prop('prevCursor'),
			deltaTime: prop('deltaTime'),
			resolution: prop('resolution'),
			frame: prop('frame'),
			..._.chain(currentBrush.value.params)
				.mapKeys((p, k) => (p.type === 'cubicBezier' ? `${k}Texture` : k))
				.mapValues((_, k) => prop(k))
				.value(),
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
						const fnName = name
						name += 'Texture'
						glslType = 'sampler2D'
						defines = [`#define ${fnName}(t) texture2D(${name}, vec2(t, 0)).r`]
						break
					}
				}
				return [`uniform ${glslType} ${name};`, ...defines]
			}
		)

		return [
			'precision mediump float;',
			'varying vec2 uv;                // normalized uv',
			'uniform sampler2D inputTexture; // input image',
			'uniform vec2 cursor;            // cursor coordinate (in UV)',
			'uniform vec2 prevCursor;        // previous position of cursor',
			'uniform float deltaTime;        // render time (in sec)',
			'uniform vec2 resolution;        // artboard resolution (in px)',
			'uniform int frame;              // frame number',
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
			cursor: cursor.value,
			prevCursor: prevCursor.value,
			deltaTime: 1 / 60,
			resolution: canvasSize.value,
			frame: context.tick,
			...uniformData.value,
		}

		fbo[0].use(() => _drawCommand(options))
		viewportCommand.value({inputTexture: fbo[0]})

		prevCursor.value = cursor.value
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

		tex.destroy()

		setTimeout(() => {
			_viewportCommand({inputTexture: _fbo[0]})
		}, 1)
	}

	function downloadImage({name}: {name: string}) {
		if (!regl.value || !fbo || !passthruCommand.value) return

		const _regl = regl.value
		const _fbo = fbo
		const _passthruCommand = passthruCommand.value

		const {width, height} = regl.value._gl.canvas

		const saveFbo = regl.value.framebuffer({width, height})

		saveFbo.use(() => {
			_passthruCommand({inputTexture: _fbo[0]})
			saveViewport(_regl, `${name}.png`)
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
		viewportEl.value = unrefElement(viewport)

		const _regl = Regl({
			attributes: {
				preserveDrawingBuffer: true,
				depth: false,
				premultipliedAlpha: false,
			},
			extensions: ['OES_texture_float', 'OES_texture_float_linear'],
			canvas,
		})
		regl.value = _regl

		fbo = [createFbo(), createFbo()]

		function createFbo() {
			const f = _regl.framebuffer({
				radius: 1024,
				colorType: 'float',
			})

			// Unsafe code
			const colorTex = ((f as any).color as Regl.Texture2D[])[0]
			colorTex({
				mag: 'linear',
				min: 'linear',
				width: colorTex.width,
				height: colorTex.height,
				type: colorTex.type,
			})

			return f
		}
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
			brushParams: params,
			currentBrush,
			currentBrushName,
			canvasSize,
			fragDeclarations,
			shaderErrors,
			transform,
			zoomFactor,
		},
		actions: {
			setupElements: {
				exec: setupElements,
			},
			loadImage: {
				label: 'Load Image',
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
			copyBrushUrl: {
				label: 'Copy Current Brush URL',
				icon: '<path d="M12 2 L12 6 20 6 20 2 12 2 Z M11 4 L6 4 6 30 26 30 26 4 21 4" />',
				async exec(name: string) {
					if (!(name in brushes.value)) {
						throw new Error(`Cannot find the brush named ${name}`)
					}

					const data = YAML.stringify({
						[name]: brushes.value[name],
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
			copyBrushYaml: {
				label: 'Copy Current Brush in YAML',
				icon: '<path d="M12 2 L12 6 20 6 20 2 12 2 Z M11 4 L6 4 6 30 26 30 26 4 21 4" />',
				async exec(name: string) {
					if (!(name in brushes.value)) {
						throw new Error(`Cannot find the brush named ${name}`)
					}

					const data = YAML.stringify({
						[name]: currentBrush.value,
					})

					navigator.clipboard.writeText(data)
				},
			},
			setTransform: {
				exec(xform: mat2d) {
					if (transformTween.value) {
						transformTween.value.kill()
						transformTween.value = null
					}
					transform.value = xform
				},
			},
			fitTransformToScreen: {
				label: 'Fit Artboard to Screen',
				icon: `<circle cx="14" cy="14" r="12" />
					<path d="M23 23 L30 30" />
					<path d="M9 12 L9 9 12 9 M16 9 L19 9 19 12 M9 16 L9 19 12 19 M19 16 L19 19 16 19" />`,
				exec() {
					if (!viewportEl.value) return

					const {width: vw, height: vh} =
						viewportEl.value.getBoundingClientRect()
					const [cw, ch] = canvasSize.value
					const sx = vw / cw,
						sy = vh / ch
					const zoom = Math.min(sx, sy)

					const offset =
						sx < sy
							? vec2.fromValues(0, (vh - ch * zoom) / 2)
							: vec2.fromValues((vw - cw * zoom) / 2, 0)

					const xform = mat2d.identity(mat2d.create())

					mat2d.translate(xform, xform, offset)
					mat2d.scale(xform, xform, vec2.fromValues(zoom, zoom))

					const props = {t: 0}
					const start = transform.value as number[]
					const end = xform

					transformTween.value = gsap.to(props, {
						duration: 0.1,
						t: 1,
						ease: 'power2.inOut',
						onUpdate() {
							transform.value = start.map((v, i) =>
								fit01(props.t, v, end[i])
							) as mat2d
						},
					})
				},
			},
			updateCurrentBrush: {
				exec(brush: BrushDefinition) {
					if (!currentBrushName.value) return
					brushes.value[currentBrushName.value] = brush
				},
			},
			switchBrush: {
				exec(name: string) {
					currentBrushName.value = name
				},
			},
			setBrushes: {
				exec(newBrushes: typeof brushes['value']) {
					brushes.value = newBrushes
				},
			},
			setBrushParams: {
				exec(newParams: typeof params['value']) {
					params.value = newParams
				},
			},
			resetBuiltinBrushes: {
				label: 'Reset Built-in Brushes',
				icon: `<path
				d="M15,21L29,7c1.1-1.1,1.1-2.9,0-4l0,0c-1.1-1.1-2.9-1.1-4,0L11,17L15,21z"/>
				<path d="M11,17c-6,0-3.9,6.3-9,8c-0.7,0.2-0.9,1.5-0.3,1.7c8.8,3,13.3-1.6,13.2-5.7"/>`,
				exec() {
					brushes.value = {...brushes.value, ...BuiltinBrushes}
				},
			},
			reload: {
				label: 'Reload App',
				icon: '<path d="M29 16 C29 22 24 29 16 29 8 29 3 22 3 16 3 10 8 3 16 3 21 3 25 6 27 9 M20 10 L27 9 28 2" />',
				exec() {
					brushes.value = {...brushes.value, ...BuiltinBrushes}
					window.location.href = 'https://niu.design/megei'
				},
			},
		},
	}
}
