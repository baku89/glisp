import {MalVal, keywordFor as K, isMap, isKeyword, LispError} from '@/mal/types'
import printExp from '@/mal/printer'
import {partition} from '@/mal/utils'
import {iterateSegment} from '@/mal/ns/path'
import EventEmitter from 'eventemitter3'
import {ViewerSettings} from './index'

const K_G = K('g'),
	K_M = K('M'),
	K_L = K('L'),
	K_C = K('C'),
	K_Z = K('Z'),
	K_BACKGROUND = K('background'),
	K_ENABLE_ANIMATION = K('enable-animation'),
	K_FILL = K('fill'),
	K_STROKE = K('stroke'),
	K_COLOR = K('color'),
	K_PATH = K('path'),
	K_TEXT = K('text'),
	K_TRANSFORM = K('transform'),
	K_ARTBOARD = K('artboard'),
	K_STYLE = K('style'),
	K_WIDTH = K('width'),
	K_CAP = K('cap'),
	K_JOIN = K('join'),
	K_DASH = K('dash'),
	K_POINTS = K('points'),
	K_STOPS = K('stops')

type Canvas = HTMLCanvasElement | OffscreenCanvas

type CanvasContext =
	| CanvasRenderingContext2D
	| OffscreenCanvasRenderingContext2D

type DrawParams = {[key: string]: string | number | number[]}

interface DrawStyle {
	type: string
	params: DrawParams
}

export default class CanvasRenderer extends EventEmitter {
	private canvas!: Canvas
	private ctx!: CanvasContext
	private dpi!: number

	constructor() {
		super()
	}

	public async postMeessage(type: string, params: any) {
		switch (type) {
			case 'init':
				return this.init(params)
			case 'resize':
				return this.resize(params)
			case 'render':
				return this.render(params)
			case 'get-image':
				return await this.getImage()
			default:
				throw new Error(`undefined task ${type}`)
				break
		}
	}

	private init(params: {canvas: Canvas}) {
		this.canvas = params.canvas

		const ctx = this.canvas.getContext('2d')

		if (ctx) {
			this.ctx = ctx
		} else {
			throw new Error('Cannot initialize rendering context')
		}
	}

	private resize(params: {width: number; height: number; dpi: number}) {
		const {width, height, dpi} = params

		this.dpi = dpi
		this.canvas.width = width * dpi
		this.canvas.height = height * dpi
	}

	private render(params: {ast: MalVal; settings: ViewerSettings}) {
		const {ast, settings} = params

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
		const defaultStyle: DrawStyle | null = settings.guideColor
			? {
					type: K_STROKE,
					params: {
						[K_COLOR]: settings.guideColor,
						[K_WIDTH]: 1,
						[K_DASH]: [2, 4]
					}
			  }
			: null

		this.draw(ast, [], defaultStyle)
	}

	private async getImage() {
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
		ast: MalVal,
		styles: DrawStyle[],
		defaultStyle: DrawStyle | null
	) {
		const ctx = this.ctx

		if (Array.isArray(ast)) {
			const [elm, ...rest] = ast as any[]

			if (!isKeyword(elm)) {
				throw new LispError(
					`Invalid format of AST to render. \n First element of vectors should be keyword but ${printExp(
						elm
					)}`
				)
			} else {
				const cmd = elm.replace(/#.*$/, '')

				switch (cmd) {
					case K_G:
						for (const child of rest) {
							this.draw(child, styles, defaultStyle)
						}
						break
					case K_STYLE: {
						const style: DrawStyle = {type: rest[0][0], params: rest[0][1]}
						this.draw(rest[1], [style, ...styles], defaultStyle)
						break
					}
					case K_PATH: {
						ctx.beginPath()
						for (const [c, ...pts] of iterateSegment(rest)) {
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
										...(args as [
											number,
											number,
											number,
											number,
											number,
											number
										])
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
					case K_TRANSFORM:
						ctx.save()
						ctx.transform(
							...(rest[0] as [number, number, number, number, number, number])
						)
						this.draw(rest[1], styles, defaultStyle)
						ctx.restore()
						break
					case K_BACKGROUND: {
						const color = rest[0]
						if (typeof color === 'string' && color !== '') {
							// only execute if the color is valid
							this.emit('set-background', color)
							ctx.fillStyle = color
							ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
						}
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
						this.draw(body, styles, defaultStyle)

						// Restore
						ctx.restore()
						break
					}
					case K_ENABLE_ANIMATION: {
						let fps = rest[0]
						fps = 0.1 < fps && fps < 60 ? fps : -1
						this.emit('enable-animation', fps)
						break
					}
					default:
						throw new LispError(`Unknown rendering command ${printExp(cmd)}`)
				}
			}
		}
	}

	private createFillOrStrokeStyle(style: string | any[]) {
		if (typeof style === 'string') {
			return style
		} else if (Array.isArray(style)) {
			const [type, params] = style as [string, DrawParams]
			switch (type) {
				case K('linear-gradient'): {
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
		styles: DrawStyle[],
		defaultStyle: DrawStyle | null,
		text?: string,
		x?: number,
		y?: number
	) {
		styles = styles.length > 0 ? styles : defaultStyle ? [defaultStyle] : []

		const ctx = this.ctx
		const isText = text !== undefined

		ctx.save()
		for (const {type, params} of styles) {
			if (type === K_FILL) {
				ctx.fillStyle = this.createFillOrStrokeStyle(params[K_COLOR] as string)
				if (isText) {
					ctx.fillText(text as string, x as number, y as number)
				} else {
					ctx.fill()
				}
			} else if (type === K_STROKE) {
				for (const [k, v] of Object.entries(params as DrawParams)) {
					switch (k) {
						case K_COLOR:
							ctx.strokeStyle = this.createFillOrStrokeStyle(v as string)
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
