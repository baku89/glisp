import {entries, forOwn, fromPairs, keys, mapValues, values} from 'lodash'

import {GlispError} from '../GlispError'
import {Log, WithLog, withLog} from '../log'
import {isEqualArray} from '../util/isEqualArray'
import {isEqualDict} from '../util/isEqualDict'
import {isEqualSet} from '../util/isEqualSet'
import {nullishEqual} from '../util/nullishEqual'
import {Writer} from '../util/Writer'
import {zip} from '../util/zip'
import * as Val from '../val'
import {Env} from './env'
import {shadowTypeVars, Unifier} from './unify'

export type Node = LeafNode | InnerNode
export type LeafNode =
	| Identifier
	| ValueContainer
	| AllKeyword
	| NeverKeyword
	| NumLiteral
	| StrLiteral

export type InnerNode =
	| Call
	| Scope
	| TryCatch
	| FnDef
	| FnTypeDef
	| VecLiteral
	| DictLiteral

export type Arg<T extends Val.Value = Val.Value> = () => T

interface ValueMeta {
	defaultValue?: Node
}

export interface PrintOptions {
	omitMeta?: boolean
}

export abstract class BaseNode {
	abstract readonly type: string

	parent: Node | null = null

	protected constructor() {
		return this
	}

	abstract printExceptMeta(options: PrintOptions): string

	print = (options: PrintOptions = {}): string => {
		let node = this.printExceptMeta(options)

		if (options.omitMeta && this.valueMeta?.defaultValue) {
			node += '^{' + this.valueMeta.defaultValue.print(options) + '}'
		}

		return node
	}

	protected abstract forceEval(env: Env): WithLog

	protected abstract forceInfer(env: Env): WithLog

	abstract isSameTo(node: Node): boolean

	abstract clone(): Node

	valueMeta?: ValueMeta

	#forceEvalWithMeta = (env: Env): WithLog => {
		const valueWithLog = this.forceEval(env)

		if (this.valueMeta?.defaultValue) {
			const [value, lv] = valueWithLog.asTuple
			const [defaultValue, ldv] = this.valueMeta.defaultValue.eval(env).asTuple

			if (!value.isInstance(defaultValue)) {
				return valueWithLog.write({
					level: 'warn',
					ref: this as any,
					reason:
						`Cannot use ${defaultValue.print()} ` +
						`as a default value of ${value.print()}`,
				})
			}

			return withLog(value.withDefault(defaultValue), ...lv, ...ldv)
		}

		return valueWithLog
	}

	eval(env = Env.global) {
		return env.memoizeEval(this, this.#forceEvalWithMeta)
	}

	infer(env = Env.global) {
		return env.memoizeInfer(this, this.forceInfer)
	}

	getLog = () => this.eval(Env.global).log
}

export class Identifier extends BaseNode {
	readonly type = 'Identifier' as const

	private constructor(public name: string) {
		super()
	}

