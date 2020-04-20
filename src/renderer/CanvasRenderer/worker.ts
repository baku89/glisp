import {MalVal, keywordFor as K} from '@/mal/types'
import printExp from '@/mal/printer'
import {partition} from '@/mal/utils'
import {iterateSegment} from '@/mal/ns/path'
import EventEmitter from 'eventemitter3'
import {ViewerSettings} from './index'

const K_M = K('M'),
	K_L = K('L'),
	K_C = K('C'),
	K_Z = K('Z'),
	K_BACKGROUND = K('background'),
	K_ENABLE_ANIMATION = K('enable-animation'),
	K_FILL = K('fill'),
	K_STROKE = K('stroke'),
	K_PATH = K('path'),
	K_TEXT = K('text'),
	K_TRANSLATE = K('translate'),
	K_SCALE = K('scale'),
	K_ROTATE = K('rotate'),
	K_ARTBOARD = K('artboard'),
	K_STYLE = K('style'),
	K_WIDTH = K('width'),
	K_CAP = K('cap'),
	K_JOIN = K('join'),
	K_DASH = K('dash')

type DrawParams = Map<string, string | number | number[]>

interface DrawStyle {
	type: string
	params: DrawParams
}

class CanvasRendererWorker extends EventEmitter {
	private canvas: OffscreenCanvas
	private ctx: OffscreenCanvasRenderingContext2D
	private dpi!: number

	constructor(canvas: OffscreenCanvas) {
		super()

		this.canvas = canvas

		const ctx = canvas.getContext('2d')

		if (ctx) {
			this.ctx = ctx
		} else {
			throw new Error('Cannot initialize rendering context')
		}
	}

	public resize(width: number, height: number, dpi: number) {
		this.dpi = dpi
		this.canvas.width = width * dpi
		this.canvas.height = height * dpi
	}

	public render(ast: MalVal, settings: ViewerSettings) {
		if (!this.dpi) {
			console.log('trying to render before settings resolution')
		}

		const ctx = this.ctx

		ctx.resetTransform()

		const w = ctx.canvas.width
		const h = ctx.canvas.height
		ctx.clearRect(0, 0, w, h)

		ctx.scale(this.dpi, this.dpi)

		// Apply view transform
		if (settings.viewTransform) {
			const m = settings.viewTransform
			ctx.transform(m[0], m[1], m[3], m[4], m[6], m[7])
		}

		// Set the default line cap
		ctx.lineCap = 'round'
		ctx.lineJoin = 'round'

		// default style
		const defaultStyle: DrawStyle | null = settings.guideColor
			? {
					type: K_STROKE,
					params: new Map<string, string | number | number[]>([
						[K_STYLE, settings.guideColor],
						[K_WIDTH, 1],
						[K_DASH, [2, 4]]
					])
			  }
			: null

		try {
			this.draw(ast, [], defaultStyle)
		} catch (err) {
			console.error(err.stack)
			return false
		}

		return true
	}

	public async getBlob() {
		return await this.canvas.convertToBlob()
	}

	private draw(
		ast: MalVal,
		styles: DrawStyle[],
		defaultStyle: DrawStyle | null
	) {
		const ctx = this.ctx

		if (Array.isArray(ast)) {
			// console.log(ast)
			const [cmd, ...args] = ast as any[]

			const last = args.length > 0 ? args[args.length - 1] : null

			// if (!isKeyword(cmd)) {
			if (typeof cmd !== 'string') {
				for (const a of ast) {
					this.draw(a, styles, defaultStyle)
				}
			} else {
				switch (cmd) {
					case K_FILL:
					case K_STROKE: {
						const style: DrawStyle = {type: cmd, params: args[0]}
						this.draw(last, [style, ...styles], defaultStyle)
						break
					}
					case K_PATH: {
						ctx.beginPath()
						for (const [c, ...a] of iterateSegment(args)) {
							switch (c) {
								case K_M:
									ctx.moveTo(...(a as [number, number]))
									break
								case K_L:
									ctx.lineTo(...(a as [number, number]))
									break
								case K_C:
									ctx.bezierCurveTo(
										...(a as [number, number, number, number, number, number])
									)
									break
								case K_Z:
									ctx.closePath()
									break
								default: {
									throw new Error(`Invalid d-path command: ${printExp(c)}`)
								}
							}
						}
						// Apply Styles
						this.applyDrawStyle(ctx, styles, defaultStyle)
						break
					}
					case K_TEXT: {
						// Text representation:
						// (:text "Text" x y {:option1 value1...})
						const [text, x, y, options] = args
						const settings: any = {
							size: 12,
							font: 'Fira Code',
							align: 'center',
							baseline: 'middle'
						}

						if (options instanceof Map) {
							for (const [k, v] of options.entries()) {
								settings[(k as string).slice(1)] = v
							}
						}

						ctx.font = `${settings.size}px ${settings.font}`
						ctx.textAlign = settings.align as CanvasTextAlign
						ctx.textBaseline = settings.baseline as CanvasTextBaseline

						// Apply Styles
						this.applyDrawStyle(ctx, styles, defaultStyle, text, x, y)

						break
					}
					case K_TRANSLATE:
						ctx.save()
						ctx.translate(args[0] as number, args[1] as number)
						this.draw(last, styles, defaultStyle)
						ctx.restore()
						break
					case K_SCALE:
						ctx.save()
						ctx.scale(args[0] as number, args[1] as number)
						this.draw(last, styles, defaultStyle)
						ctx.restore()
						break
					case K_ROTATE:
						ctx.save()
						ctx.rotate(args[0] as number)
						this.draw(last, styles, defaultStyle)
						ctx.restore()
						break
					case K_BACKGROUND: {
						const color = args[0]
						if (typeof color === 'string' && color !== '') {
							// only execute if the color is valid
							this.emit('set-background', color)
							ctx.fillStyle = color
							ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
						}
						break
					}
					case K_ARTBOARD: {
						const [region, body] = args.slice(1)
						const [x, y, w, h] = region

						// Enable Clip
						ctx.save()
						const clipRegion = new Path2D()
						clipRegion.rect(x, y, w, h)
						ctx.clip(clipRegion)

						// Draw inner items
						this.draw(body, styles, defaultStyle)

						// Restore
						ctx.restore()
						break
					}
					case K_ENABLE_ANIMATION: {
						let fps = args[0]
						fps = 0.1 < fps && fps < 60 ? fps : -1
						this.emit('enable-animation', fps)
						break
					}
					default:
						break
					// printExper.error('Unknown rendering command', printExp(cmd))
				}
			}
		}
	}

