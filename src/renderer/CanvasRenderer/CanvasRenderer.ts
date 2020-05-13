import {
	MalVal,
	keywordFor as K,
	isMap,
	isKeyword,
	LispError,
	MalMap
} from '@/mal/types'
import printExp from '@/mal/printer'
import {partition} from '@/utils'
import {iterateSegment, PathType} from '@/mal-lib/path'
import {ViewerSettings} from './index'

const K_G = K('g'),
	K_M = K('M'),
	K_L = K('L'),
	K_C = K('C'),
	K_Z = K('Z'),
	K_BACKGROUND = K('background'),
	K_ENABLE_ANIMATION = K('enable-animation'),
	K_PATH = K('path'),
	K_TEXT = K('text'),
	K_TRANSFORM = K('transform'),
	K_ARTBOARD = K('artboard'),
	// Styles
	K_STYLE = K('style'),
	K_FILL = K('fill'),
	K_STROKE = K('stroke'),
	K_FILL_COLOR = K('fill-color'),
	K_STROKE_COLOR = K('stroke-color'),
	K_STROKE_WIDTH = K('stroke-width'),
	K_STROKE_CAP = K('stroke-cap'),
	K_STROKE_JOIN = K('stroke-join'),
	K_STROKE_DASH = K('stroke-dash'),
	K_POINTS = K('points'),
	K_STOPS = K('stops'),
	K_LINEAR_GRADIENT = K('linear-gradient')

type Canvas = HTMLCanvasElement | OffscreenCanvas

type CanvasContext =
	| CanvasRenderingContext2D
	| OffscreenCanvasRenderingContext2D

export default class CanvasRenderer {
	private ctx!: CanvasContext
	private dpi!: number

	constructor(private canvas: Canvas) {
		const ctx = this.canvas.getContext('2d')

		if (ctx) {
			this.ctx = ctx
		} else {
			throw new Error('Cannot initialize rendering context')
		}
	}

	public async resize(width: number, height: number, dpi: number) {
		this.dpi = dpi
		this.canvas.width = width * dpi
		this.canvas.height = height * dpi
	}