	#resolve(
		ref: Node | null,
		env: Env
	): Writer<{node: Node; mode?: 'param' | 'arg' | 'TypeVar'}, Log> {
		if (!ref) {
			// If no parent and still couldn't resolve the symbol,
			// assume there's no bound expression for it.
			const log: Log = {
				level: 'error',
				ref: this,
				reason: 'Variable not bound: ' + this.name,
			}

			return Writer.of({node: Call.of()}, log)
		}

		if (ref.type === 'Scope') {
			if (this.name in ref.vars) {
				return Writer.of({node: ref.vars[this.name]})
			}
		}
		if (ref.type === 'FnDef') {
			if (env.isGlobal) {
				// Situation A. While normal evaluation
				if (this.name in ref.param) {
					return Writer.of({node: ref.param[this.name], mode: 'param'})
				} else if (ref.rest && this.name === ref.rest.name) {
					// Rest parameter
					const [rest, lr] = ref.rest.node.eval(env).asTuple
					const node = ValueContainer.of(Val.vec([], undefined, rest))
					return Writer.of({node, mode: 'param'}, ...lr)
				}
			} else {
				// Situation B. In a context of function appliction
				const arg = env.get(this.name)
				if (arg) {
					return Writer.of({node: ValueContainer.of(arg()), mode: 'arg'})
				}
				// If no corresponding arg has found for the fn, pop the env.
				env = env.pop()
			}
		}
		// Resolve typeVars
		if (ref.type === 'FnDef' || ref.type === 'FnTypeDef') {
			if (this.name in ref.typeVars) {
				return Writer.of({
					node: ValueContainer.of(ref.typeVars[this.name]),
					mode: 'TypeVar',
				})
			}
		}

		// Resolve with parent node recursively
		return this.#resolve(ref.parent, env)
	}

	protected forceEval = (env: Env): WithLog => {
		return this.#resolve(this.parent, env).bind(({node, mode}) => {
			const result = node.eval(env)

			return mode === 'param' ? result.fmap(v => v.defaultValue) : result
		})
	}

	protected forceInfer = (env: Env): WithLog => {
		const {node, mode} = this.#resolve(this.parent, env).result

		if (mode) {
			// In cases such as inferring `x` in `(=> [x:(+ 1 2)] x)`,
			// The type of parameter `(+ 1 2)` needs to be *evaluated*
			return node.eval(env)
		} else {
			// othersise, infer it as usual
			return node.infer(env)
		}
	}

	printExceptMeta = () => this.name

	isSameTo = (node: Node) => this.type === node.type && this.name === node.name

	clone = () => Identifier.of(this.name)

	static of(name: string) {
		return new Identifier(name)
	}
}

export class ValueContainer<V extends Val.Value = Val.Value> extends BaseNode {
	readonly type = 'ValueContainer' as const

	private constructor(public readonly value: V) {
		super()
	}

	protected forceEval = () => withLog(this.value)

	protected forceInfer = () => withLog(this.value.isType ? Val.all : this.value)

	printExceptMeta = (options: PrintOptions) => {
		const ast = this.value.toAst()
		if (ast.type !== this.type) return ast.print(options)
		return `<value container of ${this.value.type}>`
	}

	isSameTo = (node: Node) =>
		this.type === node.type && this.value === node.value

	clone = () => ValueContainer.of(this.value)

	static of<V extends Val.Value = Val.Value>(value: V) {
		return new ValueContainer(value)
	}
}

export class AllKeyword extends BaseNode {
	readonly type = 'AllKeyword' as const

	protected forceEval = () => withLog(Val.all)
	protected forceInfer = () => withLog(Val.all)
	printExceptMeta = () => '_'
	isSameTo = (node: Node) => this.type === node.type
	clone = () => AllKeyword.of()

	static of() {
		return new AllKeyword()
	}
}

export class NeverKeyword extends BaseNode {
	readonly type = 'NeverKeyword' as const

	protected forceEval = () => withLog(Val.never)
	protected forceInfer = () => withLog(Val.all)
	printExceptMeta = () => 'Never'
	isSameTo = (node: Node) => this.type === node.type
	clone = () => NeverKeyword.of()

	static of() {
		return new NeverKeyword()
	}
}

export class NumLiteral extends BaseNode {
	readonly type = 'NumLiteral' as const

	private constructor(public readonly value: number) {
		super()
	}

	protected forceEval = () => withLog(Val.num(this.value))
	protected forceInfer = () => withLog(Val.num(this.value))
	printExceptMeta = () => this.value.toString()
	isSameTo = (node: Node) =>
		this.type === node.type && this.value === node.value
	clone = () => NumLiteral.of(this.value)

	static of(value: number) {
		return new NumLiteral(value)
	}
}

export class StrLiteral extends BaseNode {
	readonly type = 'StrLiteral' as const

	private constructor(public readonly value: string) {
		super()
	}

	protected forceEval = () => withLog(Val.str(this.value))

	protected forceInfer = () => withLog(Val.str(this.value))

	printExceptMeta = () => '"' + this.value + '"'

	isSameTo = (node: Node) =>
		this.type === node.type && this.value === node.value

	clone = () => StrLiteral.of(this.value)

	static of(value: string) {
		return new StrLiteral(value)
	}
}

export class FnDef extends BaseNode {
	readonly type = 'FnDef' as const

	readonly typeVars: Record<string, Val.TypeVar>

