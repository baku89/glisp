import {replEnv, READ, EVAL, PRINT, LispError} from './repl'
import Env from './env'
import {MalVal} from './types'
import {printer} from './printer'
import EventEmitter from 'eventemitter3'

import {BlankException} from './reader'
import {iteratePath} from './path'

export const viewHandler = new EventEmitter()

replEnv.set('$insert', (item: MalVal) => {
	viewHandler.emit('$insert', item)
	return null
})

const _SYM = Symbol.for

const SYM_PATH = _SYM('path')
const SYM_M = _SYM('M')
const SYM_L = _SYM('L')
const SYM_C = _SYM('C')
const SYM_Z = _SYM('Z')

function draw(ctx: CanvasRenderingContext2D, ast: MalVal) {
	if (Array.isArray(ast)) {
		const [cmd, ...args] = ast as any[]

		const last = args.length > 0 ? args[args.length - 1] : null

		if (cmd === _SYM('background')) {
			const color = args[0]
			if (typeof color === 'string') {
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
			for (const [c, ...a] of iteratePath(args)) {
				switch (c) {
					case SYM_M:
						ctx.moveTo(...(a as [number, number]))
						break
					case SYM_L:
						ctx.lineTo(...(a as [number, number]))
						break
					case SYM_C:
						ctx.bezierCurveTo(
							...(a as [number, number, number, number, number, number])
						)
						break
					case SYM_Z:
						ctx.closePath()
						break
					default: {
						console.log('naja', c)
						throw new Error(
							`Invalid d-path command: ${
								typeof c === 'symbol' ? Symbol.keyFor(c) : c
							}`
						)
					}
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

consoleEnv.set('console/clear', () => {
	printer.clear()
	return null
})

export function createViewREP(ctx: CanvasRenderingContext2D) {
	const repCanvas = (str: string) => {
		const viewEnv = new Env(replEnv)
		viewEnv.name = 'view'

		let out

		try {
			const src = READ(str)
			out = EVAL(src, viewEnv)
		} catch (err) {
			if (err instanceof LispError) {
				printer.error(err)
			} else {
				printer.error(err.stack)
			}
		}

		if (out !== undefined) {
			// Draw
			consoleEnv.outer = viewEnv

			const w = ctx.canvas.width
			const h = ctx.canvas.height
			ctx.clearRect(0, 0, w, h)

			// Set the default line cap
			ctx.lineCap = 'round'
			ctx.lineJoin = 'round'

			try {
				draw(ctx, out)
			} catch (err) {
				printer.error(err.stack)
			}
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
		} else if (err instanceof LispError) {
			printer.error(err)
		} else {
			printer.error(err.stack)
		}
	}
}
