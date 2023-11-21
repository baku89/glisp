import C2S from 'canvas2svg'

import {MalVal} from '@/mal/types'

import renderToContext from './render-to-context'

export default function renderToSvg(
	view: MalVal,
	width: number,
	height: number
) {
	const ctx = new C2S(width, height)

	renderToContext(ctx, view)

	return ctx.getSerializedSvg(true)
}