	private constructor(
		typeVars: string[],
		public param: Record<string, Node>,
		public readonly optionalPos: number,
		public readonly rest: {name: string; node: Node} | undefined,
		public body: Node
	) {
		super()

		if (
			optionalPos < 0 ||
			values(param).length < optionalPos ||
			optionalPos % 1 !== 0
		) {
			throw new Error('Invalid optionalPos: ' + optionalPos)
		}

		this.typeVars = fromPairs(typeVars.map(name => [name, Val.typeVar(name)]))
	}

	protected forceEval = (env: Env): WithLog => {
		const names = keys(this.param)

		const fn: Val.IFn = (...args: Arg[]) => {
			const arg = fromPairs(zip(names, args))
			if (this.rest) {
				const restArgs = args.slice(names.length)
				arg[this.rest.name] = () => Val.vec(restArgs.map(a => a()))
			}
			const innerEnv = env.extend(arg)
			return this.body.eval(innerEnv)
		}

		const [ty, lty] = this.forceInfer(env).asTuple

		const fnVal = Val.fnFrom(ty, fn, this.body)

		return withLog(fnVal, ...lty)
	}

	protected forceInfer = (env: Env): WithLog<Val.FnType> => {
		// Infer parameter types by simply evaluating 'em
		const [param, lp] = Writer.mapValues(this.param, p => p.eval(env)).asTuple

		let rest: Val.FnType['rest'], lr: Set<Log>
		if (this.rest) {
			const [value, _lr] = this.rest.node.eval(env).asTuple
			rest = {name: this.rest.name, value}
			lr = _lr
		} else {
			lr = new Set()
		}

		// Then, infer the function body
		const arg = mapValues(param, p => () => p)
		if (rest) {
			const {name: restName, value: restValue} = rest
			arg[restName as any] = () => Val.vec([], undefined, restValue)
		}

		const innerEnv = env.extend(arg)

		const [out, lo] = this.body.infer(innerEnv).asTuple

		const fnType = Val.fnType({
			param,
			optionalPos: this.optionalPos,
			rest,
			out,
		})

		return withLog(fnType, ...lp, ...lr, ...lo)
	}

	printExceptMeta = (options: PrintOptions): string => {
		const typeVars = printTypeVars(this.typeVars)
		const param = printParam(this.param, this.optionalPos, this.rest, options)
		const body = this.body.print(options)

		return `(=> ${typeVars}${param} ${body})`
	}

	isSameTo = (node: Node) =>
		this.type === node.type &&
		isEqualArray(keys(this.typeVars), keys(node.typeVars)) &&
		isEqualDict(this.param, node.param, isSame) &&
		this.optionalPos === node.optionalPos &&
		isEqualRest(this.rest, node.rest) &&
		isSame(this.body, node.body)

	clone = (): FnDef =>
		FnDef.of({
			typeVars: values(this.typeVars).map(tv => tv.name),
			param: mapValues(this.param, clone),
			optionalPos: this.optionalPos,
			rest: this.rest
				? {...this.rest, node: this.rest.node.clone()}
				: undefined,
			body: this.body.clone(),
		})

	static of({
		typeVars = [],
		param = {},
		optionalPos,
		rest,
		body,
	}: {
		typeVars?: string[]
		param?: FnDef['param']
		optionalPos?: number
		rest?: FnDef['rest']
		body: Node
	}) {
		const _optionalPos = optionalPos ?? values(param).length

		const fn = new FnDef(typeVars ?? [], param, _optionalPos, rest, body)

		values(param).forEach(p => setParent(p, fn))
		if (rest) setParent(rest.node, fn)
		setParent(body, fn)

		return fn
	}
}

export class FnTypeDef extends BaseNode {
	readonly type = 'FnTypeDef' as const

	typeVars: Record<string, Val.TypeVar>

	private constructor(
		typeVars: string[],
		public param: Record<string, Node>,
		public readonly optionalPos: number,
		public readonly rest: {name?: string; node: Node} | undefined,
		public out: Node
	) {
		super()

		this.typeVars = fromPairs(typeVars.map(name => [name, Val.typeVar(name)]))
	}

