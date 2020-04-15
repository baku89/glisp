import EventEmitter from 'eventemitter3'
import dateFormat from 'dateformat'

import {replEnv, READ, EVAL, PRINT, LispError} from './repl'
import Env from './env'
import {MalVal, keywordFor as K, isKeyword} from './types'
import {printer} from './printer'
import readStr from './reader'

import {BlankException} from './reader'
import {iterateSegment} from './path'
import {partition} from './core'

export const viewHandler = new EventEmitter()

replEnv.set('$insert', (item: MalVal) => {
	viewHandler.emit('$insert', item)
	return null
})

const S = Symbol.for

const K_M = K('M'),
	K_L = K('L'),
	K_C = K('C'),
	K_Z = K('Z'),
	K_BACKGROUND = K('background'),
	K_FILL = K('fill'),
	K_STROKE = K('stroke'),
	K_PATH = K('path'),
	K_TEXT = K('text'),
	K_TRANSLATE = K('translate'),
	K_SCALE = K('scale'),
	K_ROTATE = K('rotate'),
	K_ARTBOARD = K('artboard')

interface DrawStyleFill {
	type: 'fill'
	params: {style: string}
}

interface DrawStyleStroke {
	type: 'stroke'
	params: {style: string; width: number}
}

type DrawStyle = DrawStyleFill | DrawStyleStroke

function isValidColor(str: string) {
	const s = new Option().style
	s.color = str
	return s.color === str
}

function draw(
	ctx: CanvasRenderingContext2D,
	ast: MalVal,
	styles: DrawStyle[],
	defaultStyle: DrawStyle | null
) {
	if (Array.isArray(ast)) {
		// console.log(ast)
		const [cmd, ...args] = ast as any[]

		const last = args.length > 0 ? args[args.length - 1] : null

		if (!isKeyword(cmd)) {
			for (const a of ast) {
				draw(ctx, a, styles, defaultStyle)
			}
		} else if (cmd === K_BACKGROUND) {
			const color = args[0]
			if (typeof color === 'string' && color !== '' && isValidColor(color)) {
				// only execute if the color is valid
				viewHandler.emit('set-background', color)
				ctx.fillStyle = color
				ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
			}
		} else if (cmd === K_FILL) {
			const style: DrawStyleFill = {
				type: 'fill',
				params: {style: args[0] as string}
			}
			draw(ctx, last, [style, ...styles], defaultStyle)
		} else if (cmd === K_STROKE) {
			const style: DrawStyleStroke = {
				type: 'stroke',
				params: {style: args[0] as string, width: args[1]}
			}
			draw(ctx, last, [style, ...styles], defaultStyle)
		} else if (cmd === K_PATH) {
			ctx.beginPath()
			for (const [c, ...a] of iterateSegment(args)) {
				switch (c) {
					case K_M:
						ctx.moveTo(...(a as [number, number]))
						break
					case K_L:
						ctx.lineTo(...(a as [number, number]))
						break
					case K_C:
						ctx.bezierCurveTo(
							...(a as [number, number, number, number, number, number])
						)
						break
					case K_Z:
						ctx.closePath()
						break
					default: {
						throw new Error(`Invalid d-path command: ${PRINT(c)}`)
					}
				}
			}
			// Apply Styles
			ctx.save()
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
			ctx.restore()
		} else if (cmd === K_TEXT) {
			// Text representation:
			// (:text "Text" x y :option1 value1 :option2 value2 ....)
			// e.g. (text "Hello" 100 100 :size 14 :align "center")

			const [text, x, y] = args as [string, number, number]

			const computedStyle = getComputedStyle(document.documentElement)

			let size = parseFloat(computedStyle.fontSize)
			let font = computedStyle.fontFamily
			let align = 'center'
			let baseline = 'middle'

			for (const [option, val] of partition(2, args.slice(3))) {
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
			ctx.save()
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
			ctx.restore()
		} else if (cmd === K_TRANSLATE) {
			ctx.save()
			ctx.translate(args[0] as number, args[1] as number)
			draw(ctx, last, styles, defaultStyle)
			ctx.restore()
		} else if (cmd === K_SCALE) {
			ctx.save()
			ctx.scale(args[0] as number, args[1] as number)
			draw(ctx, last, styles, defaultStyle)
			ctx.restore()
		} else if (cmd === K_ROTATE) {
			ctx.save()
			ctx.rotate(args[0] as number)
			draw(ctx, last, styles, defaultStyle)
			ctx.restore()
		} else if (cmd === K_ARTBOARD) {
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
			printer.error('Unknown renderign command', PRINT(cmd))
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
		draw(ctx, $view, [], null)
		const d = canvas.toDataURL('image/png')
		const w = window.open('about:blank', 'Image for canvas')
		w?.document.write(`<img src=${d} />`)
	}
	return null
})

function createHashMap(arr: MalVal[]) {
	const ret: {[key: string]: MalVal | MalVal[]} = {}
	const counts: {[key: string]: number} = {}

	counts['_'] = 0

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

			localStorage.setItem('gist_api_token', JSON.stringify({user, token}))
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

export function viewREP(str: string | MalVal, ctx: CanvasRenderingContext2D) {
	replEnv.set('$pens', [])
	replEnv.set('$hands', [])

	const viewEnv = new Env(replEnv)
	viewEnv.name = 'view'

	const dpi = window.devicePixelRatio
	viewEnv.set('$width', ctx.canvas.width / dpi)
	viewEnv.set('$height', ctx.canvas.height / dpi)

	let out

	let renderSucceed = true

	try {
		const src = typeof str === 'string' ? readStr(str) : str
		out = EVAL(src, viewEnv)
	} catch (err) {
		if (err instanceof LispError) {
			printer.error(err)
		} else {
			printer.error(err.stack)
		}
		renderSucceed = false
	}

	if (out !== undefined) {
		// Draw
		consoleEnv.outer = viewEnv

		ctx.resetTransform()

		const w = ctx.canvas.width
		const h = ctx.canvas.height
		ctx.clearRect(0, 0, w, h)

		const dpi = window.devicePixelRatio || 1
		ctx.scale(dpi, dpi)

		// Set the default line cap
		ctx.lineCap = 'round'
		ctx.lineJoin = 'round'

		// default style
		const uiBorder = viewEnv.get('$guide-color') as string

		const defaultStyle: DrawStyle = {
			type: 'stroke',
			params: {style: uiBorder, width: 1}
		}

		try {
			draw(ctx, out, [], defaultStyle)
		} catch (err) {
			printer.error(err.stack)
			renderSucceed = false
		}
	}

	viewHandler.emit('render', renderSucceed)

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
