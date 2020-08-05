import dateFormat from 'dateformat'
import FileSaver from 'file-saver'
import printExp, {printer} from '@/mal/printer'
import Scope from '@/mal/scope'
import {
	MalVal,
	MalError,
	isKeyword,
	symbolFor as S,
	keywordFor as K,
	createList as L,
	setMeta,
	assocBang,
} from '@/mal/types'
import GIF from 'gif.js'

import ViewScope, {createViewScope} from './view'
import renderToSvg from '@/renderer/render-to-svg'
import {convertJSObjectToMalMap, convertMalNodeToJSObject} from '@/mal/reader'
import getRendereredImage from '@/renderer/get-rendererd-image'

const ConsoleScope = new Scope(ViewScope, 'console')

function generateFilename(name?: string) {
	if (!name) {
		name = `sketch_${dateFormat('mmm-dd-yyyy_HH-MM-ss').toLowerCase()}`
	}
	return `${name}.glisp`
}

function copyToClipboard(str: string) {
	navigator.clipboard.writeText(str).then(() => {
		printer.log('Copied to clipboard')
	})

	return null
}

function generateSketchURL(codeURL: string) {
	const url = new URL(location.href)
	url.searchParams.set('code_url', codeURL)
	const canvasURL = url.toString()

	copyToClipboard(canvasURL)

	printer.log(`Sketch URL: ${canvasURL}`)

	return null
}

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

ConsoleScope.def('copy-to-clipboard', (str: MalVal) => {
	return copyToClipboard(str as string)
})

ConsoleScope.def(
	'generate-sketch-url',
	setMeta(
		(url: MalVal) => {
			return generateSketchURL(url as string)
		},
		convertJSObjectToMalMap({
			doc: 'Generates Code URL',
			params: [
				{
					label: 'Source',
					type: 'string',
				},
			],
			'initial-params': [''],
		})
	)
)

ConsoleScope.def('open-link', (url: MalVal) => {
	window.open(url as string, '_blank')
	return `Open URL: ${url}`
})

ConsoleScope.def('clear-console', () => {
	printer.clear()
	return null
})

ConsoleScope.def('download-sketch', (...args: MalVal[]) => {
	const filename = generateFilename(args[0] as string)

	const sketch = ConsoleScope.var('*sketch*') as string

	const file = new File([sketch], filename, {
		type: 'text/plain;charset=utf-8',
	})

	FileSaver.saveAs(file)

	return null
})

ConsoleScope.def('copy-as-svg', () => {
	const viewExp: MalVal | undefined = ConsoleScope.var('*view*')

	const svg = renderToSvg(viewExp, 500, 500)
	copyToClipboard(svg)
	return null
})

const renderViewScope = createViewScope()
let renderWindow: Window | null

ConsoleScope.def(
	'export-image',
	setMeta(
		(...xs: MalVal[]) => {
			const exec = async () => {
				const sketch = ConsoleScope.var('*sketch*') as string
				const code = `(sketch ${sketch}\nnil)`

				renderViewScope.setup({guideColor: null})
				let viewExp = renderViewScope.readEval(code)

				if (viewExp === undefined) {
					throw new MalError('Invalid sketch')
				}

				const options = convertMalNodeToJSObject(assocBang({}, ...xs))

				if (options.selector) {
					viewExp = ConsoleScope.eval(
						L(S('filter-elements'), options.selector, viewExp)
					)
					if (!viewExp) {
						throw new MalError(
							`Element ${printExp(options.selector, true)} does not exist`
						)
					}
				}

				const bounds = ConsoleScope.eval(
					L(S('get-element-bounds'), viewExp)
				) as number[]
				if (!bounds) {
					throw new MalError('Cannot retrieve bounds')
				}

				const image = await getRendereredImage(viewExp, {
					format: options.format,
					scaling: options.scaling,
					bounds,
				})

				if (renderWindow) {
					renderWindow.close()
				}

				renderWindow = window.open('about:blank', 'Image for canvas')
				renderWindow?.document.write(`<img src=${image} />`)

				console.timeEnd('render')
			}

			exec()

			return null
		},
		convertJSObjectToMalMap({
			doc: 'Renders and exports a sketch',
			params: [
				{
					type: 'map',
					variadic: 'true',
					items: [
						{
							key: K('format'),
							type: 'string',
							ui: 'dropdown',
							values: ['png', 'jpeg', 'webp'],
						},
						{
							key: K('scaling'),
							type: 'number',
							default: 1,
							validator: (x: number) => Math.round(Math.max(1, x) * 2) / 2,
						},
						{key: K('selector'), type: 'string', default: ''},
					],
				},
			],
			'initial-params': [
				K('format'),
				'png',
				K('scaling'),
				1,
				K('selector'),
				'',
			],
		})
	)
)

