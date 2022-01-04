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
	| UnitLiteral
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

export abstract class BaseNode {
	abstract readonly type: string
	parent: Node | null = null

	protected constructor() {
		return this
	}

	abstract print(): string

	protected abstract forceEval(env: Env): WithLog

	protected abstract forceInfer(env: Env): WithLog

	abstract isSameTo(ast: Node): boolean

	abstract clone(): Node

	eval(env = Env.global) {
		return env.memoizeEval(this, this.forceEval)
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

			return Writer.of({node: UnitLiteral.of()}, log)
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
			const value = node.eval(env)

			return mode === 'param'
				? withLog(value.result.defaultValue, ...value.log)
				: value
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

	print = () => this.name

	isSameTo = (ast: Node) => this.type === ast.type && this.name === ast.name

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

	print = () => {
		const ast = this.value.toAst()
		if (ast.type !== this.type) return ast.print()
		return `<value container of ${this.value.type}>`
	}

	isSameTo = (ast: Node) => this.type === ast.type && this.value === ast.value

	clone = () => ValueContainer.of(this.value)

	static of<V extends Val.Value = Val.Value>(value: V) {
		return new ValueContainer(value)
	}
}

export class UnitLiteral extends BaseNode {
	readonly type = 'UnitLiteral' as const

	protected forceEval = () => withLog(Val.unit)
	protected forceInfer = () => withLog(Val.unit)
	print = () => '()'
	isSameTo = (ast: Node) => this.type === ast.type
	clone = () => UnitLiteral.of()

	static of() {
		return new UnitLiteral()
	}
}

export class AllKeyword extends BaseNode {
	readonly type = 'AllKeyword' as const

	protected forceEval = () => withLog(Val.all)
	protected forceInfer = () => withLog(Val.all)
	print = () => '_'
	isSameTo = (ast: Node) => this.type === ast.type
	clone = () => AllKeyword.of()

	static of() {
		return new AllKeyword()
	}
}

export class NeverKeyword extends BaseNode {
	readonly type = 'NeverKeyword' as const

	protected forceEval = () => withLog(Val.never)
	protected forceInfer = () => withLog(Val.all)
	print = () => 'Never'
	isSameTo = (ast: Node) => this.type === ast.type
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
	print = () => this.value.toString()
	isSameTo = (ast: Node) => this.type === ast.type && this.value === ast.value
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

	print = () => '"' + this.value + '"'
	isSameTo = (ast: Node) => this.type === ast.type && this.value === ast.value
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
		public body: Node
	) {
		super()

		this.typeVars = fromPairs(typeVars.map(name => [name, Val.typeVar(name)]))
	}

	protected forceEval = (env: Env): WithLog => {
		const names = keys(this.param)

		const fn: Val.IFn = (...args: Arg[]) => {
			const arg = fromPairs(zip(names, args))
			const innerEnv = env.extend(arg)
			return this.body.eval(innerEnv)
		}

		const [ty, lty] = this.forceInfer(env).asTuple

		const fnVal = Val.fnFrom(ty, fn, this.body)

		return withLog(fnVal, ...lty)
	}

	protected forceInfer = (env: Env): WithLog<Val.FnType> => {
		const [param, lp] = Writer.mapValues(this.param, p => p.eval(env)).asTuple

		const arg = mapValues(param, p => () => p)

		const innerEnv = env.extend(arg)

		const [out, lo] = this.body.infer(innerEnv).asTuple

		return withLog(Val.fnType({param, out}), ...lp, ...lo)
	}

	print = (): string => {
		const typeVars = printTypeVars(this.typeVars)
		const param = printParam(this.param)
		const body = this.body.print()

		return `(=> ${typeVars}${param} ${body})`
	}

	isSameTo = (ast: Node) =>
		this.type === ast.type &&
		isEqualArray(keys(this.typeVars), keys(ast.typeVars)) &&
		isEqualDict(this.param, ast.param, isSame) &&
		isSame(this.body, ast.body)

	clone = (): FnDef =>
		FnDef.of(
			values(this.typeVars).map(tv => tv.name),
			mapValues(this.param, clone),
			this.body.clone()
		)

	static of(typeVars: string[], param: FnDef['param'], body: Node) {
		const fn = new FnDef(typeVars, param, body)
		values(param).forEach(p => setParent(p, fn))
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
		public out: Node
	) {
		super()

		this.typeVars = fromPairs(typeVars.map(name => [name, Val.typeVar(name)]))
	}

