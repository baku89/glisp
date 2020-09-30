import {
	MalVal,
	MalKeyword,
	isMap,
	isKeyword,
	MalError,
	MalMap,
} from '@/mal/types'
import {partition} from '@/utils'
import {iterateSegment, PathType} from '@/path-utils'
import printExp from '@/mal/printer'

type CanvasContext =
	| CanvasRenderingContext2D
	| OffscreenCanvasRenderingContext2D

export default function renderToContext(
	ctx: CanvasContext,
	exp: MalVal,
	defaultStyle: MalMap | null = null
) {
	function draw(exp: MalVal, styles: MalMap[]) {
		if (Array.isArray(exp) && exp.length > 0) {
			const [elm, ...rest] = exp as any[]

			if (!isKeyword(elm)) {
				for (const child of exp) {
					draw(child, styles)
				}
			} else {
				const cmd = elm.replace(/#.*$/, '')

				switch (cmd) {
					case MalKeyword.create('transform'): {
						const [mat, ...children] = rest as [number[], ...MalVal[]]

						ctx.save()
						ctx.transform(
							...(mat as [number, number, number, number, number, number])
						)
						draw(children, styles)
						ctx.restore()
						break
					}
					case MalKeyword.create('g'): {
						const children = rest.slice(1)
						draw(children, styles)
						break
					}
					case MalKeyword.create('style'): {
						const [attrs, ...children] = rest
						styles = [
							...styles,
							...((Array.isArray(attrs) ? attrs : [attrs]) as MalMap[]),
						]
						draw(children, styles)
						break
					}
					case MalKeyword.create('clip'): {
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
					case MalKeyword.create('path'): {
						drawPath(ctx, exp as PathType)
						applyDrawStyle(styles, defaultStyle, exp as PathType)
						break
					}
					case MalKeyword.create('text'): {
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
					case MalKeyword.create('artboard'): {
						const [region, children] = rest
						const [x, y, w, h] = region

						// Enable Clip
						ctx.save()
						ctx.rect(x, y, w, h)
						ctx.clip()

						// Draw inner items
						draw(children, styles)

						// Restore
						ctx.restore()
						break
					}
					default:
						throw new MalError(`Unknown rendering command ${printExp(cmd)}`)
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
				case MalKeyword.create('M'):
					ctx.moveTo(pts[0][0], pts[0][1])
					break
				case MalKeyword.create('L'):
					ctx.lineTo(pts[0][0], pts[0][1])
					break
				case MalKeyword.create('C'):
					ctx.bezierCurveTo(
						pts[0][0],
						pts[0][1],
						pts[1][0],
						pts[1][1],
						pts[2][0],
						pts[2][1]
					)
					break
				case MalKeyword.create('Z'):
					ctx.closePath()
					break
				default: {
					throw new MalError(`Invalid d-path command: ${printExp(c)}`)
				}
			}
		}
	}

	function createContextStyle(style: string | any[]) {
		if (typeof style === 'string') {
			return style
		} else if (Array.isArray(style)) {
			const [type, params] = style as [string, MalMap]
			switch (type) {
				case MalKeyword.create('linear-gradient'): {
					const [x0, y0, x1, y1] = params[
						MalKeyword.create('points')
					] as number[]
					const stops = params[MalKeyword.create('stops')] as (
						| string
						| number
					)[]
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
		styles: MalMap[],
		defaultStyle: MalMap | null,
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
			fill: s[MalKeyword.create('fill')],
			stroke: s[MalKeyword.create('stroke')],
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
					case MalKeyword.create('fill-color'):
						ctx.fillStyle = createContextStyle(v as string)
						break
					case MalKeyword.create('stroke-color'):
						ctx.strokeStyle = createContextStyle(v as string)
						break
					case MalKeyword.create('stroke-width'):
						ctx.lineWidth = v as number
						break
					case MalKeyword.create('stroke-cap'):
						ctx.lineCap = v as CanvasLineCap
						break
					case MalKeyword.create('stroke-join'):
						ctx.lineJoin = v as CanvasLineJoin
						break
					case MalKeyword.create('stroke-dash'):
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

	return draw(exp, [])
}
