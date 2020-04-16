import EventEmitter from 'eventemitter3'
import {MalVal, symbolFor as S} from '@/mal/types'
import Env from '@/mal/env'

export interface ViewerSettings {
	guideColor: string | null
}

export default class CanvasRender extends EventEmitter {
	private canvas: HTMLCanvasElement
	private worker: Worker
	private rendering = false

	constructor(canvas: HTMLCanvasElement) {
		super()

		this.canvas = canvas
		const offscreenCanvas = this.canvas.transferControlToOffscreen()

		this.worker = new Worker('./worker.ts', {type: 'module'})
		this.worker.onmessage = e => this.onMessage(e)
		this.worker.postMessage(
			{
				type: 'init',
				params: {canvas: offscreenCanvas}
			},
			[offscreenCanvas]
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

	public render(ast: MalVal, env: Env) {
		this.rendering = true

		const settings: ViewerSettings = {
			guideColor: env.get(S('$guide-color')) as string
		}

		this.worker.postMessage({type: 'render', params: {ast, settings}})
	}

	private onMessage(e: any) {
		const {type, params} = e.data

		if (type === 'render') {
			this.rendering = false
		}

		this.emit(type, params)
	}
}