	protected forceEval = (env: Env): WithLog => {
		const [param, lp] = Writer.mapValues(this.param, p => p.eval(env)).asTuple
		const [out, lo] = this.out.eval(env).asTuple
		return withLog(Val.fnType({param, out}), ...lp, ...lo)
	}

	protected forceInfer = () => withLog(Val.all)

	print = (): string => {
		const typeVars = printTypeVars(this.typeVars)
		const param = printParam(this.param)
		const out = this.out.print()
		return `(-> ${typeVars}${param} ${out})`
	}

	isSameTo = (ast: Node): boolean =>
		this.type === ast.type &&
		isEqualArray(keys(this.typeVars), keys(ast.typeVars)) &&
		isEqualDict(this.param, ast.param, isSame) &&
		isSame(this.out, this.out)

	clone = (): FnTypeDef =>
		FnTypeDef.from(
			values(this.typeVars).map(tv => tv.name),
			mapValues(this.param, clone),
			this.out.clone()
		)

	static of(typeVars: string[], param: Node | Node[], out: Node) {
		const paramArr = [param].flat()
		const pairs = paramArr.map((p, i) => [i, p] as const)
		const paramDict = Object.fromEntries(pairs)

		const fnType = new FnTypeDef(typeVars, paramDict, out)

		paramArr.forEach(p => setParent(p, fnType))
		setParent(out, fnType)

		return fnType
	}

	static from(typeVars: string[], param: Record<string, Node>, out: Node) {
		const fnType = new FnTypeDef(typeVars, param, out)
		forOwn(param, p => setParent(p, fnType))
		setParent(out, fnType)
		return fnType
	}
}

function printTypeVars(typeVars: Record<string, Val.TypeVar>): string {
	const es = keys(typeVars)
	if (es.length === 0) return ''
	return '<' + es.join(' ') + '> '
}