	private createFillOrStrokeStyle(
		ctx: OffscreenCanvasRenderingContext2D,
		style: string | any[]
	) {
		if (typeof style === 'string') {
			return style
		} else if (Array.isArray(style)) {
			const [type, params] = style as [string, Map<string, any[]>]
			switch (type) {
				case K('linear-gradient'): {
					const [x0, y0, x1, y1] = params.get(K('points')) as number[]
					const stops = params.get(K('stops')) as (string | number)[]
					const grad = ctx.createLinearGradient(x0, y0, x1, y1)
					for (const [offset, color] of partition(2, stops)) {
						if (typeof offset !== 'number' || typeof color !== 'string') {
							continue
						}
						grad.addColorStop(offset, color)
					}
					return grad
				}
			}
		}
		return ''
	}

	private applyDrawStyle(
		ctx: OffscreenCanvasRenderingContext2D,
		styles: DrawStyle[],
		defaultStyle: DrawStyle | null,
		text?: string,
		x?: number,
		y?: number
	) {
		styles = styles.length > 0 ? styles : defaultStyle ? [defaultStyle] : []

		const isText = text !== undefined

		ctx.save()
		for (const {type, params} of styles) {
			if (type === K_FILL) {
				ctx.fillStyle = this.createFillOrStrokeStyle(
					ctx,
					params.get(K_STYLE) as string
				)
				if (isText) {
					ctx.fillText(text as string, x as number, y as number)
				} else {
					ctx.fill()
				}
			} else if (type === K_STROKE) {
				for (const [k, v] of (params as DrawParams).entries()) {
					switch (k) {
						case K_STYLE:
							ctx.strokeStyle = this.createFillOrStrokeStyle(ctx, v as string)
							break
						case K_WIDTH:
							ctx.lineWidth = v as number
							break
						case K_CAP:
							ctx.lineCap = v as CanvasLineCap
							break
						case K_JOIN:
							ctx.lineJoin = v as CanvasLineJoin
							break
						case K_DASH:
							ctx.setLineDash(v as number[])
					}
				}
				if (isText) {
					ctx.strokeText(text as string, x as number, y as number)
				} else {
					ctx.stroke()
				}
			}
		}
		ctx.restore()
	}
}

let renderer: CanvasRendererWorker

const _self = (self as unknown) as Worker

onmessage = e => {
	const {type, params} = e.data

	switch (type) {
		case 'init': {
			const {canvas} = params
			renderer = new CanvasRendererWorker(canvas)
			renderer.on('enable-animation', (params: any) => {
				_self.postMessage({
					type: 'enable-animation',
					params
				})
			})
			renderer.on('set-background', (params: any) => {
				_self.postMessage({
					type: 'set-background',
					params
				})
			})
			_self.postMessage({type: 'init', params: null})
			break
		}
		case 'resize': {
			const {width, height, dpi} = params
			renderer.resize(width, height, dpi)
			_self.postMessage({type: 'resize', params: null})
			break
		}
		case 'render': {
			const {ast, settings} = params
			const succeed = renderer.render(ast, settings)
			_self.postMessage({
				type: 'render',
				params: succeed
			})
			break
		}
		case 'get-image': {
			renderer.getBlob().then(blob => {
				const reader = new FileReader()
				reader.readAsDataURL(blob)
				reader.onload = e => {
					if (e.target) {
						const data = e.target.result
						_self.postMessage({
							type: 'get-image',
							params: data
						})
					}
				}
			})
			break
		}
	}
}
