import EventEmitter from 'eventemitter3'
import dateFormat from 'dateformat'

import {replEnv, READ, EVAL, PRINT, LispError} from './repl'
import Env from './env'
import {MalVal, keywordFor as K, isKeyword} from './types'
import {printer} from './printer'
import readStr from './reader'

import {BlankException} from './reader'
import {iterateSegment} from './ns/path'
import {partition} from './ns/core'

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
	K_ENABLE_ANIMATION = K('enable-animation'),
	K_FILL = K('fill'),
	K_STROKE = K('stroke'),
	K_PATH = K('path'),
	K_TEXT = K('text'),
	K_TRANSLATE = K('translate'),
	K_SCALE = K('scale'),
	K_ROTATE = K('rotate'),
	K_ARTBOARD = K('artboard'),
	K_STYLE = K('style'),
	K_WIDTH = K('width'),
	K_CAP = K('cap'),
	K_JOIN = K('join'),
	K_DASH = K('dash')

type DrawParams = Map<string, string | number | number[]>

interface DrawStyle {
	type: string
	params: DrawParams
}

function isValidColor(str: string) {
	const s = new Option().style
	s.color = str
	return s.color === str
}

function createFillOrStrokeStyle(
	ctx: CanvasRenderingContext2D,
	style: string | any[]
) {
	if (typeof style === 'string') {
		return style
	} else if (Array.isArray(style)) {
		const [type, params] = style as [string, Map<string, any[]>]
		switch (type) {
			case K('linear-gradient'): {
				const [x0, y0, x1, y1] = params.get(K('points')) as number[]
				const stops = params.get(K('stops')) as (string | number)[]
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
	ctx: CanvasRenderingContext2D,
	styles: DrawStyle[],
	defaultStyle: DrawStyle | null,
	text?: string,
	x?: number,
	y?: number
) {
	styles = styles.length > 0 ? styles : defaultStyle ? [defaultStyle] : []

	const isText = text !== undefined

	ctx.save()
	for (const {type, params} of styles) {
		if (type === K_FILL) {
			ctx.fillStyle = createFillOrStrokeStyle(
				ctx,
				params.get(K_STYLE) as string
			)
			if (isText) {
				ctx.fillText(text as string, x as number, y as number)
			} else {
				ctx.fill()
			}
		} else if (type === K_STROKE) {
			for (const [k, v] of (params as DrawParams).entries()) {
				switch (k) {
					case K_STYLE:
						ctx.strokeStyle = createFillOrStrokeStyle(ctx, v as string)
						break
					case K_WIDTH:
						ctx.lineWidth = v as number
						break
					case K_CAP:
						ctx.lineCap = v as CanvasLineCap
						break
					case K_JOIN:
						ctx.lineJoin = v as CanvasLineJoin
						break
					case K_DASH:
						ctx.setLineDash(v as number[])
				}
			}
			if (isText) {
				ctx.strokeText(text as string, x as number, y as number)
			} else {
				ctx.stroke()
			}
		}
	}
	ctx.restore()
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
		} else {
			switch (cmd) {
				case K_FILL: {
					const style: DrawStyle = {
						type: K_FILL,
						params: args[0]
					}
					draw(ctx, last, [style, ...styles], defaultStyle)
					break
				}
				case K_STROKE: {
					const style: DrawStyle = {
						type: K_STROKE,
						params: args[0]
					}
					draw(ctx, last, [style, ...styles], defaultStyle)
					break
				}
				case K_PATH: {
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
					applyDrawStyle(ctx, styles, defaultStyle)
					break
				}
				case K_TEXT: {
					// Text representation:
					// (:text "Text" x y {:option1 value1...})
					const [text, x, y, options] = args
					const computedStyle = getComputedStyle(document.documentElement)
					const settings: any = {
						size: parseFloat(computedStyle.fontSize),
						font: computedStyle.fontFamily,
						align: 'center',
						baseline: 'middle'
					}

					if (options instanceof Map) {
						for (const [k, v] of options.entries()) {
							settings[(k as string).slice(1)] = v
						}
					}

					ctx.font = `${settings.size}px ${settings.font}`
					ctx.textAlign = settings.align as CanvasTextAlign
					ctx.textBaseline = settings.baseline as CanvasTextBaseline

					// Apply Styles
					applyDrawStyle(ctx, styles, defaultStyle, text, x, y)

					break
				}
				case K_TRANSLATE:
					ctx.save()
					ctx.translate(args[0] as number, args[1] as number)
					draw(ctx, last, styles, defaultStyle)
					ctx.restore()
					break
				case K_SCALE:
					ctx.save()
					ctx.scale(args[0] as number, args[1] as number)
					draw(ctx, last, styles, defaultStyle)
					ctx.restore()
					break
				case K_ROTATE:
					ctx.save()
					ctx.rotate(args[0] as number)
					draw(ctx, last, styles, defaultStyle)
					ctx.restore()
					break
				case K_BACKGROUND: {
					const color = args[0]
					if (
						typeof color === 'string' &&
						color !== '' &&
						isValidColor(color)
					) {
						// only execute if the color is valid
						viewHandler.emit('set-background', color)
						ctx.fillStyle = color
						ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
					}
					break
				}
				case K_ARTBOARD: {
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
					break
				}
				case K_ENABLE_ANIMATION: {
					let fps = args[0]
					fps = 0.1 < fps && fps < 60 ? fps : -1
					viewHandler.emit('enable-animation', fps)
					break
				}
				default:
					break
				// printer.error('Unknown rendering command', PRINT(cmd))
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
		// console.time('read')
		const src = typeof str === 'string' ? readStr(str) : str
		// console.timeEnd('read')
		// console.time('eval')
		out = EVAL(src, viewEnv)
		// console.timeEnd('eval')
	} catch (err) {
		if (err instanceof LispError) {
			printer.error(err)
		} else {
			printer.error(err.stack)
		}
		renderSucceed = false
	}

	console.time('render')

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
			type: K_STROKE,
			params: new Map<string, string | number>([
				[K_STYLE, uiBorder],
				[K_WIDTH, 1]
			])
		}

		try {
			draw(ctx, out, [], defaultStyle)
		} catch (err) {
			printer.error(err.stack)
			renderSucceed = false
		}
	}

	console.timeEnd('render')

	viewHandler.emit('render', renderSucceed)

	return renderSucceed ? viewEnv : false
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
