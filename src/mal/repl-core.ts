import {vsprintf} from 'sprintf-js'

import interop from './interop'
import printExp, {printer} from './printer'
import readStr, {convertJSObjectToMalMap} from './reader'
import {MalError, MalVal, setMeta, symbolFor as S} from './types'

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
			throw new MalError(`Failed to slurp file: ${url}`)
		}
		return req.responseText
	}
})()

// Interop
function jsEval(str: string): MalVal {
	return interop.jsToMal(eval(str.toString()))
}

function jsMethodCall(objMethodStr: string, ...args: MalVal[]): MalVal {
	const [obj, f] = interop.resolveJS(objMethodStr)
	const res = f.apply(obj, args)
	return interop.jsToMal(res)
}

const Exports = [
	[
		'throw',
		(msg: string) => {
			throw new MalError(msg)
		},
	],

	// Standard Output
	[
		'prn',
		(...a: MalVal[]) => {
			printer.log(...a.map(e => printExp(e, true)))
			return null
		},
	],
	[
		'print-str',
		(...a: MalVal[]) => {
			return a.map(e => printExp(e, true)).join(' ')
		},
	],
	[
		'println',
		(...a: MalVal[]) => {
			printer.log(...a.map(e => printExp(e, false)))
			return null
		},
	],

	// I/O
	['read-string', readStr],
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
			convertJSObjectToMalMap({
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
			convertJSObjectToMalMap({
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
			convertJSObjectToMalMap({
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
			convertJSObjectToMalMap({
				doc: 'Creates a new binding',
				params: [
					{label: 'Binds', type: 'exp'},
					{label: 'Body', type: 'exp'},
				],
			})
		),
	],
	[
		'get-all-symbols',
		setMeta(
			() => null,
			convertJSObjectToMalMap({
				doc: 'Gets all existing symbols',
				params: [],
				return: {type: 'vector'},
			})
		),
	],
	[
		'fn-params',
		setMeta(
			() => null,
			convertJSObjectToMalMap({
				doc: 'Gets the list of a function parameter',
				params: [{label: 'Function', type: 'symbol'}],
			})
		),
	],
	[
		'eval*',
		setMeta(
			() => null,
			convertJSObjectToMalMap({
				doc: 'Inside macro, evaluates the expression in a scope that called macro. Otherwise, executes *eval* normally',
				params: [{label: 'Form', type: 'exp'}],
			})
		),
	],
	[
		'quote',
		setMeta(
			() => null,
			convertJSObjectToMalMap({
				doc: 'Yields the unevaluated *form*',
				params: [{label: 'Form', type: 'exp'}],
			})
		),
	],
	[
		'quasiquote',
		setMeta(
			() => null,
			convertJSObjectToMalMap({
				doc: 'Quasiquote',
				params: [{label: 'Form', type: 'exp'}],
			})
		),
	],
	[
		'fn',
		setMeta(
			() => null,
			convertJSObjectToMalMap({
				doc: 'Defines a function',
				params: [
					{label: 'Params', type: 'exp'},
					{label: 'Form', type: 'exp'},
				],
			})
		),
	],
	[
		'fn-sugar',
		setMeta(
			() => null,
			convertJSObjectToMalMap({
				doc: 'syntactic sugar for (fn [] *form*)',
				params: [],
			})
		),
	],
	[
		'macro',
		setMeta(
			() => null,
			convertJSObjectToMalMap({
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
			convertJSObjectToMalMap({
				doc: 'Expands the macro',
				params: [],
			})
		),
	],
	[
		'try',
		setMeta(
			() => null,
			convertJSObjectToMalMap({
				doc: 'Try',
				params: [],
			})
		),
	],
	[
		'catch',
		setMeta(
			() => null,
			convertJSObjectToMalMap({
				doc: 'Catch',
				params: [],
			})
		),
	],
	[
		'do',
		setMeta(
			() => null,
			convertJSObjectToMalMap({
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
			convertJSObjectToMalMap({
				doc: 'If statement. If **else** is not supplied it defaults to nil',
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
			convertJSObjectToMalMap({
				doc: 'Env chain',
				params: [],
			})
		),
	],
] as [string, MalVal][]

export default Exports