	protected forceEval = (env: Env): WithLog => {
		const [param, lp] = Writer.mapValues(this.param, p => p.eval(env)).asTuple

		let rest: Val.FnType['rest'], lr: Set<Log>
		if (this.rest) {
			const [value, _lr] = this.rest.node.eval(env).asTuple
			rest = {name: this.rest.name, value}
			lr = _lr
		} else {
			lr = new Set()
		}

		const [out, lo] = this.out.eval(env).asTuple

		const fnType = Val.fnType({
			param,
			optionalPos: this.optionalPos,
			rest,
			out,
		})

		return withLog(fnType, ...lp, ...lr, ...lo)
	}

	protected forceInfer = () => withLog(Val.all)

	printExceptMeta = (options: PrintOptions): string => {
		const typeVars = printTypeVars(this.typeVars)
		const param = printParam(this.param, this.optionalPos, this.rest, options)
		const out = this.out.print(options)
		return `(-> ${typeVars}${param} ${out})`
	}

	isSameTo = (node: Node): boolean =>
		this.type === node.type &&
		isEqualArray(keys(this.typeVars), keys(node.typeVars)) &&
		isEqualDict(this.param, node.param, isSame) &&
		this.optionalPos === node.optionalPos &&
		isEqualRest(this.rest, node.rest) &&
		isSame(this.out, node.out)

	clone = (): FnTypeDef =>
		FnTypeDef.of({
			typeVars: values(this.typeVars).map(tv => tv.name),
			param: mapValues(this.param, clone),
			optionalPos: this.optionalPos,
			rest: this.rest,
			out: this.out.clone(),
		})

	static of({
		typeVars = [],
		param = {},
		optionalPos,
		rest,
		out,
	}: {
		typeVars?: string[]
		param?: FnTypeDef['param'] | Node[]
		optionalPos?: number
		rest?: FnTypeDef['rest']
		out: Node
	}) {
		const _optionalPos = optionalPos ?? values(param).length
		const _param = Array.isArray(param)
			? fromPairs(param.map((p, i) => [i, p]))
			: param

		const fnType = new FnTypeDef(typeVars, _param, _optionalPos, rest, out)

		forOwn(_param, p => setParent(p, fnType))
		if (rest) setParent(rest.node, fnType)
		setParent(out, fnType)

		return fnType
	}
}

function isEqualRest(a: FnTypeDef['rest'], b: FnTypeDef['rest']) {
	return nullishEqual(
		a,
		b,
		(a, b) => a.name === b.name && isSame(a.node, b.node)
	)
}

function printTypeVars(typeVars: Record<string, Val.TypeVar>): string {
	const es = keys(typeVars)
	if (es.length === 0) return ''
	return '<' + es.join(' ') + '> '
}

function printParam(
	param: Record<string, Node>,
	optionalPos: number,
	rest: {name?: string; node: Node} | undefined,
	options: PrintOptions
) {
	const params = entries(param)

	const canOmitBracket =
		params.length === 1 &&
		!(params[0][1].type === 'VecLiteral' && params[0][1].items.length === 0) &&
		!rest

	const paramStr = params.map(printNamedNode)

	const restStr = rest
		? ['...' + (rest.name ? rest.name + ':' : '') + rest.node.print(options)]
		: []

	const content = [...paramStr, ...restStr].join(' ')

	return canOmitBracket ? content : '[' + content + ']'

	function printNamedNode([name, ty]: [string, Node], index: number) {
		const optionalMark = optionalPos <= index ? '?' : ''

		if (/^[0-9]+$/.test(name)) {
			// No label
			return ty.print(options) + optionalMark
		} else {
			return name + optionalMark + ':' + ty.print(options)
		}
	}
}

export class VecLiteral extends BaseNode {
	readonly type = 'VecLiteral' as const

	private constructor(
		public items: Node[],
		public optionalPos: number,
		public rest?: Node
	) {
		super()
		if (optionalPos < 0 || items.length < optionalPos || optionalPos % 1 !== 0)
			throw new Error('Invalid optionalPos: ' + optionalPos)
	}

	protected forceEval = (env: Env): WithLog => {
		const [items, li] = Writer.map(this.items, i => i.eval(env)).asTuple
		const [rest, lr] = this.rest?.eval(env).asTuple ?? [undefined, []]
		return withLog(Val.vec(items, this.optionalPos, rest), ...li, ...lr)
	}

