/// <reference types="vite-plugin-comlink/client" />
import * as Comlink from 'comlink'
import {mat2d} from 'linearly'

import CanvasRenderer from './canvas-renderer'

export interface CanvasRenderOptions {
	transform?: mat2d
	guideColor?: string
}

export type Canvas = CanvasRenderer | Comlink.Remote<CanvasRenderer>

export default async function createCanvasRender(canvas?: HTMLCanvasElement) {
	if (!canvas) {
		canvas = document.createElement('canvas')
	}

	let renderer: Canvas

	if (typeof OffscreenCanvas !== 'undefined' && false) {
		const CanvasRenderer = new ComlinkWorker<typeof import('./worker')>(
			new URL('./worker', import.meta.url)
		).CanvasRenderer

		const offscreenCanvas = canvas.transferControlToOffscreen()
		renderer = await new CanvasRenderer(
			Comlink.transfer(offscreenCanvas, [offscreenCanvas])
		)
	} else {
		renderer = new CanvasRenderer(canvas)
	}

	return renderer
}
