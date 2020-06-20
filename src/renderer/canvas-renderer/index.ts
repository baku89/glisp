import CanvasRenderer from './canvas-renderer'
import * as Comlink from 'comlink'
import {mat2d} from 'gl-matrix'

export interface ViewerSettings {
	viewTransform?: mat2d
	guideColor?: string
}

export type CanvasRendererType = CanvasRenderer | Comlink.Remote<CanvasRenderer>

export default async function createCanvasRender(canvas?: HTMLCanvasElement) {
	let renderer: CanvasRendererType

	if (!canvas) {
		canvas = document.createElement('canvas')
	}

	if (typeof OffscreenCanvas !== 'undefined') {
		const CanvasRendererWorker = Comlink.wrap<CanvasRenderer>(
			new Worker('./worker.ts', {type: 'module'})
		) as any

		const offscreenCanvas = canvas.transferControlToOffscreen()

		renderer = (await new CanvasRendererWorker(
			Comlink.transfer(offscreenCanvas, [offscreenCanvas])
		)) as Comlink.Remote<CanvasRenderer>
	} else {
		renderer = new CanvasRenderer(canvas)
	}

	return renderer
}
