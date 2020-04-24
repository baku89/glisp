import dateFormat from 'dateformat'
import Env from './env'
import printExp, {printer} from './printer'
import {replEnv} from './repl'
import readStr, {BlankException} from './reader'
import {
	MalVal,
	LispError,
	isKeyword,
	symbolFor as S,
	keywordFor as K
} from './types'
import evalExp from './eval'
import CanvasRenderer from '@/renderer/CanvasRenderer'
import {viewREP} from './view'
import {mat3} from 'gl-matrix'
import FileSaver from 'file-saver'

export const consoleEnv = new Env(replEnv)
consoleEnv.name = 'console'

function generateFilename(name?: string) {
	if (!name) {
		name = `sketch_${dateFormat('mmm-dd-yyyy_HH-MM-ss').toLowerCase()}`
	}
	return `${name}.cljs`
}

consoleEnv.set(S('console/clear'), () => {
	printer.clear()
	return null
})

consoleEnv.set(S('export'), (name: MalVal = null) => {
	let x = 0,
		y = 0,
		width = consoleEnv.get(S('$width')) as number,
		height = consoleEnv.get(S('$height')) as number

	const canvas = document.createElement('canvas')
	const renderer = new CanvasRenderer(canvas)

	const $canvas = consoleEnv.get(S('$canvas'))

	const {env, output} = viewREP(`(def $view (eval-sketch ${$canvas} \n nil))`, {
		width,
		height,
		updateConsole: false,
		drawGuide: false
	})

	let $view = output

	if (env) {
		if (Array.isArray(output)) {
			if (typeof name === 'string') {
				$view = evalExp([S('find-item'), K(`artboard#${name}`), $view], env)
				if ($view === null) {
					throw new LispError(`Artboard "${name as string}" does not exist`)
				} else {
					;[x, y, width, height] = ($view as MalVal[])[1] as number[]
				}
			}
		}

		const exec = async () => {
			renderer.resize(width, height, 1)
			const xform = mat3.fromTranslation(mat3.create(), [-x, -y])
			await renderer.render($view, {viewTransform: xform})
			const image = await renderer.getImage()
			const w = window.open('about:blank', 'Image for canvas')
			w?.document.write(`<img src=${image} />`)
		}

		exec()
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

consoleEnv.set(S('save'), (...args: MalVal[]) => {
	const filename = generateFilename(args[0] as string)

	const $canvas = consoleEnv.get(S('$canvas')) as string

	const file = new File([$canvas], filename, {
		type: 'text/plain;charset=utf-8'
	})

	FileSaver.saveAs(file)

	return null
})

consoleEnv.set(S('publish-gist'), (...args: MalVal[]) => {
	const code = consoleEnv.get(S('$canvas')) as string

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

export const consoleREP = (str: string, output = true) => {
	try {
		const out = evalExp(readStr(str), consoleEnv)
		if (output) {
			printer.return(printExp(out))
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
