import EventEmitter from 'eventemitter3'
import CanvasRenderer from './CanvasRenderer'
import {MalVal} from '@/mal/types'
import {mat3} from 'gl-matrix'

export interface ViewerSettings {
	viewTransform?: mat3
	guideColor?: string
}

export default class CanvasRenderDelegate extends EventEmitter {
	private canvas!: HTMLCanvasElement
	private worker!: Worker
	private renderer!: CanvasRenderer
	private rendering = false

	constructor() {
		super()
	}

	public get isRendering() {
		return this.rendering
	}

	public async init(canvas: HTMLCanvasElement) {
		this.canvas = canvas

		if (typeof OffscreenCanvas !== 'undefined') {
			this.worker = new Worker('./worker.ts', {type: 'module'})
			this.worker.onmessage = e => this.onMessage(e)
			const offscreenCanvas = canvas.transferControlToOffscreen()
			await this.postMessageAndWait('init', {canvas: offscreenCanvas}, [
				offscreenCanvas
			])
		} else {
			this.renderer = new CanvasRenderer()
			await this.postMessageAndWait('init', {canvas})
		}
	}

	public async resize(width?: number, height?: number, dpi?: number) {
		if (dpi === undefined) {
			width = this.canvas.clientWidth
			height = this.canvas.clientHeight
			dpi = window.devicePixelRatio || 1
		}

		return await this.postMessageAndWait('resize', {width, height, dpi})
	}

	public async render(ast: MalVal, settings: ViewerSettings) {
		this.rendering = true
		await this.postMessageAndWait('render', {ast, settings})
		this.rendering = false
	}

	public async getImage() {
		return await this.postMessageAndWait('get-image')
	}

	public async dispose() {
		if (this.worker) {
			this.worker.terminate()
		}
	}

	private postMessageAndWait(
		type: string,
		params: any = null,
		transfer: Transferable[] = []
	) {
		return new Promise((resolve, reject) => {
			if (this.worker) {
				this.worker.postMessage({type, params}, transfer)
				this.once(type, (result: any) => {
					if (result instanceof Error) {
						reject(result)
					} else {
						resolve(result)
					}
				})
			} else {
				this.renderer
					.postMeessage(type, params)
					.then(resolve)
					.catch(reject)
			}
		})
	}

	private onMessage(e: MessageEvent) {
		const {type, params} = e.data
		this.emit(type, params)
	}
}
