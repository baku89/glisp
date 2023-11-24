import dateFormat from 'dateformat'
import FileSaver from 'file-saver'

import {convertJSObjectToExprMap, Expr, printer, Scope, setMeta} from '@/glisp'

import ViewScope from './view'

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

ConsoleScope.def('copy-to-clipboard', (str: Expr) => {
	return copyToClipboard(str as string)
})

ConsoleScope.def(
	'generate-sketch-url',
	setMeta(
		(url: Expr) => {
			return generateSketchURL(url as string)
		},
		convertJSObjectToExprMap({
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

ConsoleScope.def('open-link', (url: Expr) => {
	window.open(url as string, '_blank')
	return `Open URL: ${url}`
})

ConsoleScope.def('clear-console', () => {
	printer.clear()
	return null
})

ConsoleScope.def('download-sketch', (...args: Expr[]) => {
	const filename = generateFilename(args[0] as string)

	const sketch = ConsoleScope.var('*sketch*') as string

	const file = new File([sketch], filename, {
		type: 'text/plain;charset=utf-8',
	})

	FileSaver.saveAs(file)

	return null
})

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
