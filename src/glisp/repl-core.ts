import {vsprintf} from 'sprintf-js'

import interop from './interop'
import {parse} from './parse'
import {printer, printExpr} from './print'
import {Expr, GlispError, symbolFor as S} from './types'
import {setMeta} from './utils'

// String functions
export const slurp = (() => {
	return (url: string) => {
		const req = new XMLHttpRequest()
		// const hashedUrl =
		// 	url + (/\?/.test(url) ? '&' : '?') + new Date().getTime()
		// req.open('GET', hashedUrl, false)
		req.open('GET', url, false)
		req.send()
		if (req.status !== 200) {
			throw new GlispError(`Failed to slurp file: ${url}`)
		}
		return req.responseText
	}
})()

// Interop
function jsEval(str: string): Expr {
	return eval(str.toString())
}

function jsMethodCall(objMethodStr: string, ...args: Expr[]): Expr {
	const [obj, f] = interop.resolveJS(objMethodStr)
	return f.apply(obj, args)
}

const Exports = [
	[
		'throw',
		(msg: string) => {
			throw new GlispError(msg)
		},
	],

	// Standard Output
	[
		'prn',
		(...a: Expr[]) => {
			printer.log(...a.map(e => printExpr(e)))
			return null
		},
	],
	[
		'print-str',
		(...a: Expr[]) => {
			return a.map(e => printExpr(e)).join(' ')
		},
	],
	[
		'println',
		(...a: Expr[]) => {
			printer.log(...a.map(e => printExpr(e)))
			return null
		},
	],

	// I/O
	['read-string', parse],
	['slurp', slurp],

	// Interop
	['js-eval', jsEval],
	['.', jsMethodCall],

	// Needed in import-force
	['format', (fmt: string, ...xs: (number | string)[]) => vsprintf(fmt, xs)],

	['*host-language*', 'JavaScript'],

	// Special forms annoations
	['&', S('&')],
	[
		'def',
		setMeta(() => null, {
			doc: 'Defines a variable',
			params: [
				{label: 'Symbol', type: 'symbol'},
				{label: 'Value', type: 'any'},
			],
		}),
	],
	[
		'defvar',
		setMeta(() => null, {
			doc: 'Creates a variable which can be changed by the bidirectional evaluation',
			params: [
				{label: 'Symbol', type: 'symbol'},
				{label: 'Value', type: 'any'},
			],
		}),
	],
	[
		'let',
		setMeta(() => null, {
			doc: 'Creates a lexical scope',
			params: [
				{label: 'Binds', type: 'exp'},
				{label: 'Body', type: 'exp'},
			],
		}),
	],
	[
		'binding',
		setMeta(() => null, {
			doc: 'Creates a new binding',
			params: [
				{label: 'Binds', type: 'exp'},
				{label: 'Body', type: 'exp'},
			],
		}),
	],
	[
		'eval*',
		setMeta(() => null, {
			doc: 'Inside macro, evaluates the expression in a scope that called macro. Otherwise, executes *eval* normally',
			params: [{label: 'Form', type: 'exp'}],
		}),
	],
	[
		'quote',
		setMeta(() => null, {
			doc: 'Quote',
			params: [{label: 'Form', type: 'exp'}],
		}),
	],
	[
		'=>',
		setMeta(() => null, {
			doc: 'Defines a function',
			params: [
				{label: 'Params', type: 'exp'},
				{label: 'Form', type: 'exp'},
			],
		}),
	],
	[
		'macro',
		setMeta(() => null, {
			doc: '',
			params: [
				{label: 'Param', type: 'exp'},
				{label: 'Form', type: 'exp'},
			],
		}),
	],
	[
		'macroexpand',
		setMeta(() => null, {
			doc: 'Expands the macro',
			params: [],
		}),
	],
	[
		'try',
		setMeta(() => null, {
			doc: 'Try',
			params: [],
		}),
	],
	[
		'catch',
		setMeta(() => null, {
			doc: 'Catch',
			params: [],
		}),
	],
	[
		'do',
		setMeta(() => null, {
			doc: 'Evaluates *forms* in order and returns the value of the last',
			params: [
				{
					type: 'vector',
					variadic: true,
					items: {label: 'Form', type: 'any'},
				},
			],
		}),
	],
	[
		'if',
		setMeta(() => null, {
			doc: 'If statement. If **else** is not supplied it defaults to null',
			params: [
				{label: 'Test', type: 'boolean'},
				{label: 'Then', type: 'exp'},
				{label: 'Else', type: 'exp', default: null},
			],
		}),
	],
	[
		'env-chain',
		setMeta(() => null, {
			doc: 'Env chain',
			params: [],
		}),
	],
] as [string, Expr][]

export default Exports
