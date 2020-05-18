import dateFormat from 'dateformat'
import FileSaver from 'file-saver'
import {printer} from '@/mal/printer'
import Scope from '@/mal/scope'

import createCanvasRender from '@/renderer/CanvasRenderer'

import ViewScope, {createViewScope} from './view'
import {
	MalVal,
	LispError,
	isKeyword,
	symbolFor as S,
	keywordFor,
	MalJSFunc
} from '@/mal/types'
import {mat3} from 'gl-matrix'

const ConsoleScope = new Scope(ViewScope, 'console', scope => {
	function generateFilename(name?: string) {
		if (!name) {
			name = `sketch_${dateFormat('mmm-dd-yyyy_HH-MM-ss').toLowerCase()}`
		}
		return `${name}.cljs`
	}

	function generateCodeURL(codeURL: string) {
		const url = new URL(location.href)
		url.searchParams.set('code_url', codeURL)
		const canvasURL = url.toString()

		printer.log(`Canvas URL: ${canvasURL}`)

		navigator.clipboard.writeText(canvasURL).then(() => {
			printer.log('Copied to clipboard')
		})

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

	const fns = [
		[
			'gen-code-url',
			(codeURL: MalVal) => {
				return generateCodeURL(codeURL as string)
			}
		],
		[
			'open-link',
			(url: MalVal) => {
				window.open(url as string, '_blank')
				return `Open URL: ${url}`
			}
		],
		[
			'clear-console',
			() => {
				printer.clear()
				return null
			}
		],
		[
			'prompt',
			(msg: MalVal) => {
				if (window) {
					return window.prompt(msg as string)
				} else {
					return null
				}
			}
		],
		[
			'save',
			(...args: MalVal[]) => {
				const filename = generateFilename(args[0] as string)

				const $sketch = scope.var('$sketch') as string

				const file = new File([$sketch], filename, {
					type: 'text/plain;charset=utf-8'
				})

				FileSaver.saveAs(file)

				return null
			}
		],
		[
			'export',
			(name: MalVal = null) => {
				const exec = async () => {
					let x = 0,
						y = 0,
						width = scope.var('$width') as number,
						height = scope.var('$height') as number

					const renderer = await createCanvasRender()
					const $sketch = scope.var('$sketch')

					const viewScope = createViewScope()

					viewScope.setup({width, height, guideColor: null})
					let $view = viewScope.readEval(`(sketch ${$sketch} \n nil)`)

					if ($view) {
						if (Array.isArray($view)) {
							if (typeof name === 'string') {
								$view = scope.eval([
									S('find-item'),
									keywordFor(`artboard#${name}`),
									$view
								])
								if ($view === null) {
									throw new LispError(
										`Artboard "${name as string}" does not exist`
									)
								} else {
									;[x, y, width, height] = ($view as MalVal[])[1] as number[]
								}
							}
						}

						renderer.resize(width, height, 1)
						const xform = mat3.fromTranslation(mat3.create(), [-x, -y])
						await renderer.render($view, {viewTransform: xform})
						const image = await renderer.getImage()
						const w = window.open('about:blank', 'Image for canvas')
						w?.document.write(`<img src=${image} />`)
					}
				}

				exec()

				return null
			}
		],
		[
			'publish-gist',
			(...args: MalVal[]) => {
				const code = scope.var('$sketch') as string

				// eslint-disable-next-line prefer-const
				let {_: name, user, token} = createHashMap(args)

				if (typeof user !== 'string' || typeof token !== 'string') {
					const saved = localStorage.getItem('gist_api_token')
					if (saved !== null) {
						;({user, token} = JSON.parse(saved) as {
							user: string
							token: string
						})
						printer.log('Using saved API key')
					} else {
						throw new LispError(`Parameters :user and :token must be specified.
	Get the token from https://github.com/settings/tokens/new with 'gist' option turned on.`)
					}
				}

				const filename = generateFilename(name as string)

				async function publishToGist() {
					const res = await fetch('https://api.github.com/gists', {
						method: 'POST',
						headers: {
							Authorization:
								'Basic ' + btoa(`${user as string}:${token as string}`)
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
						generateCodeURL(codeURL)

						localStorage.setItem(
							'gist_api_token',
							JSON.stringify({user, token})
						)
					} else {
						printer.error('Invalid username or token')
					}
				}

				publishToGist()

				printer.log(
					`Publishing to Gist... user=${user as string}, token=${token as string}`
				)

				return null
			}
		]
	] as [string, MalJSFunc][]

	for (const [name, f] of fns) {
		scope.def(name, f)
	}
})

export default ConsoleScope