	protected forceInfer = (env: Env): WithLog => {
		if (this.rest || this.items.length < this.optionalPos) {
			return withLog(Val.all)
		}
		const [items, log] = Writer.map(this.items, it => it.infer(env)).asTuple
		return withLog(Val.vec(items), ...log)
	}

	printExceptMeta = (options: PrintOptions): string => {
		const op = this.optionalPos
		const items = this.items.map(
			(it, i) => it.print(options) + (op <= i ? '?' : '')
		)
		const rest = this.rest ? ['...' + this.rest.print(options)] : []
		return '[' + [...items, ...rest].join(' ') + ']'
	}

	isSameTo = (node: Node): boolean =>
		this.type === node.type &&
		isEqualArray(this.items, node.items, isSame) &&
		this.optionalPos === node.optionalPos &&
		nullishEqual(this.rest, this.rest, isSame)

	clone = (): VecLiteral =>
		VecLiteral.of(this.items.map(clone), this.optionalPos, this.rest?.clone())

	static of(items: Node[] = [], optionalPos?: number, rest?: Node) {
		const vec = new VecLiteral(items, optionalPos ?? items.length, rest)
		items.forEach(it => setParent(it, vec))
		if (rest) setParent(rest, vec)
		return vec
	}
}

export class DictLiteral extends BaseNode {
	readonly type = 'DictLiteral' as const

	private constructor(
		public items: Record<string, Node>,
		public optionalKeys: Set<string>,
		public rest?: Node
	) {
		super()
	}

	#isOptional(key: string) {
		return this.optionalKeys.has(key)
	}

	protected forceEval = (env: Env): WithLog => {
		const [items, li] = Writer.mapValues(this.items, it => it.eval(env)).asTuple
		const [rest, lr] = this.rest ? this.rest.eval(env).asTuple : [undefined, []]
		return withLog(Val.dict(items, this.optionalKeys, rest), ...li, ...lr)
	}

	protected forceInfer = (env: Env): WithLog => {
		if (this.optionalKeys.size > 0 || this.rest) return withLog(Val.all)

		const [items, logs] = Writer.mapValues(this.items, it =>
			it.infer(env)
		).asTuple
		return withLog(Val.dict(items), ...logs)
	}

	printExceptMeta = (options: PrintOptions): string => {
		const items = entries(this.items).map(
			([k, v]) => k + (this.#isOptional(k) ? '?' : '') + ': ' + v.print(options)
		)
		const rest = this.rest ? ['...' + this.rest.print(options)] : []
		return '{' + [...items, ...rest].join(' ') + '}'
	}

	isSameTo = (node: Node): boolean =>
		this.type === node.type &&
		isEqualDict(this.items, node.items, isSame) &&
		isEqualSet(this.optionalKeys, node.optionalKeys) &&
		nullishEqual(this.rest, node.rest, isSame)

	clone = (): DictLiteral =>
		DictLiteral.of(
			mapValues(this.items, clone),
			this.optionalKeys,
			this.rest?.clone()
		)

	static of(
		items: Record<string, Node>,
		optionalKeys: Iterable<string> = [],
		rest?: Node
	) {
		const dict = new DictLiteral(items, new Set(optionalKeys), rest)
		values(items).forEach(it => setParent(it, dict))
		if (rest) setParent(rest, dict)
		return dict
	}
}

export class Call extends BaseNode {
	readonly type = 'Call' as const

	private constructor(public callee?: Node, public args: Node[] = []) {
		super()
	}

	#unify(env: Env): [Unifier, Val.Value[]] {
		if (!this.callee) throw new Error('Cannot unify unit literal')

		const calleeType = this.callee.infer(env).result

		if (!('fnType' in calleeType)) return [new Unifier(), []]

		const fnType = calleeType.fnType

		const params = values(fnType.param)

		const shadowedArgs = this.args
			.slice(0, fnType.rest ? this.args.length : params.length)
			.map(a => shadowTypeVars(a.infer(env).result))

		const paramsType = Val.vec(params, fnType.optionalPos, fnType.rest?.value)
		const argsType = Val.vec(shadowedArgs)

		const unifier = new Unifier([paramsType, '>=', argsType])