	public async render(exp: MalVal, settings: ViewerSettings) {
		if (!this.dpi) {
			throw new Error('trying to render before settings resolution')
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
		const defaultStyle: MalMap | null = settings.guideColor
			? {
					[K_STROKE]: true,
					[K_STROKE_COLOR]: settings.guideColor,
					[K_STROKE_WIDTH]: 1,
					[K_STROKE_DASH]: [2, 4]
			  }
			: null

		return this.draw([], exp, [], defaultStyle)
	}

	public async getImage() {
		let blob: Blob

		if (this.canvas instanceof OffscreenCanvas) {
			blob = await this.canvas.convertToBlob()
		} else {
			blob = await new Promise((resolve, reject) => {
				;(this.canvas as HTMLCanvasElement).toBlob(blob => {
					blob ? resolve(blob) : reject()
				})
			})
		}

		return await new Promise((resolve, reject) => {
			const reader = new FileReader()

			reader.readAsDataURL(blob)
			reader.onload = () => {
				if (reader.result) {
					resolve(reader.result)
				} else {
					reject('Failed to get data URL from canvas')
				}
			}
		})
	}

	private draw(
		ret: any[],
		exp: MalVal,
		styles: MalMap[],
		defaultStyle: MalMap | null
	) {
		const ctx = this.ctx

		if (Array.isArray(exp)) {
			const [elm, ...rest] = exp as any[]

			if (!isKeyword(elm)) {
				for (const child of exp) {
					this.draw(ret, child, styles, defaultStyle)
				}
			} else {
				const cmd = elm.replace(/#.*$/, '')

				switch (cmd) {
					case K_TRANSFORM: {
						const [mat, ...children] = rest as [number[], ...MalVal[]]

						ctx.save()
						ctx.transform(
							...(mat as [number, number, number, number, number, number])
						)

						for (const child of children) {
							this.draw(ret, child, styles, defaultStyle)
						}
						ctx.restore()

						break
					}
					case K_STYLE: {
						const [attrs, ...children] = rest
						styles = [
							...styles,
							...((Array.isArray(attrs) ? attrs : [attrs]) as MalMap[])
						]

						for (const child of children) {
							this.draw(ret, child, styles, defaultStyle)
						}
						break
					}
					case K('clip'): {
						const [clipPath, ...children] = rest
						// Enable Clip
						ctx.save()
						const clipRegion = new Path2D()
						this.drawPath(clipRegion, clipPath)
						ctx.clip(clipRegion)

						// Draw inner items
						for (const child of children) {
							this.draw(ret, child, styles, defaultStyle)
						}

						// Restore
						ctx.restore()
						break
					}
					case K_PATH: {
						this.drawPath(ctx, exp as PathType)
						// Apply Styles
						this.applyDrawStyle(styles, defaultStyle)
						break
					}
					case K_TEXT: {
						// Text representation:
						// (:text "Text" x y {:option1 value1...})
						const [text, [x, y], options] = rest
						const settings: any = {
							size: 12,
							font: 'Fira Code',
							align: 'center',
							baseline: 'middle'
						}

						if (isMap(options)) {
							for (const [k, v] of Object.entries(options)) {
								settings[(k as string).slice(1)] = v
							}
						}

						ctx.font = `${settings.size}px ${settings.font}`
						ctx.textAlign = settings.align as CanvasTextAlign
						ctx.textBaseline = settings.baseline as CanvasTextBaseline

						// Apply Styles
						this.applyDrawStyle(styles, defaultStyle, text, x, y)

						break
					}
					case K_BACKGROUND: {
						const color = rest[0]
						ret.push(['set-background', color])
						ctx.fillStyle = color
						ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
						break
					}
					case K_ARTBOARD: {
						const [region, body] = rest
						const [x, y, w, h] = region

						// Enable Clip
						ctx.save()
						const clipRegion = new Path2D()
						clipRegion.rect(x, y, w, h)
						ctx.clip(clipRegion)

						// Draw inner items
						this.draw(ret, body, styles, defaultStyle)

						// Restore
						ctx.restore()
						break
					}
					case K_ENABLE_ANIMATION: {
						let fps = rest[0]
						fps = 0.1 < fps && fps < 60 ? fps : -1
						ret.push(['enable-animation', fps])
						break
					}
					default:
						throw new LispError(`Unknown rendering command ${printExp(cmd)}`)
				}
			}
		}

		return ret
	}

	private drawPath(ctx: CanvasContext | Path2D, path: PathType) {
		if (!(ctx instanceof Path2D)) {
			ctx.beginPath()
		}
		for (const [c, ...pts] of iterateSegment(path.slice(1))) {
			const args = pts.flat()
			switch (c) {
				case K_M:
					ctx.moveTo(...(args as [number, number]))
					break
				case K_L:
					ctx.lineTo(...(args as [number, number]))
					break
				case K_C:
					ctx.bezierCurveTo(
						...(args as [number, number, number, number, number, number])
					)
					break
				case K_Z:
					ctx.closePath()
					break
				default: {
					throw new LispError(`Invalid d-path command: ${printExp(c)}`)
				}
			}
		}
	}

	private createFillOrStrokeStyle(style: string | any[]) {
		if (typeof style === 'string') {
			return style
		} else if (Array.isArray(style)) {
			const [type, params] = style as [string, MalMap]
			switch (type) {
				case K_LINEAR_GRADIENT: {
					const [x0, y0, x1, y1] = params[K_POINTS] as number[]
					const stops = params[K_STOPS] as (string | number)[]
					const grad = this.ctx.createLinearGradient(x0, y0, x1, y1)
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
		styles: MalMap[],
		defaultStyle: MalMap | null,
		text?: string,
		x?: number,
		y?: number
	) {
		styles = styles.length > 0 ? styles : defaultStyle ? [defaultStyle] : []

		const ctx = this.ctx
		const isText = text !== undefined

		const drawOrders = styles.map(s => ({
			fill: !!s[K_FILL],
			stroke: !!s[K_STROKE]
		}))

		let hasDrawnFill = false,
			hasDrawnStroke = false
		for (let i = drawOrders.length - 1; i >= 0; i--) {
			const order = drawOrders[i]

			if (hasDrawnFill) {
				order.fill = false
			}
			if (hasDrawnStroke) {
				order.stroke = false
			}

			if (order.fill) {
				hasDrawnFill = true
			}
			if (order.stroke) {
				hasDrawnStroke = true
			}
		}

		ctx.save()
		for (let i = 0; i < styles.length; i++) {
			const style = styles[i]
			for (const [k, v] of Object.entries(style)) {
				switch (k) {
					case K_FILL_COLOR:
						ctx.fillStyle = this.createFillOrStrokeStyle(v as string)
						break
					case K_STROKE_COLOR:
						ctx.strokeStyle = this.createFillOrStrokeStyle(v as string)
						break
					case K_STROKE_WIDTH:
						ctx.lineWidth = v as number
						break
					case K_STROKE_CAP:
						ctx.lineCap = v as CanvasLineCap
						break
					case K_STROKE_JOIN:
						ctx.lineJoin = v as CanvasLineJoin
						break
					case K_STROKE_DASH:
						ctx.setLineDash(v as number[])
				}
			}

			if (drawOrders[i].fill) {
				if (isText) {
					ctx.fillText(text as string, x as number, y as number)
				} else {
					ctx.fill()
				}
			}
			if (drawOrders[i].stroke) {
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
