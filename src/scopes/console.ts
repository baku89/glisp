import dateFormat from 'dateformat'
import FileSaver from 'file-saver'
import {mat3} from 'gl-matrix'

import printExp, {printer} from '@/mal/printer'
import Scope from '@/mal/scope'
import {MalVal, LispError, isKeyword, symbolFor as S} from '@/mal/types'

import createCanvasRender from '@/renderer/CanvasRenderer'

import ViewScope from './view'

const ConsoleScope = new Scope(ViewScope, 'console')

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

ConsoleScope.def('gen-code-url', (codeURL: MalVal) => {
	return generateCodeURL(codeURL as string)
})

ConsoleScope.def('open-link', (url: MalVal) => {
	window.open(url as string, '_blank')
	return `Open URL: ${url}`
})

ConsoleScope.def('clear-console', () => {
	printer.clear()
	return null
})

ConsoleScope.def('prompt', (msg: MalVal) => {
	if (window) {
		return window.prompt(msg as string)
	} else {
		return null
	}
})

ConsoleScope.def('save', (...args: MalVal[]) => {
	const filename = generateFilename(args[0] as string)

	const sketch = ConsoleScope.var('*sketch*') as string

	const file = new File([sketch], filename, {
		type: 'text/plain;charset=utf-8'
	})

	FileSaver.saveAs(file)

	return null
})

ConsoleScope.def('export', (selector: MalVal = null) => {
	const exec = async () => {
		const renderer = await createCanvasRender()

		let viewExp: MalVal | undefined = ConsoleScope.var('*view*')

		if (viewExp === undefined) {
			throw new LispError('Invalid sketch')
		}

		if (viewExp) {
			if (typeof selector === 'string') {
				viewExp = ConsoleScope.eval([
					S('filter-elements'),
					selector,
					S('*view*')
				])
				if (!viewExp) {
					throw new LispError(
						`Element ${printExp(selector, true)} does not exist`
					)
				}
			}

			const bounds = ConsoleScope.eval([S('get-element-bounds'), viewExp])
			if (!bounds) {
				throw new LispError('Cannot retrieve bounds')
			}
			const [x, y, width, height] = bounds as number[]

			renderer.resize(width, height, 1)
			const xform = mat3.fromTranslation(mat3.create(), [-x, -y])
			await renderer.render(viewExp, {viewTransform: xform})
			const image = await renderer.getImage()
			const w = window.open('about:blank', 'Image for canvas')
			w?.document.write(`<img src=${image} />`)
		}
	}

	exec()

	return null
})

ConsoleScope.def('publish-gist', (...args: MalVal[]) => {
	const code = ConsoleScope.var('*sketch*') as string

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
			generateCodeURL(codeURL)

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

export default ConsoleScope
