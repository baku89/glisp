import C2S from 'canvas2svg'

import {Expr} from '@/glisp/types'

import renderToContext from './render-to-context'

export default function renderToSvg(view: Expr, width: number, height: number) {
	const ctx = new C2S(width, height)

	renderToContext(ctx, view)

	return ctx.getSerializedSvg(true)
}
