import {mat2d} from 'linearly'

import {Expr} from '@/glisp'

import createCanvasRender, {CanvasRendererType} from './canvas-renderer'

const getRendereredImage = (() => {
	let canvasRenderer: CanvasRendererType

	return async (
		viewExp: Expr,
		{format = 'png', scaling = 1, bounds = [0, 0, 100, 100]} = {}
	) => {
		if (!canvasRenderer) {
			canvasRenderer = await createCanvasRender()
		}

		const [x, y, width, height] = bounds as number[]

		canvasRenderer.resize(width, height, scaling)
		const viewTransform = mat2d.fromTranslation([-x, -y])
		await canvasRenderer.render(viewExp, {viewTransform})
		const image = await canvasRenderer.getImage({format})

		return image
	}
})()

export default getRendereredImage
