import {printExpr} from '@/glisp/print'
import {
	Expr,
	ExprMap,
	GlispError,
	isKeyword,
	isMap,
	keywordFor as K,
} from '@/glisp/types'
import {iterateSegment, PathType} from '@/path-utils'
import {partition} from '@/utils'

type CanvasContext =
	| CanvasRenderingContext2D
	| OffscreenCanvasRenderingContext2D

export default function renderToContext(
	ctx: CanvasContext,
	expr: Expr,
	defaultStyle: ExprMap | null = null
) {
	function draw(expr: Expr, styles: ExprMap[]) {
		if (Array.isArray(expr) && expr.length > 0) {
			const [elm, ...rest] = expr as any[]

			if (!isKeyword(elm)) {
				for (const child of expr) {
					draw(child, styles)
				}
			} else {
				const cmd = elm.replace(/#.*$/, '')

				switch (cmd) {
					case K('transform'): {
						const [mat, ...children] = rest as [number[], ...Expr[]]

						ctx.save()
						ctx.transform(
							...(mat as [number, number, number, number, number, number])
						)
						draw(children, styles)
						ctx.restore()
						break
					}
					case K('g'): {
						const children = rest.slice(1)
						draw(children, styles)
						break
					}
					case K('style'): {
						const [attrs, ...children] = rest
						styles = [
							...styles,
							...((Array.isArray(attrs) ? attrs : [attrs]) as ExprMap[]),
						]
						draw(children, styles)
						break
					}
					case K('clip'): {
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
						draw(children, styles)

						// Restore
						ctx.restore()
						break
					}
					case K('path'): {
						drawPath(ctx, expr as PathType)
						applyDrawStyle(styles, defaultStyle, expr as PathType)
						break
					}
					case K('text'): {
						// Text representation:
						// (:text "Text" x y {:option1 value1...})
						const [text, [x, y], options] = rest
						const settings: any = {
							size: 12,
							font: 'Fira Code',
							align: 'center',
							baseline: 'middle',
						}

						if (isMap(options)) {
							for (const [k, v] of Object.entries(options)) {
								settings[(k as string).slice(1)] = v
							}
						}

						ctx.font = `${settings.size}px ${settings.font}`
						ctx.textAlign = settings.align as CanvasTextAlign
						ctx.textBaseline = settings.baseline as CanvasTextBaseline

						// Apply Styles
						applyDrawStyle(styles, defaultStyle, {
							text,
							x,
							y,
							size: settings.size,
						})

						break
					}
					default:
						throw new GlispError(`Unknown rendering command ${printExpr(cmd)}`)
				}
			}
		}
	}

	function drawPath(ctx: CanvasContext | Path2D, path: PathType) {
		if (!(ctx instanceof Path2D)) {
			ctx.beginPath()
		}
		for (const [c, ...pts] of iterateSegment(path.slice(1))) {
			switch (c) {
				case K('M'):
					ctx.moveTo(pts[0][0], pts[0][1])
					break
				case K('L'):
					ctx.lineTo(pts[0][0], pts[0][1])
					break
				case K('C'):
					ctx.bezierCurveTo(
						pts[0][0],
						pts[0][1],
						pts[1][0],
						pts[1][1],
						pts[2][0],
						pts[2][1]
					)
					break
				case K('Z'):
					ctx.closePath()
					break
				default: {
					throw new GlispError(`Invalid d-path command: ${printExpr(c)}`)
				}
			}
		}
	}

	function createContextStyle(style: string | any[]) {
		if (typeof style === 'string') {
			return style
		} else if (Array.isArray(style)) {
			const [type, params] = style as [string, ExprMap]
			switch (type) {
				case K('linear-gradient'): {
					const [x0, y0, x1, y1] = params[K('points')] as number[]
					const stops = params[K('stops')] as (string | number)[]
					const grad = ctx.createLinearGradient(x0, y0, x1, y1)
					for (const [offset, color] of partition(2, stops)) {
						if (typeof offset !== 'number' || typeof color !== 'string') {
							continue
						}
						grad.addColorStop(offset, color)
					}
					return grad
				}
			}
		}
		return ''
	}

	function applyDrawStyle(
		styles: ExprMap[],
		defaultStyle: ExprMap | null,
		content:
			| PathType
			| {
					text: string
					x: number
					y: number
					size: number
			  }
	) {
		styles = styles.length > 0 ? styles : defaultStyle ? [defaultStyle] : []

		const drawOrders = styles.map(s => ({
			fill: s[K('fill')],
			stroke: s[K('stroke')],
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
			for (const [k, v] of Object.entries(style)) {
				switch (k) {
					case K('fill-color'):
						ctx.fillStyle = createContextStyle(v as string)
						break
					case K('stroke-color'):
						ctx.strokeStyle = createContextStyle(v as string)
						break
					case K('stroke-width'):
						ctx.lineWidth = v as number
						break
					case K('stroke-cap'):
						ctx.lineCap = v as CanvasLineCap
						break
					case K('stroke-join'):
						ctx.lineJoin = v as CanvasLineJoin
						break
					case K('stroke-dash'):
						ctx.setLineDash(v as number[])
				}
			}

			if (drawOrders[i].fill) {
				if (Array.isArray(content)) {
					drawPath(ctx, content)
					ctx.fill()
				} else {
					const lines = content.text.split('\n')
					for (let i = 0; i < lines.length; i++) {
						ctx.fillText(lines[i], content.x, content.y + content.size * i)
					}
				}
			}
			if (drawOrders[i].stroke) {
				if (Array.isArray(content)) {
					drawPath(ctx, content)
					ctx.stroke()
				} else {
					const lines = content.text.split('\n')
					for (let i = 0; i < lines.length; i++) {
						ctx.strokeText(lines[i], content.x, content.y + content.size * i)
					}
				}
			}
		}
		ctx.restore()
	}

	// Set the default line cap
	ctx.lineCap = 'round'
	ctx.lineJoin = 'round'

	return draw(expr, [])
}
