import EventEmitter from 'eventemitter3'
import {MalVal, symbolFor as S} from '@/mal/types'
import Env from '@/mal/env'
import {mat3} from 'gl-matrix'

export interface ViewerSettings {
	viewTransform?: mat3
	guideColor?: string
}

export default class CanvasRender extends EventEmitter {
	private canvas: HTMLCanvasElement
	private offscreenCanvas: OffscreenCanvas
	private worker: Worker
	private rendering = false

	constructor(canvas: HTMLCanvasElement) {
		super()

		this.canvas = canvas
		this.offscreenCanvas = this.canvas.transferControlToOffscreen()

		this.worker = new Worker('./worker.ts', {type: 'module'})
		this.worker.onmessage = e => this.onMessage(e)
		this.worker.postMessage(
			{
				type: 'init',
				params: {canvas: this.offscreenCanvas}
			},
			[this.offscreenCanvas]
		)
	}

	public get isRendering() {
		return this.rendering
	}

	public resize(...args: number[]) {
		let width, height, dpi

		if (args.length === 0) {
			width = this.canvas.clientWidth
			height = this.canvas.clientHeight
			dpi = window.devicePixelRatio || 1
		} else {
			;[width, height, dpi] = args
		}

		this.worker.postMessage({type: 'resize', params: {width, height, dpi}})
	}

	public dispose() {
		this.worker.terminate()
	}

	public async render(ast: MalVal, settings: ViewerSettings) {
		this.rendering = true

		await this.postMessageAndWait('render', {ast, settings})

		this.rendering = false

		return
	}

	public async getImage() {
		return await this.postMessageAndWait('get-image')
	}

	private postMessageAndWait(
		type: string,
		params: any = null,
		transfer: Transferable[] = []
	) {
		return new Promise(resolve => {
			this.worker.postMessage({type, params}, transfer)
			this.once(type, (result: any) => {
				resolve(result)
			})
		})
	}

	private onMessage(e: any) {
		const {type, params} = e.data
		this.emit(type, params)
	}
}
