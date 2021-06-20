import FileSaver from 'file-saver'
import {Regl} from 'regl'

export function saveViewport(regl: Regl, filename: string) {
	const gl = regl._gl
	const w = gl.canvas.width
	const h = gl.canvas.height

	const bytes = new Uint8Array(w * h * 4)
	regl.read(bytes)

	const canvas = document.createElement('canvas')
	canvas.width = w
	canvas.height = h
	const ctx = canvas.getContext('2d')

	ctx?.putImageData(new ImageData(new Uint8ClampedArray(bytes), w, h), 0, 0)

	canvas.toBlob(blob => blob && FileSaver.saveAs(blob, filename))
}