function printParam(param: Record<string, Node>) {
	const params = entries(param)

	const canOmitBracket =
		params.length === 1 &&
		!(params[0][1].type === 'VecLiteral' && params[0][1].items.length === 0)

	const paramStr = params.map(printNamedNode).join(' ')

	return canOmitBracket ? paramStr : '[' + paramStr + ']'

	function printNamedNode([name, ty]: [string, Node]) {
		if (/^[0-9]+$/.test(name)) return ty.print()
		return name + ':' + ty.print()
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
		return withLog(Val.vecFrom(items, this.optionalPos, rest), ...li, ...lr)
	}

	protected forceInfer = (env: Env): WithLog => {
		if (this.rest || this.items.length < this.optionalPos) {
			return withLog(Val.all)
		}
		const [items, log] = Writer.map(this.items, it => it.infer(env)).asTuple
		return withLog(Val.vec(...items), ...log)
	}

	print = (): string => {
		const op = this.optionalPos
		const items = this.items.map((it, i) => it.print() + (op <= i ? '?' : ''))
		const rest = this.rest ? ['...' + this.rest.print()] : []
		return '[' + [...items, ...rest].join(' ') + ']'
	}

	isSameTo = (ast: Node): boolean =>
		this.type === ast.type &&
		isEqualArray(this.items, ast.items, isSame) &&
		this.optionalPos === ast.optionalPos &&
		nullishEqual(this.rest, this.rest, isSame)

	clone = (): VecLiteral =>
		VecLiteral.from(this.items.map(clone), this.optionalPos, this.rest?.clone())

	static of(...items: Node[]) {
		return VecLiteral.from(items)
	}

	static from(items: Node[], optionalPos?: number, rest?: Node) {
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

	print = (): string => {
		const items = entries(this.items).map(
			([k, v]) => k + (this.#isOptional(k) ? '?' : '') + ': ' + v.print()
		)
		const rest = this.rest ? ['...' + this.rest.print()] : []
		return '{' + [...items, ...rest].join(' ') + '}'
	}

	isSameTo = (ast: Node): boolean =>
		this.type === ast.type &&
		isEqualDict(this.items, ast.items, isSame) &&
		isEqualSet(this.optionalKeys, ast.optionalKeys) &&
		nullishEqual(this.rest, ast.rest, isSame)

	clone = (): DictLiteral =>
		DictLiteral.from(
			mapValues(this.items, clone),
			this.optionalKeys,
			this.rest?.clone()
		)

	static of(items: Record<string, Node>) {
		return DictLiteral.from(items)
	}

	static from(
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

	private constructor(public callee: Node, public args: Node[]) {
		super()
	}

	#unify(env: Env): [Unifier, Val.Value[]] {
		const calleeType = this.callee.infer(env).result

		if (!('fnType' in calleeType)) return [new Unifier(), []]

		const fnType = calleeType.fnType

		const params = values(fnType.param)

		const shadowedArgs = this.args
			.slice(0, params.length)
			.map(a => shadowTypeVars(a.infer(env).result))

		const unifier = new Unifier([
			Val.vec(...params),
			'>=',
			Val.vec(...shadowedArgs),
		])

		return [unifier, shadowedArgs]
	}

	protected forceEval = (env: Env): WithLog => {
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
		const lenParams = params.length

		if (lenArgs !== lenParams) {
			argLog.push({
				level: 'error',
				ref: this,
				reason: `Expected ${lenParams} arguments, but got ${lenArgs}`,
			})
		}

		// Unify FnType and args
		const [unifier, shadowedArgs] = this.#unify(env)
		const unifiedParams = params.map(p => unifier.substitute(p))
		const unifiedArgs = shadowedArgs.map(a => unifier.substitute(a))

		// Check types of args and cast them to default if necessary
		const args = unifiedParams.map((pTy, i) => {
			const aTy = unifiedArgs[i] ?? Val.unit
			const name = names[i]

			if (!Val.isSubtype(aTy, pTy)) {
				if (aTy.type !== 'Unit') {
					argLog.push({
						level: 'error',
						ref: this,
						reason:
							`Argument '${name}' expects type: ${pTy.print()}, ` +
							`but got: ${aTy.print()}`,
					})
				}
				return () => pTy.defaultValue
			}

			return () => {
				const [a, la] = this.args[i].eval(env).asTuple
				argLog.push(...la)
				return a
			}
		})

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

	print = (): string => {
		const fn = this.callee.print()
		const args = this.args.map(a => a.print())

		return '(' + [fn, ...args].join(' ') + ')'
	}

	isSameTo = (ast: Node) =>
		this.type === ast.type && isEqualArray(this.args, ast.args, isSame)

	clone = (): Call => Call.of(this.callee, ...this.args.map(clone))

	static of(callee: Node, ...args: Node[]) {
		const app = new Call(callee, args)
		setParent(callee, app)
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

	print = (): string => {
		const vars = entries(this.vars).map(([k, v]) => k + ' = ' + v.print())
		const out = this.out ? [this.out.print()] : []

		return '(let ' + [...vars, ...out].join(' ') + ')'
	}

	isSameTo = (ast: Node) =>
		this.type === ast.type &&
		nullishEqual(this.out, ast.out, isSame) &&
		isEqualDict(this.vars, ast.vars, isSame)

	clone = (): Scope => Scope.of(mapValues(this.vars, clone), this.out?.clone())

	extend(vars: Record<string, Node>, out?: Node): Scope {
		const scope = new Scope(vars, out)
		scope.parent = this
		return scope
	}

	def(name: string, exp: Node) {
		if (name in this.vars)
			throw new Error(`Variable '${name}' is already defined`)

		setParent(exp, this)
		this.vars[name] = exp

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

	print = (): string => {
		const block = this.block.print()
		const handler = this.handler.print()
		return `(try ${block} ${handler})`
	}

	isSameTo = (ast: Node): boolean =>
		this.type === ast.type &&
		isSame(this.block, ast.block) &&
		nullishEqual(this.handler, ast.handler, isSame)

	clone = (): TryCatch => TryCatch.of(this.block.clone(), this.handler.clone())

	static of(block: Node, handler: Node) {
		const tryCatch = new TryCatch(block, handler)

		setParent(block, tryCatch)
		if (handler) setParent(handler, tryCatch)

		return tryCatch
	}
}

export function setParent(exp: Node, parent: Node) {
	if ('parent' in exp) {
		exp.parent = parent
	}
}

export function isSame(a: Node, b: Node): boolean {
	return a.isSameTo(b)
}

export function print(n: Node) {
	return n.print()
}

export function clone(n: Node) {
	return n.clone()
}
