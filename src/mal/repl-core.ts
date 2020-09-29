import {vsprintf} from 'sprintf-js'
import isNodeJS from 'is-node'

import {
	MalVal,
	MalError,
	setMeta,
	symbolFor as S,
	createBoolean,
	createNil,
	createString,
} from './types'
import printExp, {printer} from './printer'
import readStr, {convertJSObjectToMalMap} from './reader'
import interop from './interop'

// String functions
export const slurp = (() => {
	if (isNodeJS) {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const fs = require('fs')
		return (url: string) => {
			return fs.readFileSync(url, 'UTF-8')
		}
	} else {
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
			return createNil()
		},
	],
	[
		'print-str',
		(...a: MalVal[]) => {
			return createString(a.map(e => printExp(e, true)).join(' '))
		},
	],
	[
		'println',
		(...a: MalVal[]) => {
			printer.log(...a.map(e => printExp(e, false)))
			return createNil()
		},
	],

	// I/O
	['read-string', readStr],
	['slurp', (x: string) => createString(slurp(x))],

	// Interop
	['js-eval', jsEval],
	// ['.', jsMethodCall],

	// Needed in import-force
	[
		'format',
		(fmt: string, ...xs: (number | string)[]) =>
			createString(vsprintf(fmt, xs)),
	],

	['*is-node*', createBoolean(isNodeJS)],
	['*host-language*', createString('JavaScript')],

	// Special forms annoations
	['&', S('&')],
	[
		'def',
		setMeta(
			() => createNil(),
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
			() => createNil(),
			convertJSObjectToMalMap({
				doc:
					'Creates a variable which can be changed by the bidirectional evaluation',
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
			() => createNil(),
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
			() => createNil(),
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
			() => createNil(),
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
			() => createNil(),
			convertJSObjectToMalMap({
				doc: 'Gets the list of a function parameter',
				params: [{label: 'Function', type: 'symbol'}],
			})
		),
	],
	[
		'eval*',
		setMeta(
			() => createNil(),
			convertJSObjectToMalMap({
				doc:
					'Inside macro, evaluates the expression in a scope that called macro. Otherwise, executes *eval* normally',
				params: [{label: 'Form', type: 'exp'}],
			})
		),
	],
	[
		'quote',
		setMeta(
			() => createNil(),
			convertJSObjectToMalMap({
				doc: 'Yields the unevaluated *form*',
				params: [{label: 'Form', type: 'exp'}],
			})
		),
	],
	[
		'quasiquote',
		setMeta(
			() => createNil(),
			convertJSObjectToMalMap({
				doc: 'Quasiquote',
				params: [{label: 'Form', type: 'exp'}],
			})
		),
	],
	[
		'fn',
		setMeta(
			() => createNil(),
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
			() => createNil(),
			convertJSObjectToMalMap({
				doc: 'syntactic sugar for (fn [] *form*)',
				params: [],
			})
		),
	],
	[
		'macro',
		setMeta(
			() => createNil(),
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
			() => createNil(),
			convertJSObjectToMalMap({
				doc: 'Expands the macro',
				params: [],
			})
		),
	],
	[
		'try',
		setMeta(
			() => createNil(),
			convertJSObjectToMalMap({
				doc: 'Try',
				params: [],
			})
		),
	],
	[
		'catch',
		setMeta(
			() => createNil(),
			convertJSObjectToMalMap({
				doc: 'Catch',
				params: [],
			})
		),
	],
	[
		'do',
		setMeta(
			() => createNil(),
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
			() => createNil(),
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
			() => createNil(),
			convertJSObjectToMalMap({
				doc: 'Env chain',
				params: [],
			})
		),
	],
] as [string, MalVal][]

export default Exports
