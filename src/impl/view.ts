import {replEnv, READ, EVAL, PRINT, LispError} from './repl'
import Env from './env'
import {MalVal} from './types'
import {printer} from './printer'
import readStr from './reader'
import EventEmitter from 'eventemitter3'

import {BlankException} from './reader'
import {iteratePath} from './path'
import {chunkByCount} from './core'

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

interface DrawStyleFill {
	type: 'fill'
	params: {style: string}
}

interface DrawStyleStroke {
	type: 'stroke'
	params: {style: string; width: number}
}

type DrawStyle = DrawStyleFill | DrawStyleStroke

function draw(ctx: CanvasRenderingContext2D, styles: DrawStyle[], ast: MalVal) {
	if (Array.isArray(ast)) {
		const [cmd, ...args] = ast as any[]

		const last = args.length > 0 ? args[args.length - 1] : null

		if (cmd === _SYM('background')) {
			const color = args[0]
			if (typeof color === 'string') {
				viewHandler.emit('set-background', args[0] as string)
			}
		} else if (cmd === _SYM('fill')) {
			const style: DrawStyleFill = {
				type: 'fill',
				params: {style: args[0] as string}
			}
			draw(ctx, [...styles, style], last)
		} else if (cmd === _SYM('stroke')) {
			const style: DrawStyleStroke = {
				type: 'stroke',
				params: {style: args[0] as string, width: args[1]}
			}
			draw(ctx, [...styles, style], last)
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
						const name = typeof c === 'symbol' ? Symbol.keyFor(c) : c
						throw new Error(`Invalid d-path command: ${name}`)
					}
				}
			}
			// Apply Styles (ignoring default style)
			for (const style of styles.length > 1 ? styles.slice(1) : styles) {
				if (style.type === 'fill') {
					ctx.fillStyle = style.params.style
					ctx.fill()
				} else if (style.type === 'stroke') {
					ctx.strokeStyle = style.params.style
					ctx.lineWidth = style.params.width
					ctx.stroke()
				}
			}
		} else if (cmd === _SYM('text')) {
			// Text representation:
			// (text "Text" x y option1 value1 option2 value2 ....)
			// e.g. (text "Hello" 100 100 :size 14 :align "center")

			const [text, x, y] = args as [string, number, number]

			const computedStyle = getComputedStyle(document.documentElement)

			let size = parseFloat(computedStyle.fontSize)
			let font = computedStyle.fontFamily
			let align = 'center'
			let baseline = 'middle'

			for (const [option, val] of chunkByCount(args.slice(3), 2)) {
				printer.log(option)
				switch (option) {
					case _SYM(':size'):
						printer.log('size')
						size = val as number
						break
					case _SYM(':font'):
						font = val as string
						break
					case _SYM(':align'):
						align = val as string
						break
					case _SYM(':baseline'):
						baseline = val as string
						break
				}
			}
			ctx.font = `${size}px ${font}`
			ctx.textAlign = align as CanvasTextAlign
			ctx.textBaseline = baseline as CanvasTextBaseline

			// Apply Styles
			for (const style of styles.length > 1 ? styles.slice(1) : styles) {
				for (const style of styles) {
					if (style.type === 'fill') {
						ctx.fillStyle = style.params.style
						ctx.fillText(text, x, y)
					} else if (style.type === 'stroke') {
						ctx.strokeStyle = style.params.style
						ctx.lineWidth = style.params.width
						ctx.strokeText(text, x, y)
					}
				}
			}
		} else if (cmd === _SYM('translate')) {
			ctx.save()
			ctx.translate(args[0] as number, args[1] as number)
			draw(ctx, styles, last)
			ctx.restore()
		} else if (cmd === _SYM('scale')) {
			ctx.save()
			ctx.scale(args[0] as number, args[1] as number)
			draw(ctx, styles, last)
			ctx.restore()
		} else if (cmd === _SYM('rotate')) {
			ctx.save()
			ctx.rotate(args[0] as number)
			draw(ctx, styles, last)
			ctx.restore()
		} else if (cmd === _SYM('$artboard')) {
			const [id, region, body] = args
			const [x, y, w, h] = region

			// Enable Clip
			ctx.save()
			const clipRegion = new Path2D()
			clipRegion.rect(x, y, w, h)
			ctx.clip(clipRegion)

			// Draw inner items
			draw(ctx, styles, body)

			// Restore
			ctx.restore()
		} else {
			for (const a of ast) {
				draw(ctx, styles, a)
			}
		}
	}
}

export const consoleEnv = new Env(replEnv)
consoleEnv.name = 'console'

consoleEnv.set('console/clear', () => {
	printer.clear()
	return null
})

consoleEnv.set('export-artboard', () => {
	const canvas = document.createElement('canvas')
	const ctx = canvas.getContext('2d')

	if (ctx) {
		const canvas = ctx.canvas
		const d = canvas.toDataURL('image/png')
		const w = window.open('about:blank', 'Image for canvas')
		w?.document.write(`<img src=${d} />`)
	}
	return null
})

export function viewREP(str: string, ctx: CanvasRenderingContext2D, selection?: [number, number]) {
	const viewEnv = new Env(replEnv)
	viewEnv.name = 'view'
	replEnv.set('$pens', [])
	replEnv.set('$hands', [])

	let out

	try {
		const src = readStr(str, selection)
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

		ctx.resetTransform()

		const w = ctx.canvas.width
		const h = ctx.canvas.height
		ctx.clearRect(0, 0, w, h)

		const dpi = window.devicePixelRatio || 1
		const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
		ctx.translate(rem * 4, rem * 4)
		ctx.scale(dpi, dpi)

		// Set the default line cap
		ctx.lineCap = 'round'
		ctx.lineJoin = 'round'

		// default style
		const uiBorder = viewEnv.get('$ui-border') as string

		const styles: DrawStyle[] = [
			{type: 'stroke', params: {style: uiBorder, width: 1}}
		]

		try {
			draw(ctx, styles, out)
		} catch (err) {
			printer.error(err.stack)
		}
	}

	return viewEnv
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
