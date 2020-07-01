import {vsprintf} from 'sprintf-js'
import isNode from 'is-node'

import {MalVal, MalError, withMeta, symbolFor as S} from './types'
import printExp, {printer} from './printer'
import readStr, {convertJSObjectToMalMap} from './reader'
import interop from './interop'

// String functions
export const slurp = (() => {
	if (isNode) {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const fs = require('fs')
		return (url: string) => {
			return fs.readFileSync(url, 'UTF-8')
		}
	} else {
		return (url: string) => {
			const req = new XMLHttpRequest()
			const hashedUrl =
				url + (/\?/.test(url) ? '&' : '?') + new Date().getTime()
			req.open('GET', hashedUrl, false)
			req.send()
			if (req.status !== 200) {
				throw new MalError(`Failed to slurp file: ${url}`)
			}
			return req.responseText
		}
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

const dummyFn = () => null

const Exports = [
	[
		'throw',
		(msg: string) => {
			throw new MalError(msg)
		}
	],

	// Standard Output
	[
		'prn',
		(...a: MalVal[]) => {
			printer.log(...a.map(e => printExp(e, true)))
			return null
		}
	],
	[
		'println',
		(...a: MalVal[]) => {
			printer.log(...a.map(e => printExp(e, false)))
			return null
		}
	],

	// I/O
	['read-string', readStr],
	['slurp', slurp],

	// Interop
	['js-eval', jsEval],
	['.', jsMethodCall],

	// Needed in import-force
	['format', (fmt: string, ...xs: (number | string)[]) => vsprintf(fmt, xs)],

	['*is-node*', isNode],
	['*host-language*', 'JavaScript'],

	// Special forms annoations
	['&', S('&')],
	[
		'def',
		withMeta(
			dummyFn,
			convertJSObjectToMalMap({
				doc: 'Defines a variable',
				params: [
					{label: 'Symbol', type: 'symbol'},
					{label: 'Value', type: 'any'}
				]
			})
		)
	],
	[
		'defvar',
		withMeta(
			dummyFn,
			convertJSObjectToMalMap({
				doc:
					'Creates a variable which can be changed by the bidirectional evaluation',
				params: [
					{label: 'Symbol', type: 'symbol'},
					{label: 'Value', type: 'any'}
				]
			})
		)
	],
	[
		'let',
		withMeta(
			dummyFn,
			convertJSObjectToMalMap({
				doc: 'Creates a lexical scope',
				params: [
					{label: 'Binds', type: 'code'},
					{label: 'Body', type: 'code'}
				]
			})
		)
	],
	[
		'binding',
		withMeta(
			dummyFn,
			convertJSObjectToMalMap({
				doc: 'Creates a new binding',
				params: [
					{label: 'Binds', type: 'code'},
					{label: 'Body', type: 'code'}
				]
			})
		)
	],
	[
		'get-all-symbols',
		withMeta(
			dummyFn,
			convertJSObjectToMalMap({
				doc: 'Gets all existing symbols',
				params: [],
				return: {type: 'vector'}
			})
		)
	],
	[
		'fn-params',
		withMeta(
			dummyFn,
			convertJSObjectToMalMap({
				doc: 'Gets the list of a function parameter',
				params: [{label: 'Function', type: 'symbol'}]
			})
		)
	],
	[
		'eval-in-env',
		withMeta(
			dummyFn,
			convertJSObjectToMalMap({
				doc:
					'Inside macro, evaluates the expression in a scope that called macro. Otherwise, executes *eval* normally',
				params: [{label: 'Form', type: 'code'}]
			})
		)
	],
	[
		'quote',
		withMeta(
			dummyFn,
			convertJSObjectToMalMap({
				doc: 'Yields the unevaluated *form*',
				params: [{label: 'Form', type: 'code'}]
			})
		)
	],
	[
		'quasiquote',
		withMeta(
			dummyFn,
			convertJSObjectToMalMap({
				doc: 'Quasiquote',
				params: [{label: 'Form', type: 'code'}]
			})
		)
	],
	[
		'fn',
		withMeta(
			dummyFn,
			convertJSObjectToMalMap({
				doc: 'Defines a function',
				params: [
					{label: 'Params', type: 'code'},
					{label: 'Expr', type: 'code'}
				]
			})
		)
	],
	[
		'fn-sugar',
		withMeta(
			dummyFn,
			convertJSObjectToMalMap({
				doc: 'syntactic sugar for (fn [] *form*)',
				params: [{}]
			})
		)
	],
	[
		'macro',
		withMeta(
			dummyFn,
			convertJSObjectToMalMap({
				doc: '',
				params: [
					{label: 'Params', type: 'code'},
					{label: 'Expr', type: 'code'}
				]
			})
		)
	],
	[
		'macroexpand',
		withMeta(
			dummyFn,
			convertJSObjectToMalMap({
				doc: '',
				params: [{}]
			})
		)
	],
	[
		'try',
		withMeta(
			dummyFn,
			convertJSObjectToMalMap({
				doc: '',
				params: [{}]
			})
		)
	],
	[
		'do',
		withMeta(
			dummyFn,
			convertJSObjectToMalMap({
				doc: 'Evaluates *exprs* in order and returns the value of the last',
				params: [S('&'), {label: 'Expr', type: 'code'}]
			})
		)
	],
	[
		'if',
		withMeta(
			dummyFn,
			convertJSObjectToMalMap({
				doc:
					'Evaluates *test*. If truthy, evaluates and yields *then*, otherwise, evaluates and yields *else*. If *else* is not supplied it defaults to nil',
				params: [
					{label: 'Test', type: 'code'},
					{label: 'Then', type: 'code'},
					{label: 'Else', type: 'code', default: null}
				]
			})
		)
	],
	[
		'env-chain',
		withMeta(
			dummyFn,
			convertJSObjectToMalMap({
				doc: '',
				params: [{}]
			})
		)
	]
] as [string, MalVal][]

export default Exports
