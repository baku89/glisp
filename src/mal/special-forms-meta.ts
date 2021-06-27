import {readJS} from './reader'
import {MalFn, MalNil, MalVal} from './types'

export default {
	def: MalFn.from(() => MalNil.from()).withMeta(
		readJS({
			doc: 'Defines a variable',
			params: [
				{label: 'Symbol', type: 'symbol'},
				{label: 'Value', type: 'any'},
			],
		})
	),

	defvar: MalFn.from(() => MalNil.from()).withMeta(
		readJS({
			doc: 'Creates a variable which can be changed by the bidirectional evaluation',
			params: [
				{label: 'Symbol', type: 'symbol'},
				{label: 'Value', type: 'any'},
			],
		})
	),
	let: MalFn.from(() => MalNil.from()).withMeta(
		readJS({
			doc: 'Creates a lexical scope',
			params: [
				{label: 'Binds', type: 'exp'},
				{label: 'Body', type: 'exp'},
			],
		})
	),
	binding: MalFn.from(() => MalNil.from()).withMeta(
		readJS({
			doc: 'Creates a new binding',
			params: [
				{label: 'Binds', type: 'exp'},
				{label: 'Body', type: 'exp'},
			],
		})
	),
	'get-all-symbols': MalFn.from(() => MalNil.from()).withMeta(
		readJS({
			doc: 'Gets all existing symbols',
			params: [],
			return: {type: 'vector'},
		})
	),
	'fn-params': MalFn.from(() => MalNil.from()).withMeta(
		readJS({
			doc: 'Gets the list of a function parameter',
			params: [{label: 'Function', type: 'symbol'}],
		})
	),
	'eval*': MalFn.from(() => MalNil.from()).withMeta(
		readJS({
			doc: 'Inside macro, evaluates the expression in a scope that called macro. Otherwise, executes *eval* normally',
			params: [{label: 'Form', type: 'exp'}],
		})
	),
	quote: MalFn.from(() => MalNil.from()).withMeta(
		readJS({
			doc: 'Yields the unevaluated *form*',
			params: [{label: 'Form', type: 'exp'}],
		})
	),
	quasiquote: MalFn.from(() => MalNil.from()).withMeta(
		readJS({
			doc: 'Quasiquote',
			params: [{label: 'Form', type: 'exp'}],
		})
	),
	fn: MalFn.from(() => MalNil.from()).withMeta(
		readJS({
			doc: 'Defines a function',
			params: [
				{label: 'Params', type: 'exp'},
				{label: 'Form', type: 'exp'},
			],
		})
	),
	'fn-sugar': MalFn.from(() => MalNil.from()).withMeta(
		readJS({
			doc: 'syntactic sugar for (fn [] *form*)',
			params: [],
		})
	),
	macro: MalFn.from(() => MalNil.from()).withMeta(
		readJS({
			doc: '',
			params: [
				{label: 'Param', type: 'exp'},
				{label: 'Form', type: 'exp'},
			],
		})
	),
	macroexpand: MalFn.from(() => MalNil.from()).withMeta(
		readJS({
			doc: 'Expands the macro',
			params: [],
		})
	),
	try: MalFn.from(() => MalNil.from()).withMeta(
		readJS({
			doc: 'Try',
			params: [],
		})
	),
	catch: MalFn.from(() => MalNil.from()).withMeta(
		readJS({
			doc: 'Catch',
			params: [],
		})
	),
	do: MalFn.from(() => MalNil.from()).withMeta(
		readJS({
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
	if: MalFn.from(() => MalNil.from()).withMeta(
		readJS({
			doc: 'If statement. If **else** is not supplied it defaults to nil',
			params: [
				{label: 'Test', type: 'boolean'},
				{label: 'Then', type: 'exp'},
				{label: 'Else', type: 'exp', default: null},
			],
		})
	),
	'env-chain': MalFn.from(() => MalNil.from()).withMeta(
		readJS({
			doc: 'Env chain',
			params: [],
		})
	),
} as Record<string, MalVal>
