import {vsprintf} from 'sprintf-js'

import interop from './interop'
import {parse} from './parse'
import {printer, printExpr} from './print'
import {Expr, GlispError, symbolFor as S} from './types'
import {convertJSObjectToExprMap, setMeta} from './utils'

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
	return interop.jsToExpr(eval(str.toString()))
}

function jsMethodCall(objMethodStr: string, ...args: Expr[]): Expr {
	const [obj, f] = interop.resolveJS(objMethodStr)
	const res = f.apply(obj, args)
	return interop.jsToExpr(res)
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
		setMeta(
			() => null,
			convertJSObjectToExprMap({
				doc: 'Defines a variable',
				params: [
					{label: 'Symbol', type: 'symbol'},
					{label: 'Value', type: 'any'},
				],
			})
		),
	],
	[
		'defvar',
		setMeta(
			() => null,
			convertJSObjectToExprMap({
				doc: 'Creates a variable which can be changed by the bidirectional evaluation',
				params: [
					{label: 'Symbol', type: 'symbol'},
					{label: 'Value', type: 'any'},
				],
			})
		),
	],
	[
		'let',
		setMeta(
			() => null,
			convertJSObjectToExprMap({
				doc: 'Creates a lexical scope',
				params: [
					{label: 'Binds', type: 'exp'},
					{label: 'Body', type: 'exp'},
				],
			})
		),
	],
	[
		'binding',
		setMeta(
			() => null,
			convertJSObjectToExprMap({
				doc: 'Creates a new binding',
				params: [
					{label: 'Binds', type: 'exp'},
					{label: 'Body', type: 'exp'},
				],
			})
		),
	],
	[
		'eval*',
		setMeta(
			() => null,
			convertJSObjectToExprMap({
				doc: 'Inside macro, evaluates the expression in a scope that called macro. Otherwise, executes *eval* normally',
				params: [{label: 'Form', type: 'exp'}],
			})
		),
	],
	[
		'quote',
		setMeta(
			() => null,
			convertJSObjectToExprMap({
				doc: 'Quote',
				params: [{label: 'Form', type: 'exp'}],
			})
		),
	],
	[
		'=>',
		setMeta(
			() => null,
			convertJSObjectToExprMap({
				doc: 'Defines a function',
				params: [
					{label: 'Params', type: 'exp'},
					{label: 'Form', type: 'exp'},
				],
			})
		),
	],
	[
		'curry',
		setMeta(
			() => null,
			convertJSObjectToExprMap({
				doc: 'syntactic sugar for (=> [] *form*)',
				params: [],
			})
		),
	],
	[
		'macro',
		setMeta(
			() => null,
			convertJSObjectToExprMap({
				doc: '',
				params: [
					{label: 'Param', type: 'exp'},
					{label: 'Form', type: 'exp'},
				],
			})
		),
	],
	[
		'macroexpand',
		setMeta(
			() => null,
			convertJSObjectToExprMap({
				doc: 'Expands the macro',
				params: [],
			})
		),
	],
	[
		'try',
		setMeta(
			() => null,
			convertJSObjectToExprMap({
				doc: 'Try',
				params: [],
			})
		),
	],
	[
		'catch',
		setMeta(
			() => null,
			convertJSObjectToExprMap({
				doc: 'Catch',
				params: [],
			})
		),
	],
	[
		'do',
		setMeta(
			() => null,
			convertJSObjectToExprMap({
				doc: 'Evaluates *forms* in order and returns the value of the last',
				params: [
					{
						type: 'vector',
						variadic: true,
						items: {label: 'Form', type: 'any'},
					},
				],
			})
		),
	],
	[
		'if',
		setMeta(
			() => null,
			convertJSObjectToExprMap({
				doc: 'If statement. If **else** is not supplied it defaults to null',
				params: [
					{label: 'Test', type: 'boolean'},
					{label: 'Then', type: 'exp'},
					{label: 'Else', type: 'exp', default: null},
				],
			})
		),
	],
	[
		'env-chain',
		setMeta(
			() => null,
			convertJSObjectToExprMap({
				doc: 'Env chain',
				params: [],
			})
		),
	],
] as [string, Expr][]

export default Exports
