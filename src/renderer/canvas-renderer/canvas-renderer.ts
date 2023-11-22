import {Expr, ExprMap, keywordFor as K} from '@/glisp/types'

import renderToContext from '../render-to-context'
import {CanvasRenderOptions} from './index'

type Canvas = HTMLCanvasElement | OffscreenCanvas

type CanvasContext =
	| CanvasRenderingContext2D
	| OffscreenCanvasRenderingContext2D

export default class CanvasRenderer {
	private canvas: Canvas
	private ctx!: CanvasContext
	private dpi: number | null = null

	constructor(canvas: Canvas) {
		this.canvas = canvas
		this.ctx = canvas.getContext('2d')!
	}

	async resize(width: number, height: number, dpi: number) {
		this.dpi = dpi
		this.canvas.width = width * dpi
		this.canvas.height = height * dpi
	}

	async render(expr: Expr, settings: CanvasRenderOptions) {
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
		if (settings.transform) {
			const m = settings.transform
			ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5])
		}

		// default style
		const defaultStyle: ExprMap | null = settings.guideColor
			? {
					[K('stroke')]: true,
					[K('stroke-color')]: settings.guideColor,
					[K('stroke-width')]: 1,
					[K('stroke-dash')]: [2, 4],
			  }
			: null

		// Start drawing
		return renderToContext(this.ctx, expr, defaultStyle)
	}

	async getImage({format = 'png'} = {}) {
		let blob: Blob

		const imageType = `image/${format}`

		if (this.canvas instanceof OffscreenCanvas) {
			blob = await this.canvas.convertToBlob({type: imageType})
		} else {
			blob = await new Promise((resolve, reject) => {
				;(this.canvas as HTMLCanvasElement).toBlob(blob => {
					blob ? resolve(blob) : reject()
				}, imageType)
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
}