		return [unifier, shadowedArgs]
	}

	protected forceEval = (env: Env): WithLog => {
		if (!this.callee) return withLog(Val.unit)

		// Evaluate the function itself at first
		const [callee, calleeLog] = this.callee.eval(env).asTuple

		// Check if it's not a function
		if (!('fn' in callee)) {
			return Writer.of(callee, ...calleeLog, {
				level: 'warn',
				ref: this,
				reason: 'Not a function',
			})
		}

		// Start function application
		const argLog: Log[] = []
		const names = keys(callee.fnType.param)
		const params = values(callee.fnType.param)

		// Length-check of arguments
		const lenArgs = this.args.length
		const lenRequiredParams = callee.fnType.optionalPos

		if (lenArgs < lenRequiredParams) {
			argLog.push({
				level: 'error',
				ref: this,
				reason: `Expected ${lenRequiredParams} arguments, but got ${lenArgs}.`,
			})
		}

		// Unify FnType and args
		const [unifier, shadowedArgs] = this.#unify(env)
		const unifiedParams = params.map(p => unifier.substitute(p))
		const unifiedArgs = shadowedArgs.map(a => unifier.substitute(a))

		// Check types of args and cast them to default if necessary
		const args = unifiedParams.map((pType, i) => {
			const aType = unifiedArgs[i] ?? Val.unit
			const name = names[i]

			if (Val.isSubtype(aType, pType)) {
				// Type matched
				return () => {
					const [a, la] = this.args[i].eval(env).asTuple
					argLog.push(...la)
					return a
				}
			} else {
				// Type mismatched
				if (aType.type !== 'Unit') {
					const p = pType.print({omitMeta: true})
					const a = aType.print({omitMeta: true})
					const d = pType.defaultValue.print({omitMeta: true})
					argLog.push({
						level: 'error',
						ref: this,
						reason:
							`Argument '${name}' expects type: ${p}, but got: ${a}. ` +
							`Uses a default value ${d} instead`,
					})
				}
				return () => pType.defaultValue
			}
		})

		// For rest argument
		if (callee.fnType.rest) {
			const pType = callee.fnType.rest.value
			// NOTE: Should handle non-labeled rest parameter
			const name = callee.fnType.rest.name ?? '(no name)'

			for (let i = unifiedParams.length; i < this.args.length; i++) {
				const aType = unifiedArgs[i]

				if (Val.isSubtype(aType, pType)) {
					// Type matched
					args.push(() => {
						const [a, la] = this.args[i].eval(env).asTuple
						argLog.push(...la)
						return a
					})
				} else {
					// Type mismatched
					if (aType.type !== 'Unit') {
						const p = pType.print({omitMeta: true})
						const a = aType.print({omitMeta: true})
						const d = pType.defaultValue.print({omitMeta: true})
						argLog.push({
							level: 'error',
							ref: this,
							reason:
								`Rest argument '${name}' expects type: ${p}, ` +
								`but got: ${a}. ` +
								`Uses a default value ${d} instead.`,
						})
					}
					args.push(() => pType.defaultValue)
				}
			}
		}

		// Call the function
		let result: Val.Value, callLog: Set<Log | Omit<Log, 'ref'>>
		try {
			;[result, callLog] = callee.fn(...args).asTuple
		} catch (e) {
			if (env.isGlobal) {
				const message = e instanceof Error ? e.message : 'Run-time error'
				const ref = e instanceof GlispError ? e.ref : this
				throw new GlispError(ref, message)
			} else {
				throw e
			}
		}

		const unifiedResult = unifier.substitute(result, true)

		// Set this as 'ref'
		const callLogWithRef = [...callLog].map(log => ({...log, ref: this}))

		return withLog(unifiedResult, ...calleeLog, ...argLog, ...callLogWithRef)
	}

	protected forceInfer = (env: Env): WithLog => {
		if (!this.callee) return this.forceEval(env)

		const [ty, log] = this.callee.infer(env).asTuple
		if (!('fnType' in ty)) return withLog(ty, ...log)

		/**
		 * A function type whose return type equals to All is type constructor
		 * (e.g. 'struct' function), so it should be evaluated to infer a type of
		 * the expression
		 */
		if (ty.fnType.out.isEqualTo(Val.all)) {
			return this.eval(env)
		}

		const [unifier] = this.#unify(env)
		return withLog(unifier.substitute(ty.fnType.out, true), ...log)
	}

	printExceptMeta = (options: PrintOptions): string => {
		if (!this.callee) return '()'

		const callee = this.callee.print(options)
		const args = this.args.map(a => a.print(options))

		return '(' + [callee, ...args].join(' ') + ')'
	}

	isSameTo = (node: Node) =>
		this.type === node.type && isEqualArray(this.args, node.args, isSame)

	clone = (): Call => Call.of(this.callee, ...this.args.map(clone))

	static of(callee?: Node, ...args: Node[]) {
		const app = new Call(callee, args)
		if (callee) setParent(callee, app)
		args.forEach(a => setParent(a, app))
		return app
	}
}

