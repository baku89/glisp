import {vsprintf} from 'sprintf-js'
import isNodeJS from 'is-node'

import {
	MalVal,
	MalError,
	MalBoolean,
	MalString,
	MalNil,
	MalNumber,
	MalFunc,
	MalMap,
} from './types'
import printExp, {printer} from './printer'
import readStr from './reader'
import {jsToMal} from './utils'

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

const Exports = [
	[
		'throw',
		(msg: MalString) => {
			throw new MalError(msg.value)
		},
	],

	// Standard Output
	[
		'prn',
		(...a: MalVal[]) => {
			printer.log(...a.map(e => printExp(e, true)))
			return MalNil.create()
		},
	],
	[
		'print-str',
		(...a: MalVal[]) => {
			return MalString.create(a.map(e => printExp(e, true)).join(' '))
		},
	],
	[
		'println',
		(...a: MalVal[]) => {
			printer.log(...a.map(e => printExp(e, false)))
			return MalNil.create()
		},
	],

	// I/O
	['read-string', readStr],
	['slurp', (x: MalString) => MalString.create(slurp(x.value))],

	// Interop
	['js-eval', (x: MalString) => jsToMal(eval(x.value.toString()))],
	// ['.', jsMethodCall],

	// Needed in import-force
	[
		'format',
		(fmt: MalString, ...xs: (MalNumber | MalString)[]) =>
			MalString.create(
				vsprintf(
					fmt.value,
					xs.map(x => x.toJS())
				)
			),
	],

	['*is-node*', MalBoolean.create(isNodeJS)],
	['*host-language*', MalString.create('JavaScript')],

	[
		'def',
		MalFunc.create(
			() => MalNil.create(),
			jsToMal({
				doc: 'Defines a variable',
				params: [
					{label: 'Symbol', type: 'symbol'},
					{label: 'Value', type: 'any'},
				],
			}) as MalMap
		),
	],
	[
		'defvar',
		MalFunc.create(
			() => MalNil.create(),
			jsToMal({
				doc:
					'Creates a variable which can be changed by the bidirectional evaluation',
				params: [
					{label: 'Symbol', type: 'symbol'},
					{label: 'Value', type: 'any'},
				],
			}) as MalMap
		),
	],
	[
		'let',
		MalFunc.create(
			() => MalNil.create(),
			jsToMal({
				doc: 'Creates a lexical scope',
				params: [
					{label: 'Binds', type: 'exp'},
					{label: 'Body', type: 'exp'},
				],
			}) as MalMap
		),
	],
	[
		'binding',
		MalFunc.create(
			() => MalNil.create(),
			jsToMal({
				doc: 'Creates a new binding',
				params: [
					{label: 'Binds', type: 'exp'},
					{label: 'Body', type: 'exp'},
				],
			}) as MalMap
		),
	],
	[
		'get-all-symbols',
		MalFunc.create(
			() => MalNil.create(),
			jsToMal({
				doc: 'Gets all existing symbols',
				params: [],
				return: {type: 'vector'},
			}) as MalMap
		),
	],
	[
		'fn-params',
		MalFunc.create(
			() => MalNil.create(),
			jsToMal({
				doc: 'Gets the list of a function parameter',
				params: [{label: 'Function', type: 'symbol'}],
			}) as MalMap
		),
	],
	[
		'eval*',
		MalFunc.create(
			() => MalNil.create(),
			jsToMal({
				doc:
					'Inside macro, evaluates the expression in a scope that called macro. Otherwise, executes *eval* normally',
				params: [{label: 'Form', type: 'exp'}],
			}) as MalMap
		),
	],
	[
		'quote',
		MalFunc.create(
			() => MalNil.create(),
			jsToMal({
				doc: 'Yields the unevaluated *form*',
				params: [{label: 'Form', type: 'exp'}],
			}) as MalMap
		),
	],
	[
		'quasiquote',
		MalFunc.create(
			() => MalNil.create(),
			jsToMal({
				doc: 'Quasiquote',
				params: [{label: 'Form', type: 'exp'}],
			}) as MalMap
		),
	],
	[
		'fn',
		MalFunc.create(
			() => MalNil.create(),
			jsToMal({
				doc: 'Defines a function',
				params: [
					{label: 'Params', type: 'exp'},
					{label: 'Form', type: 'exp'},
				],
			}) as MalMap
		),
	],
	[
		'fn-sugar',
		MalFunc.create(
			() => MalNil.create(),
			jsToMal({
				doc: 'syntactic sugar for (fn [] *form*)',
				params: [],
			}) as MalMap
		),
	],
	[
		'macro',
		MalFunc.create(
			() => MalNil.create(),
			jsToMal({
				doc: '',
				params: [
					{label: 'Param', type: 'exp'},
					{label: 'Form', type: 'exp'},
				],
			}) as MalMap
		),
	],
	[
		'macroexpand',
		MalFunc.create(
			() => MalNil.create(),
			jsToMal({
				doc: 'Expands the macro',
				params: [],
			}) as MalMap
		),
	],
	[
		'try',
		MalFunc.create(
			() => MalNil.create(),
			jsToMal({
				doc: 'Try',
				params: [],
			}) as MalMap
		),
	],
	[
		'catch',
		MalFunc.create(
			() => MalNil.create(),
			jsToMal({
				doc: 'Catch',
				params: [],
			}) as MalMap
		),
	],
	[
		'do',
		MalFunc.create(
			() => MalNil.create(),
			jsToMal({
				doc: 'Evaluates *forms* in order and returns the value of the last',
				params: [
					{
						type: 'vector',
						variadic: true,
						items: {label: 'Form', type: 'any'},
					},
				],
			}) as MalMap
		),
	],
	[
		'if',
		MalFunc.create(
			() => MalNil.create(),
			jsToMal({
				doc: 'If statement. If **else** is not supplied it defaults to nil',
				params: [
					{label: 'Test', type: 'boolean'},
					{label: 'Then', type: 'exp'},
					{label: 'Else', type: 'exp', default: null},
				],
			}) as MalMap
		),
	],
	[
		'env-chain',
		MalFunc.create(
			() => MalNil.create(),
			jsToMal({
				doc: 'Env chain',
				params: [],
			}) as MalMap
		),
	],
] as [string, MalVal][]

export default Exports