ConsoleScope.def(
	'export-video',
	setMeta(
		(...xs: MalVal[]) => {
			const options = {
				format: 'gif',
				scaling: 1,
				symbol: 'time',
				start: 0,
				duration: 1,
				fps: 24,
				bounds: [0, 0, 200, 200],
				...convertMalNodeToJSObject(assocBang({}, ...xs)),
			} as {
				format: 'gif'
				scaling: number
				symbol: string
				start: number
				duration: number
				fps: number
				bounds: number[]
			}

			const renderTime = async (time: number) => {
				const sketch = ConsoleScope.var('*sketch*') as string
				const code = `(sketch-at-time "${options.symbol}" ${time} ${sketch}\nnil)`

				renderViewScope.setup({guideColor: null})
				const viewExp = renderViewScope.readEval(code)
				if (viewExp === undefined) {
					throw new MalError('Invalid sketch')
				}

				const image = await getRendereredImage(viewExp, {
					format: options.format,
					scaling: options.scaling,
					bounds: options.bounds,
				})

				return image
			}

			const exec = async () => {
				const gif = new GIF({workers: 2, quality: 10})

				const startTime = performance.now()

				const frameCount = Math.round(options.duration * options.fps)
				const frameDuration = 1 / options.fps
				const times = Array(frameCount)
					.fill(0)
					.map((_, i) => [i * frameDuration, i])

				for (const [time, i] of times) {
					const data = (await renderTime(time)) as string
					const img = new Image()
					img.src = data
					img.width = options.bounds[2] * options.scaling
					img.height = options.bounds[3] * options.scaling
					gif.addFrame(img, {delay: frameDuration * 1000})

					printer.log(`Rendering... ${i + 1}/${frameCount} Frames`)
				}

				gif.on('finished', (blob: Blob) => {
					const deltaTime = (performance.now() - startTime) / 1000
					printer.log(`Render finished. ${deltaTime.toFixed(1)}s`)

					window.open(URL.createObjectURL(blob))
				})

				gif.render()
			}

			exec()

			return null
		},
		convertJSObjectToMalMap({
			doc: 'Exports a video',
			params: [
				{
					type: 'map',
					variadic: true,
					items: [
						{
							key: K('format'),
							type: 'string',
							ui: 'dropdown',
							values: ['gif'],
						},
						{
							key: K('scaling'),
							type: 'number',
							default: 1,
							validator: (x: number) => Math.round(Math.max(1, x) * 2) / 2,
						},
						{key: K('symbol'), type: 'string'},
						{key: K('start'), type: 'number', default: 0},
						{key: K('duration'), type: 'number', default: 1},
						{key: K('fps'), label: 'FPS', type: 'number', default: 24},
						{key: K('bounds'), type: 'rect2d', default: [0, 0, 100, 100]},
					],
				},
			],
			'initial-params': [
				K('format'),
				'gif',
				K('scaling'),
				1,
				K('symbol'),
				'time',
				K('start'),
				0,
				K('duration'),
				1,
				K('fps'),
				24,
				K('bounds'),
				[0, 0, 200, 200],
			],
		})
	)
)

ConsoleScope.def(
	'publish-gist',
	setMeta(
		(...args: MalVal[]) => {
			const code = ConsoleScope.var('*sketch*') as string

			// eslint-disable-next-line prefer-const
			const {_: name, user, token} = createHashMap(args)

			if (typeof user !== 'string' || typeof token !== 'string') {
				throw new MalError(`Parameters :user and :token must be specified.
	Get the token from https://github.com/settings/tokens/new with 'gist' option turned on.`)
			}

			localStorage.setItem('gist_api_token', JSON.stringify({user, token}))

			const filename = generateFilename(name as string)

			async function publishToGist() {
				const res = await fetch('https://api.github.com/gists', {
					method: 'POST',
					headers: {
						Authorization:
							'Basic ' + btoa(`${user as string}:${token as string}`),
					},
					body: JSON.stringify({
						public: true,
						files: {
							[filename]: {
								content: code,
							},
						},
					}),
				})

				if (res.ok) {
					const data = await res.json()

					const codeURL = data.files[filename].raw_url
					generateSketchURL(codeURL)
				} else {
					printer.error('Invalid username or token')
				}
			}

			publishToGist()

			printer.log(`Publishing to Gist... user=${user}, token=${token}`)

			return null
		},
		convertJSObjectToMalMap({
			doc:
				'Publishes the current sketch to Gist then generates Code URL. Please set `user` to your GitHub username and `token` to a personal access token that you can generate from [Developer Settings](https://github.com/settings/tokens/new) with the **gist** option turned on.',
			params: [
				{
					label: 'Name',
					type: 'string',
				},
				{
					type: 'map',
					variadic: true,
					items: [
						{
							key: K('user'),
							label: 'User',
							type: 'string',
						},
						{
							key: K('token'),
							label: 'Token',
							type: 'string',
						},
					],
				},
			],
			'initial-params': () => {
				const sketchName = generateFilename()

				let user = '',
					token = ''

				const saved = localStorage.getItem('gist_api_token')
				if (saved !== null) {
					;({user, token} = JSON.parse(saved) as {
						user: string
						token: string
					})
				}

				return [sketchName, K('user'), user, K('token'), token]
			},
		})
	)
)

ConsoleScope.def('generate-embed-url', () => {
	const sketch = ConsoleScope.var('*sketch*') as string

	const url = new URL('embed.html', globalThis.location.href)
	url.searchParams.set('code', encodeURI(sketch))
	const urlString = url.toString()

	copyToClipboard(urlString)

	printer.log(`Embed URL: ${urlString}`)

	return null
})

export default ConsoleScope
