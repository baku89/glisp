import {MalVal, MalMap} from '@/mal/types'
import {ViewerSettings} from './index'
import renderToContext from '../render-to-context'
import {jsToMal} from '@/mal/reader'

type Canvas = HTMLCanvasElement | OffscreenCanvas

type CanvasContext =
	| CanvasRenderingContext2D
	| OffscreenCanvasRenderingContext2D

export default class CanvasRenderer {
	private ctx!: CanvasContext
	private dpi!: number
	private cachedExp!: MalVal

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

	public async render(exp: MalVal | undefined, settings: ViewerSettings) {
		if (!this.dpi) {
			throw new Error('trying to render before settings resolution')
		}

		// Use cached expression
		if (exp === undefined) {
			if (!this.cachedExp) {
				throw new Error('Cannot render because there iss no cached exp')
			}
			exp = this.cachedExp
		} else {
			this.cachedExp = exp
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
			ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5])
		}

		// default style
		const defaultStyle: MalMap | null = settings.guideColor
			? jsToMal({
					stroke: true,
					'stroke-color': settings.guideColor,
					'stroke-width': 1,
					'stroke-dash': [2, 4],
			  })
			: null

		// // Start drawing
		return renderToContext(this.ctx, exp, defaultStyle)
	}

	public async getImage({format = 'png'} = {}) {
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