export class Scope extends BaseNode {
	readonly type = 'Scope' as const

	private constructor(public vars: Record<string, Node>, public out?: Node) {
		super()
	}

	protected forceInfer = (env: Env): WithLog =>
		this.out?.infer(env) ?? withLog(Val.unit)

	protected forceEval = (env: Env) => this.out?.eval(env) ?? Writer.of(Val.unit)

	printExceptMeta = (options: PrintOptions): string => {
		const vars = entries(this.vars).map(
			([k, v]) => k + ' = ' + v.print(options)
		)
		const out = this.out ? [this.out.print(options)] : []

		return '(let ' + [...vars, ...out].join(' ') + ')'
	}

	isSameTo = (node: Node) =>
		this.type === node.type &&
		nullishEqual(this.out, node.out, isSame) &&
		isEqualDict(this.vars, node.vars, isSame)

	clone = (): Scope => Scope.of(mapValues(this.vars, clone), this.out?.clone())

	extend(vars: Record<string, Node>, out?: Node): Scope {
		const scope = new Scope(vars, out)
		scope.parent = this
		return scope
	}

	def(name: string, node: Node) {
		if (name in this.vars)
			throw new Error(`Variable '${name}' is already defined`)

		setParent(node, this)
		this.vars[name] = node

		return this
	}

	defs(vars: Record<string, Node>) {
		for (const [name, exp] of entries(vars)) {
			this.def(name, exp)
		}
	}

	static of(vars: Record<string, Node>, out?: Node) {
		const scope = new Scope(vars, out)
		values(vars).forEach(v => setParent(v, scope))
		if (out) setParent(out, scope)
		return scope
	}
}

export class TryCatch extends BaseNode {
	readonly type = 'TryCatch'

	private constructor(public block: Node, public handler: Node) {
		super()
	}

	protected forceEval = (env: Env): WithLog => {
		try {
			return this.block.eval(env)
		} catch (e) {
			if (!(e instanceof GlispError)) throw e

			const log: Log = {
				level: 'error',
				reason: e.message,
				ref: e.ref,
			}

			const [handler, lh] = this.handler.eval(env).asTuple

			return withLog(handler, log, ...lh)
		}
	}

	protected forceInfer = (env: Env): WithLog => {
		const [block, lb] = this.block.infer(env).asTuple
		const [handler, lh] = this.handler.infer(env).asTuple

		return withLog(Val.unionType(block, handler), ...lb, ...lh)
	}

	printExceptMeta = (options: PrintOptions): string => {
		const block = this.block.print(options)
		const handler = this.handler.print(options)
		return `(try ${block} ${handler})`
	}

	isSameTo = (node: Node): boolean =>
		this.type === node.type &&
		isSame(this.block, node.block) &&
		nullishEqual(this.handler, node.handler, isSame)

	clone = (): TryCatch => TryCatch.of(this.block.clone(), this.handler.clone())

	static of(block: Node, handler: Node) {
		const tryCatch = new TryCatch(block, handler)

		setParent(block, tryCatch)
		if (handler) setParent(handler, tryCatch)

		return tryCatch
	}
}

export function setParent(node: Node, parent: Node | null) {
	node.parent = parent
	if (node.valueMeta?.defaultValue) {
		node.valueMeta.defaultValue.parent = parent
	}
}

export function isSame(a: Node, b: Node): boolean {
	return a.isSameTo(b)
}

export function print(node: Node, options?: PrintOptions) {
	return node.print(options)
}

export function clone(node: Node) {
	return node.clone()
}
