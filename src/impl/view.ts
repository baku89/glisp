import {replEnv, READ, EVAL, PRINT} from './repl'
import Env from './env'
import {MalVal} from './types'
import {printer} from './printer'
import EventEmitter from 'eventemitter3'

export const viewHandler = new EventEmitter()

replEnv.set('$insert', (item: MalVal) => {
	viewHandler.emit('$insert', item)
	return null
})

function draw(ctx: CanvasRenderingContext2D, ast: MalVal) {
	if (Array.isArray(ast)) {
		const [cmd, ...args] = ast as any[]

		const last = args.length > 0 ? args[args.length - 1] : null

		if (cmd === 'fill') {
			ctx.beginPath()
			draw(ctx, last)
			ctx.fillStyle = args[0] as string
			ctx.fill()
		} else if (cmd === 'stroke') {
			ctx.beginPath()
			draw(ctx, last)
			ctx.strokeStyle = args[0]
			ctx.lineWidth = args[1]
			ctx.stroke()
		} else if (cmd === 'rect') {
			;(ctx.rect as any)(...args)
		} else if (cmd === 'circle') {
			ctx.arc(args[0], args[1], args[2], 0, 2 * Math.PI)
		} else if (cmd === 'line') {
			const [x0, y0, x1, y1] = args as number[]
			ctx.moveTo(x0, y0)
			ctx.lineTo(x1, y1)
		} else if (cmd === 'path') {
			for (const [c, a0, a1] of args) {
				switch (c) {
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
						throw new Error(`Invalid d-path command: ${c}`)
				}
			}
		} else if (cmd === 'translate') {
			ctx.save()
			ctx.translate(args[0] as number, args[1] as number)
			draw(ctx, last)
			ctx.restore()
		} else if (cmd === 'scale') {
			ctx.save()
			ctx.scale(args[0] as number, args[1] as number)
			draw(ctx, last)
			ctx.restore()
		} else if (cmd === 'rotate') {
			ctx.save()
			ctx.rotate(args[0] as number)
			draw(ctx, last)
			ctx.restore()
		}
	}
}

const consoleEnv = new Env(replEnv)
consoleEnv.name = 'console'

export function createViewREP(ctx: CanvasRenderingContext2D) {
	const repCanvas = (str: string) => {
		const viewEnv = new Env(replEnv)
		viewEnv.name = 'view'

		let out

		try {
			const src = READ(str)
			out = EVAL(src, viewEnv)
		} catch (e) {
			printer.println(e)
			// printer.println(e.stack)
		}

		if (out !== undefined) {
			// Draw
			consoleEnv.outer = viewEnv

			const w = ctx.canvas.width
			const h = ctx.canvas.height
			ctx.clearRect(0, 0, w, h)
			draw(ctx, out)
		}
	}

	return repCanvas
}

export const consoleREP = (str: string) => PRINT(EVAL(READ(str), consoleEnv))
