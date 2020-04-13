import EventEmitter from 'eventemitter3'
import dateFormat from 'dateformat'

import {replEnv, READ, EVAL, PRINT, LispError} from './repl'
import Env from './env'
import {MalVal, keywordFor as K, isKeyword} from './types'
import {printer} from './printer'
import readStr from './reader'

import {BlankException} from './reader'
import {iterateSegment} from './path'
import {chunkByCount} from './core'

export const viewHandler = new EventEmitter()

replEnv.set('$insert', (item: MalVal) => {
	viewHandler.emit('$insert', item)
	return null
})

const S = Symbol.for

const SYM_M = S('M')
const SYM_L = S('L')
const SYM_C = S('C')
const SYM_Z = S('Z')

interface DrawStyleFill {
	type: 'fill'
	params: {style: string}
}

interface DrawStyleStroke {
	type: 'stroke'
	params: {style: string; width: number}
}

type DrawStyle = DrawStyleFill | DrawStyleStroke

function draw(
	ctx: CanvasRenderingContext2D,
	ast: MalVal,
	styles: DrawStyle[],
	defaultStyle?: DrawStyle
) {
	if (Array.isArray(ast)) {
		const [cmd, ...args] = ast as any[]

		const last = args.length > 0 ? args[args.length - 1] : null

		if (cmd === S('background')) {
			const color = args[0]
			if (typeof color === 'string') {
				viewHandler.emit('set-background', args[0])
			}
		} else if (cmd === S('fill')) {
			const style: DrawStyleFill = {
				type: 'fill',
				params: {style: args[0] as string}
			}
			draw(ctx, last, [style, ...styles], defaultStyle)
		} else if (cmd === S('stroke')) {
			const style: DrawStyleStroke = {
				type: 'stroke',
				params: {style: args[0] as string, width: args[1]}
			}
			draw(ctx, last, [style, ...styles], defaultStyle)
		} else if (cmd === S('path')) {
			ctx.beginPath()
			for (const [c, ...a] of iterateSegment(args)) {
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
			for (const style of styles.length > 0
				? styles
				: defaultStyle
				? [defaultStyle]
				: []) {
				if (style.type === 'fill') {
					ctx.fillStyle = style.params.style
					ctx.fill()
				} else if (style.type === 'stroke') {
					ctx.strokeStyle = style.params.style
					ctx.lineWidth = style.params.width
					ctx.stroke()
				}
			}
		} else if (cmd === S('text')) {
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
					case K('size'):
						size = val as number
						break
					case K('font'):
						font = val as string
						break
					case K('align'):
						align = val as string
						break
					case K('baseline'):
						baseline = val as string
						break
				}
			}
			ctx.font = `${size}px ${font}`
			ctx.textAlign = align as CanvasTextAlign
			ctx.textBaseline = baseline as CanvasTextBaseline

			// Apply Styles
			for (const style of styles.length > 0
				? styles
				: defaultStyle
				? [defaultStyle]
				: []) {
				if (style.type === 'fill') {
					ctx.fillStyle = style.params.style
					ctx.fillText(text, x, y)
				} else if (style.type === 'stroke') {
					ctx.strokeStyle = style.params.style
					ctx.lineWidth = style.params.width
					ctx.strokeText(text, x, y)
				}
			}
		} else if (cmd === S('translate')) {
			ctx.save()
			ctx.translate(args[0] as number, args[1] as number)
			draw(ctx, last, styles, defaultStyle)
			ctx.restore()
		} else if (cmd === S('scale')) {
			ctx.save()
			ctx.scale(args[0] as number, args[1] as number)
			draw(ctx, last, styles, defaultStyle)
			ctx.restore()
		} else if (cmd === S('rotate')) {
			ctx.save()
			ctx.rotate(args[0] as number)
			draw(ctx, last, styles, defaultStyle)
			ctx.restore()
		} else if (cmd === S(':artboard')) {
			const [region, body] = args.slice(1)
			const [x, y, w, h] = region

			// Enable Clip
			ctx.save()
			const clipRegion = new Path2D()
			clipRegion.rect(x, y, w, h)
			ctx.clip(clipRegion)

			// Draw inner items
			draw(ctx, body, styles, defaultStyle)

			// Restore
			ctx.restore()
		} else {
			for (const a of ast) {
				draw(ctx, a, styles, defaultStyle)
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

consoleEnv.set('export', (name: MalVal = null) => {
	const canvas = document.createElement('canvas')
	let x = 0,
		y = 0,
		width = consoleEnv.get('$width') as number,
		height = consoleEnv.get('$height') as number
	const ctx = canvas.getContext('2d')

	let $view = consoleEnv.get('$view')

	if (Array.isArray($view) && ctx) {
		if (name !== null) {
			$view = EVAL(
				[S('extract-artboard'), name, [S('quote'), $view]],
				consoleEnv
			)
			if ($view === null) {
				throw new LispError(`Artboard "${name as string}" not found`)
			} else {
				;[x, y, width, height] = ($view as MalVal[])[2] as number[]
			}
		}

		canvas.width = width
		canvas.height = height
		ctx.translate(-x, -y)

		// Set the default line cap
		ctx.lineCap = 'round'
		ctx.lineJoin = 'round'

		// eslint-disable-next-line @typescript-eslint/no-use-before-define
		draw(ctx, $view, [])
		const d = canvas.toDataURL('image/png')
		const w = window.open('about:blank', 'Image for canvas')
		w?.document.write(`<img src=${d} />`)
	}
	return null
})

function createHashMap(arr: MalVal[]) {
	const ret: {[key: string]: MalVal | MalVal[]} = {}
	const counts: {[key: string]: number} = {}

	for (let i = 0, keyword = '_'; i < arr.length; i++) {
		if (isKeyword(arr[i])) {
			keyword = (arr[i] as string).slice(1)
			counts[keyword] = 0
		} else {
			if (++counts[keyword] === 1) {
				ret[keyword] = arr[i]
			} else if (counts[keyword] === 2) {
				ret[keyword] = [ret[keyword], arr[i]]
			} else {
				;(ret[keyword] as MalVal[]).push(arr[i])
			}
		}
	}
	return ret
}

consoleEnv.set('publish-gist', (...args: MalVal[]) => {
	const code = consoleEnv.get('$canvas') as string

	// eslint-disable-next-line prefer-const
	let {_: name, user, token} = createHashMap(args)

	if (typeof user !== 'string' || typeof token !== 'string') {
		const saved = localStorage.getItem('gist_api_token')
		if (saved !== null) {
			;({user, token} = JSON.parse(saved) as {user: string; token: string})
			printer.log('Using saved API key')
		} else {
			throw new LispError(`Parameters :user and :token must be specified.
Get the token from https://github.com/settings/tokens/new with 'gist' option turned on.`)
		}
	}

	let filename: string
	if (typeof name === 'string') {
		filename = `${name}.lisp`
	} else {
		filename = `sketch_${dateFormat('mmm-dd-yyyy_HH-MM-ss').toLowerCase()}.lisp`
	}

	async function publishToGist() {
		const res = await fetch('https://api.github.com/gists', {
			method: 'POST',
			headers: {
				Authorization: 'Basic ' + btoa(`${user as string}:${token as string}`)
			},
			body: JSON.stringify({
				public: true,
				files: {
					[filename]: {
						content: code
					}
				}
			})
		})

		if (res.ok) {
			const data = await res.json()

			const codeURL = data.files[filename].raw_url

			const url = new URL(location.href)
			url.searchParams.set('code_url', codeURL)
			const canvasURL = url.toString()

			printer.log(`Canvas URL: ${canvasURL}`)

			await navigator.clipboard.writeText(canvasURL)

			printer.log('Copied to clipboard')

			localStorage.setItem('gist_api_key', JSON.stringify({user, token}))
		} else {
			printer.error('Invalid username or token')
		}
	}

	publishToGist()

	printer.log(
		`Publishing to Gist... user=${user as string}, token=${token as string}`
	)

	return null
})

export function viewREP(
	str: string | MalVal,
	ctx: CanvasRenderingContext2D,
	selection?: [number, number]
) {
	replEnv.set('$pens', [])
	replEnv.set('$hands', [])

	const viewEnv = new Env(replEnv)
	viewEnv.name = 'view'

	const dpi = window.devicePixelRatio
	viewEnv.set('$width', ctx.canvas.width / dpi)
	viewEnv.set('$height', ctx.canvas.height / dpi)

	let out

	try {
		const src = typeof str === 'string' ? readStr(str, selection) : str
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

		const defaultStyle: DrawStyle = {
			type: 'stroke',
			params: {style: uiBorder, width: 1}
		}

		try {
			draw(ctx, out, [], defaultStyle)
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
