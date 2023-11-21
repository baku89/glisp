import DefaultCanvasCode from '@/default-canvas.glisp?raw'
import {readStr} from '@/mal'
import {isNode, MalError, MalNode} from '@/mal/types'

import {toSketchCode} from '../utils'

export default function useURLParser(onLoadExp: (exp: MalNode) => void) {
	// URL
	const url = new URL(location.href)

	if (url.searchParams.has('clear')) {
		localStorage.removeItem('saved_code')
		localStorage.removeItem('settings')
		url.searchParams.delete('clear')
		history.pushState({}, document.title, url.pathname + url.search)
	}

	// Load initial codes
	const loadCodePromise = (async () => {
		let code = ''

		const queryCodeURL = url.searchParams.get('code_url')
		const queryCode = url.searchParams.get('code')

		if (queryCodeURL) {
			const codeURL = decodeURI(queryCodeURL)
			url.searchParams.delete('code_url')
			url.searchParams.delete('code')

			const res = await fetch(codeURL)
			if (res.ok) {
				code = await res.text()

				if (codeURL.startsWith('http')) {
					code = `;; Loaded from "${codeURL}"\n\n${code}`
				}
			} else {
				new MalError(`Failed to load from "${codeURL}"`)
			}

			history.pushState({}, document.title, url.pathname + url.search)
		} else if (queryCode) {
			code = decodeURI(queryCode)
			url.searchParams.delete('code')
			history.pushState({}, document.title, url.pathname + url.search)
		} else {
			code = localStorage.getItem('saved_code') || DefaultCanvasCode
		}

		return code
	})()

	let onSetupConsole
	const setupConsolePromise = new Promise<void>(resolve => {
		onSetupConsole = () => {
			resolve()
		}
	})

	Promise.all([loadCodePromise, setupConsolePromise]).then(([code]) => {
		const exp = readStr(toSketchCode(code as string))
		if (isNode(exp)) {
			onLoadExp(exp)
		}
	})

	return {onSetupConsole}
}
