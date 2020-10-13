import {jsToMal} from './reader'
import {MalFn, MalNil, MalVal} from './types'

export default {
	def: MalFn.create(() => MalNil.create()).withMeta(
		jsToMal({
			doc: 'Defines a variable',
			params: [
				{label: 'Symbol', type: 'symbol'},
				{label: 'Value', type: 'any'},
			],
		})
	),

	defvar: MalFn.create(() => MalNil.create()).withMeta(
		jsToMal({
			doc:
				'Creates a variable which can be changed by the bidirectional evaluation',
			params: [
				{label: 'Symbol', type: 'symbol'},
				{label: 'Value', type: 'any'},
			],
		})
	),
	let: MalFn.create(() => MalNil.create()).withMeta(
		jsToMal({
			doc: 'Creates a lexical scope',
			params: [
				{label: 'Binds', type: 'exp'},
				{label: 'Body', type: 'exp'},
			],
		})
	),
	binding: MalFn.create(() => MalNil.create()).withMeta(
		jsToMal({
			doc: 'Creates a new binding',
			params: [
				{label: 'Binds', type: 'exp'},
				{label: 'Body', type: 'exp'},
			],
		})
	),
	'get-all-symbols': MalFn.create(() => MalNil.create()).withMeta(
		jsToMal({
			doc: 'Gets all existing symbols',
			params: [],
			return: {type: 'vector'},
		})
	),
	'fn-params': MalFn.create(() => MalNil.create()).withMeta(
		jsToMal({
			doc: 'Gets the list of a function parameter',
			params: [{label: 'Function', type: 'symbol'}],
		})
	),
	'eval*': MalFn.create(() => MalNil.create()).withMeta(
		jsToMal({
			doc:
				'Inside macro, evaluates the expression in a scope that called macro. Otherwise, executes *eval* normally',
			params: [{label: 'Form', type: 'exp'}],
		})
	),
	quote: MalFn.create(() => MalNil.create()).withMeta(
		jsToMal({
			doc: 'Yields the unevaluated *form*',
			params: [{label: 'Form', type: 'exp'}],
		})
	),
	quasiquote: MalFn.create(() => MalNil.create()).withMeta(
		jsToMal({
			doc: 'Quasiquote',
			params: [{label: 'Form', type: 'exp'}],
		})
	),
	fn: MalFn.create(() => MalNil.create()).withMeta(
		jsToMal({
			doc: 'Defines a function',
			params: [
				{label: 'Params', type: 'exp'},
				{label: 'Form', type: 'exp'},
			],
		})
	),
	'fn-sugar': MalFn.create(() => MalNil.create()).withMeta(
		jsToMal({
			doc: 'syntactic sugar for (fn [] *form*)',
			params: [],
		})
	),
	macro: MalFn.create(() => MalNil.create()).withMeta(
		jsToMal({
			doc: '',
			params: [
				{label: 'Param', type: 'exp'},
				{label: 'Form', type: 'exp'},
			],
		})
	),
	macroexpand: MalFn.create(() => MalNil.create()).withMeta(
		jsToMal({
			doc: 'Expands the macro',
			params: [],
		})
	),
	try: MalFn.create(() => MalNil.create()).withMeta(
		jsToMal({
			doc: 'Try',
			params: [],
		})
	),
	catch: MalFn.create(() => MalNil.create()).withMeta(
		jsToMal({
			doc: 'Catch',
			params: [],
		})
	),
	do: MalFn.create(() => MalNil.create()).withMeta(
		jsToMal({
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
	if: MalFn.create(() => MalNil.create()).withMeta(
		jsToMal({
			doc: 'If statement. If **else** is not supplied it defaults to nil',
			params: [
				{label: 'Test', type: 'boolean'},
				{label: 'Then', type: 'exp'},
				{label: 'Else', type: 'exp', default: null},
			],
		})
	),
	'env-chain': MalFn.create(() => MalNil.create()).withMeta(
		jsToMal({
			doc: 'Env chain',
			params: [],
		})
	),
} as {[key: string]: MalVal}
