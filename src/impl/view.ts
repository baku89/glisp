import {replEnv, READ, EVAL, PRINT} from './repl'
import Env from './env'
import {MalVal} from './types'
import {printer} from './printer'
import EventEmitter from 'eventemitter3'

import {BlankException} from './reader'

export const viewHandler = new EventEmitter()

replEnv.set('$insert', (item: MalVal) => {
	viewHandler.emit('$insert', item)
	return null
})

const _SYM = Symbol.for

function draw(ctx: CanvasRenderingContext2D, ast: MalVal) {
	if (Array.isArray(ast)) {
		const [cmd, ...args] = ast as any[]

		const last = args.length > 0 ? args[args.length - 1] : null

		if (cmd === _SYM('background')) {
			const color = args[0]
			if (typeof color === 'string') {
				console.log('set valid color!!!!')
				viewHandler.emit('set-background', args[0] as string)
			}
		} else if (cmd === _SYM('fill')) {
			draw(ctx, last)
			ctx.fillStyle = args[0] as string
			ctx.fill()
		} else if (cmd === _SYM('stroke')) {
			draw(ctx, last)
			ctx.strokeStyle = args[0]
			ctx.lineWidth = args[1]
			ctx.stroke()
		} else if (cmd === _SYM('path')) {
			ctx.beginPath()
			for (let i = 0; i < args.length; i++) {
				switch (args[i]) {
					case _SYM('M'):
						ctx.moveTo(args[++i], args[++i])
						break
					case _SYM('L'):
						ctx.lineTo(args[++i], args[++i])
						break
					case _SYM('A'):
						ctx.arc(
							args[++i],
							args[++i],
							args[++i],
							args[++i],
							args[++i],
							args[++i]
						)
						break
					case _SYM('C'):
						ctx.bezierCurveTo(
							args[++i],
							args[++i],
							args[++i],
							args[++i],
							args[++i],
							args[++i]
						)
						break
					case _SYM('Z'):
						ctx.closePath()
						break
					default:
						throw new Error(`Invalid d-path command: ${args[i]}`)
				}
			}
		} else if (cmd === _SYM('translate')) {
			ctx.save()
			ctx.translate(args[0] as number, args[1] as number)
			draw(ctx, last)
			ctx.restore()
		} else if (cmd === _SYM('scale')) {
			ctx.save()
			ctx.scale(args[0] as number, args[1] as number)
			draw(ctx, last)
			ctx.restore()
		} else if (cmd === _SYM('rotate')) {
			ctx.save()
			ctx.rotate(args[0] as number)
			draw(ctx, last)
			ctx.restore()
		} else {
			for (const a of ast) {
				draw(ctx, a)
			}
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
			printer.error(e)
		}

		if (out !== undefined) {
			// Draw
			consoleEnv.outer = viewEnv

			const w = ctx.canvas.width
			const h = ctx.canvas.height
			ctx.clearRect(0, 0, w, h)

			draw(ctx, out)
		}

		return viewEnv
	}

	return repCanvas
}

export const consoleREP = (str: string, output = true) => {
	try {
		const out = EVAL(READ(str), consoleEnv)
		if (output) {
			printer.return(PRINT(out))
		}
	} catch (err) {
		if (err instanceof BlankException) {
			return
		}
		printer.error(err)
	}
}
