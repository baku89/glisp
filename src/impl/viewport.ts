import {replEnv, REP} from './repl'
import Env from './env'
import {MalVector, isVector} from './types'
import {printer} from './printer'

function drawPath(ctx: CanvasRenderingContext2D, path: MalVector) {
	if (!Array.isArray(path)) {
		return
	}

	const [type, ...rest] = path

	if (isVector(type)) {
		path.forEach(p => drawPath(ctx, p))
	} else if (typeof type === 'string') {
		switch (type) {
			case 'rect':
				// @ts-ignore
				ctx.rect(...rest)
				break
			case 'circle':
				ctx.arc(rest[0], rest[1], rest[2], 0, 2 * Math.PI)
				break
			case 'arc':
				// @ts-ignore
				ctx.arc(...rest)
				break
			case 'line':
				ctx.moveTo(rest[0], rest[1])
				ctx.lineTo(rest[2], rest[3])
				break
			case 'path':
				console.log('path!!!!', rest)
				for (const [cmd, a0, a1] of rest) {
					switch (cmd) {
						case 'M':
							ctx.moveTo(a0, a1)
							break
						case 'L':
							ctx.lineTo(a0, a1)
							break
						case 'Z':
							ctx.closePath()
							break
						default:
							throw new Error(`Invalid d-path command: ${cmd}`)
					}
				}
				break

			default:
				throw new Error(`Invalid path type: ${type}`)
		}
	}
}

export function createViewportRep(ctx: CanvasRenderingContext2D) {
	const vpEnv = new Env(replEnv)

	const nsViewport = {
		stroke: (color: string, width: number, path: MalVector) => {
			ctx.strokeStyle = color
			ctx.lineWidth = width
			ctx.beginPath()
			drawPath(ctx, path)
			ctx.stroke()

			return path
		},

		fill: (color: string, path: MalVector) => {
			ctx.fillStyle = color
			ctx.beginPath()
			drawPath(ctx, path)
			ctx.fill()
			return path
		},

		clear: () => {
			if (ctx) {
				const w = ctx.canvas.width
				const h = ctx.canvas.height

				ctx.clearRect(0, 0, w, h)
			}
			return null
		}
	}

	for (const key in nsViewport) {
		vpEnv.set(key, (nsViewport as any)[key])
	}

	replEnv.name = 'repl'
	vpEnv.name = 'vp'

	const repCanvas = (str: string) => {
		const drawEnv = new Env(vpEnv)
		drawEnv.name = 'draw'

		try {
			REP(`(do (clear) ${str})`, drawEnv)
		} catch (e) {
			printer.println(e)
			// printer.println(e.stack)
		}
	}

	return repCanvas
}
