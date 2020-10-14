import {
	MalVal,
	MalKeyword,
	MalError,
	MalMap,
	MalVector,
	MalString,
} from '@/mal/types'
import {iterateSegment} from '@/path-utils'

type CanvasContext =
	| CanvasRenderingContext2D
	| OffscreenCanvasRenderingContext2D

export default function renderToContext(
	ctx: CanvasContext,
	exp: MalVal,
	defaultStyle: MalMap | null = null
) {
	// Set the default line cap
	ctx.lineCap = 'round'
	ctx.lineJoin = 'round'
	return drawElement(exp, [])

	function drawElement(exp: MalVal, styles: MalMap[]) {
		if (!MalVector.is(exp)) return

		const [elm, ...rest] = exp.value

		if (!MalKeyword.is(elm)) {
			return
		}

		const cmd = elm.value

		switch (cmd) {
			case 'transform': {
				const [mat, ...children] = rest

				ctx.save()
				ctx.transform(
					...((mat.toFloats() as any) as [
						number,
						number,
						number,
						number,
						number,
						number
					])
				)
				for (const child of children) {
					drawElement(child, styles)
				}
				ctx.restore()
				break
			}
			case 'g': {
				const children = rest.slice(1)
				for (const child of children) {
					drawElement(child, styles)
				}
				break
			}
			case 'style': {
				const [attrs, ...children] = rest
				styles = [
					...styles,
					...((MalVector.is(attrs) ? attrs.value : [attrs]) as MalMap[]),
				]
				for (const child of children) {
					drawElement(child, styles)
				}
				break
			}
			case 'clip': {
				const [clipPath, ...children] = rest
				// Enable Clip
				ctx.save()
				drawPath(ctx, clipPath)
				if (!ctx.resetTransform) {
					ctx.fillStyle = 'blue'
					ctx.fill()
				}
				ctx.clip()

				// Draw inner items
				for (const child of children) {
					drawElement(child, styles)
				}
				// Restore
				ctx.restore()
				break
			}
			case 'path': {
				drawPath(ctx, exp)
				applyDrawStyle(styles, exp)
				break
			}
			// case 'text': {
			// 	// Text representation:
			// 	// (:text "Text" x y {:option1 value1...})
			// 	const [text, [x, y], options] = rest
			// 	const settings: any = {
			// 		size: 12,
			// 		font: 'Fira Code',
			// 		align: 'center',
			// 		baseline: 'middle',
			// 	}
			// 	if (MalMap.is(options)) {
			// 		for (const [k, v] of Object.entries(options)) {
			// 			settings[(k as string).slice(1)] = v
			// 		}
			// 	}
			// 	ctx.font = `${settings.size}px ${settings.font}`
			// 	ctx.textAlign = settings.align as CanvasTextAlign
			// 	ctx.textBaseline = settings.baseline as CanvasTextBaseline
			// 	// Apply Styles
			// 	applyDrawStyle(styles, defaultStyle, {
			// 		text,
			// 		x,
			// 		y,
			// 		size: settings.size,
			// 	})
			// 	break
			// }
			// case 'artboard': {
			// 	const [region, children] = rest
			// 	const [x, y, w, h] = region
			// 	// Enable Clip
			// 	ctx.save()
			// 	ctx.rect(x, y, w, h)
			// 	ctx.clip()
			// 	// Draw inner items
			// 	drawElement(children, styles)
			// 	// Restore
			// 	ctx.restore()
			// 	break
			// }
			default:
				throw new MalError(`Unknown rendering command ${cmd}`)
		}
	}
	function drawPath(ctx: CanvasContext | Path2D, path: MalVal) {
		if (!MalVector.is(path)) throw new Error('Invalid path')

		if (!(ctx instanceof Path2D)) {
			ctx.beginPath()
		}
		for (const [c, ...pts] of iterateSegment(path)) {
			switch (c) {
				case 'M':
					ctx.moveTo(pts[0][0], pts[0][1])
					break
				case 'L':
					ctx.lineTo(pts[0][0], pts[0][1])
					break
				case 'C':
					ctx.bezierCurveTo(
						pts[0][0],
						pts[0][1],
						pts[1][0],
						pts[1][1],
						pts[2][0],
						pts[2][1]
					)
					break
				case 'Z':
					ctx.closePath()
					break
				default: {
					throw new MalError(`Invalid d-path command: ${c}`)
				}
			}
		}
	}
	function createContextStyle(style: MalVal) {
		if (MalString.is(style)) {
			return style.value
		} else {
			return ''
		}
		// if (typeof style === 'string') {
		// 	return style
		// } else if (Array.isArray(style)) {
		// 	const [type, params] = style as [string, MalMap]
		// 	switch (type) {
		// 		case MalKeyword.create('linear-gradient'): {
		// 			const [x0, y0, x1, y1] = params[
		// 				MalKeyword.create('points')
		// 			] as number[]
		// 			const stops = params[MalKeyword.create('stops')] as (
		// 				| string
		// 				| number
		// 			)[]
		// 			const grad = ctx.createLinearGradient(x0, y0, x1, y1)
		// 			for (const [offset, color] of partition(2, stops)) {
		// 				if (typeof offset !== 'number' || typeof color !== 'string') {
		// 					continue
		// 				}
		// 				grad.addColorStop(offset, color)
		// 			}
		// 			return grad
		// 		}
		// 	}
		// }
		// return ''
	}
	function applyDrawStyle(
		styles: MalMap[],
		content: MalVector
		// | MalVector
		// | {
		// 		text: string
		// 		x: number
		// 		y: number
		// 		size: number
		//   }
	) {
		styles = styles.length > 0 ? styles : defaultStyle ? [defaultStyle] : []

		const drawOrders = styles.map(s => ({
			fill: !!s.get('fill')?.value as boolean,
			stroke: !!s.get('stroke')?.value as boolean,
		}))

		let ignoreFill = false,
			ignoreStroke = false

		for (let i = drawOrders.length - 1; i >= 0; i--) {
			const order = drawOrders[i]
			if (ignoreFill) order.fill = false
			if (ignoreStroke) order.stroke = false
			if (order.fill === false) ignoreFill = true
			if (order.stroke === false) ignoreStroke = true
		}

		ctx.save()

		for (let i = 0; i < styles.length; i++) {
			const style = styles[i]
			for (const [k, v] of style.entries()) {
				switch (k) {
					case 'fill-color':
						ctx.fillStyle = createContextStyle(v)
						break
					case 'stroke-color':
						ctx.strokeStyle = createContextStyle(v)
						break
					case 'stroke-width':
						ctx.lineWidth = v.value as number
						break
					case 'stroke-cap':
						ctx.lineCap = v.value as CanvasLineCap
						break
					case 'stroke-join':
						ctx.lineJoin = v.value as CanvasLineJoin
						break
					case 'stroke-dash':
						ctx.setLineDash(v.toJS() as number[])
				}
			}
			if (drawOrders[i].fill) {
				drawPath(ctx, content)
				ctx.fill()
				// if (MalVector.is(content)) {
				// 	drawPath(ctx, content)
				// 	ctx.fill()
				// } else {
				// 	const lines = content.text.split('\n')
				// 	for (let i = 0; i < lines.length; i++) {
				// 		ctx.fillText(lines[i], content.x, content.y + content.size * i)
				// 	}
				// }
			}
			if (drawOrders[i].stroke) {
				drawPath(ctx, content)
				ctx.stroke()
				// if (MalVector.is(content)) {
				// 	drawPath(ctx, content)
				// 	ctx.stroke()
				// } else {
				// 	const lines = content.text.split('\n')
				// 	for (let i = 0; i < lines.length; i++) {
				// 		ctx.strokeText(lines[i], content.x, content.y + content.size * i)
				// 	}
				// }
			}
		}
		ctx.restore()
	}
}
