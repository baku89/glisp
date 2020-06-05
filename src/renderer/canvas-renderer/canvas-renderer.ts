import {MalVal, keywordFor as K, MalMap} from '@/mal/types'
import {ViewerSettings} from './index'
import renderToContext from '../render-to-context'

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
					[K('stroke')]: true,
					[K('stroke_color')]: settings.guideColor,
					[K('stroke_width')]: 1,
					[K('stroke_dash')]: [2, 4]
			  }
			: null

		// Start drawing
		return renderToContext(this.ctx, [], exp, [], defaultStyle)
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
}
