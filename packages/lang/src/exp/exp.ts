import {entries, fromPairs, keys, mapValues, values} from 'lodash'

import {Writer} from '../utils/Writer'
import {zip} from '../utils/zip'
import * as Val from '../val'
import {RangedUnifier, shadowTyVars, unshadowTyVars} from './unify'

export type Node = Sym | Obj | Fn | TyFn | Vec | Dict | App | Scope

export type Type = Node['type']

export interface Log {
	level: 'error' | 'warn' | 'info'
	reason: string
	ref?: Node
}

export type ValueWithLog = Writer<Val.Value, Log>
export type NodeWithLog = Writer<Node, Log>

abstract class BaseNode {
	public abstract type: string
	public parent: Node | null = null

	abstract eval(env?: Env): ValueWithLog
	abstract infer(env?: Env): Val.Value
	abstract print(): string
}

type Env = Map<Fn, Record<string, Node>>

export class Sym extends BaseNode {
	public readonly type: 'sym' = 'sym'

	private constructor(public name: string) {
		super()
	}

	public resolve(env?: Env): NodeWithLog {
		let ref = this.parent

		while (ref) {
			if (ref.type === 'scope' && this.name in ref.vars) {
				return Writer.of(ref.vars[this.name])
			}
			if (env && ref.type === 'fn') {
				const param = env.get(ref)
				if (param && this.name in param) {
					return Writer.of(param[this.name])
				}
			}

			ref = ref.parent
		}

		const log: Log = {
			level: 'error',
			ref: this,
			reason: 'Variable not bound: ' + this.name,
		}

		return Writer.of(Obj.of(Val.bottom), log)
	}

	public eval(env?: Env): ValueWithLog {
		return this.resolve(env).bind(v => v.eval(env))
	}

	public infer(env?: Env): Val.Value {
		return this.resolve(env).result.infer(env)
	}

	public print() {
		return this.name
	}

	public static of(name: string) {
		return new Sym(name)
	}
}

export class Obj extends BaseNode {
	public readonly type: 'obj' = 'obj'

	private constructor(public value: Val.Value, public asType: boolean) {
		super()
	}

	public eval(): ValueWithLog {
		return Writer.of(this.value)
	}

	public infer(): Val.Value {
		if (this.asType === false && Val.isTy(this.value)) {
			return Val.tyValue(this.value)
		}
		return this.value
	}

	public print() {
		return this.value.print()
	}

	public static of(value: Val.Value) {
		return new Obj(value, false)
	}

	public static asType(value: Val.Value) {
		return new Obj(value, true)
	}
}

export class Fn extends BaseNode {
	public readonly type: 'fn' = 'fn'

	private constructor(public param: Record<string, Node>, public body: Node) {
		super()
	}

	public infer(env: Env = new Map()): Val.Value {
		const param = Writer.mapValues(this.param, p => p.eval(env)).result
		const paramDict = mapValues(param, p => Obj.asType(p))

		const innerEnv = new Map([...env.entries(), [this, paramDict]])
		const out = this.body.infer(innerEnv)

		return Val.tyFn(values(param), out)
	}

	public eval(env: Env = new Map()): ValueWithLog {
		const paramNames = keys(this.param)

		const fn: Val.IFn = (...args: Val.Value[]) => {
			const rec = fromPairs(zip(paramNames, args.map(Obj.of)))
			const innerEnv = new Map([...env.entries(), [this, rec]])

			return this.body.eval(innerEnv)
		}

		const evParam = Writer.mapValues(this.param, p => p.eval(env))
		const [param, paramLog] = evParam.asTuple

		const rec = mapValues(param, Obj.asType)
		const innerEnv = new Map([...env.entries(), [this, rec]])
		const out = this.body.infer(innerEnv)

		const fnVal = Val.fn(fn, param, out, this.body)
		return Writer.of(fnVal, ...paramLog)
	}

	public print(): string {
		const params = entries(this.param).map(([k, v]) => k + ':' + v.print())
		const param = params.length === 1 ? params[0] : '(' + params.join(' ') + ')'
		const body = this.body.print()

		return `(=> ${param} ${body})`
	}

	public static of(param: Record<string, Node>, body: Node) {
		const fn = new Fn(param, body)
		values(param).forEach(p => (p.parent = fn))
		body.parent = fn
		return fn
	}
}

export class TyFn extends BaseNode {
	public readonly type: 'tyFn' = 'tyFn'

	private constructor(public tyParam: Node[], public out: Node) {
		super()
	}

	public eval(env: Env = new Map()): ValueWithLog {
		const [param, l1] = Writer.map(this.tyParam, p => p.eval(env)).asTuple
		const [out, l2] = this.out.eval(env).asTuple
		const tyFn = Val.tyFn(param, out)
		return Writer.of(tyFn, ...l1, ...l2)
	}

	public infer(env?: Env): Val.Value {
		const param = this.tyParam.map(p => p.infer(env))
		const out = this.out.infer(env)
		return Val.tyFn(param, out)
	}

	public print(): string {
		let canOmitParens = this.tyParam.length === 1
		if (canOmitParens) {
			const fp = this.tyParam[0]
			const isFirstParamBottom = fp.type === 'obj' && fp.value.type === 'bottom'
			canOmitParens = !isFirstParamBottom
		}

		const params = this.tyParam.map(p => p.print())
		const param = canOmitParens ? params[0] : '(' + params.join(' ') + ')'
		const out = this.out.print()

		return `(-> ${param} ${out})`
	}

	public static of(param: Node | Node[], out: Node) {
		const tyParam = [param].flat()
		const tyFn = new TyFn(tyParam, out)
		tyParam.forEach(p => (p.parent = tyFn))
		out.parent = tyFn
		return tyFn
	}
}

export class Vec extends BaseNode {
	public readonly type: 'vec' = 'vec'

	private constructor(public items: Node[], public rest: Node | null = null) {
		super()
	}

	public get length() {
		return this.items.length
	}

	public eval(env?: Env): ValueWithLog {
		const [items, li] = Writer.map(this.items, it => it.eval(env)).asTuple
		if (this.rest) {
			const [rest, lr] = this.rest.eval(env).asTuple
			return Writer.of(Val.vecFrom(items, rest), ...li, ...lr)
		}
		return Writer.of(Val.vecFrom(items), ...li)
	}

	public infer(env?: Env): Val.Value {
		const items = this.items.map(it => it.infer(env))
		const rest = this.rest?.infer(env)
		if (rest) {
			return Val.tyValue(Val.vecFrom(items, rest))
		} else {
			return Val.vecFrom(items)
		}
	}

	public print(): string {
		const items = this.items.map(it => it.print())
		const rest = this.rest ? ['...' + this.rest.print()] : []
		return '[' + [...items, ...rest].join(' ') + ']'
	}

	public static of(...items: Node[]) {
		const vec = new Vec(items)
		items.forEach(it => (it.parent = vec))
		return vec
	}

	public static from(items: Node[], rest: Node | null = null) {
		const vec = new Vec(items, rest)
		items.forEach(it => (it.parent = vec))
		if (rest) rest.parent = vec
		return vec
	}
}

export class Dict extends BaseNode {
	public readonly type: 'dict' = 'dict'

	private constructor(
		public items: Record<string, {optional?: boolean; value: Node}>,
		public rest?: Node
	) {
		super()
	}

	public infer(env?: Env): Val.Value {
		const items = mapValues(this.items, it => ({
			optional: it.optional,
			value: it.value.infer(env),
		}))
		const rest = this.rest?.infer(env)
		return Val.tyDict(items, rest)
	}

	public eval(env?: Env): ValueWithLog {
		const [items, l] = Writer.mapValues(this.items, ({optional, value}) =>
			value.eval(env).fmap(value => ({optional, value}))
		).asTuple
		const [rest, lr] = this.rest ? this.rest.eval(env).asTuple : [undefined, []]
		return Writer.of(Val.tyDict(items, rest), ...l, ...lr)
	}

	public print(): string {
		const items = entries(this.items).map(
			([k, v]) => k + (v.optional ? '?' : '') + ':' + v.value.print()
		)
		const rest = this.rest ? ['...' + this.rest.print()] : []
		return '{' + [...items, ...rest].join(' ') + '}'
	}

	public static of(items: Record<string, Node>) {
		const its = mapValues(items, value => ({value}))
		return Dict.from(its)
	}

	public static from(
		items: Record<string, {optional?: boolean; value: Node}>,
		rest?: Node
	) {
		const dict = new Dict(items, rest)
		values(items).forEach(it => (it.value.parent = dict))
		if (rest) rest.parent = dict
		return dict
	}
}

export class App extends BaseNode {
	public readonly type: 'app' = 'app'

	private constructor(public fn: Node, public args: Node[]) {
		super()
	}

	private inferFn(env?: Env): [Val.TyFn, Val.Value[], RangedUnifier] {
		const ty = this.fn.infer(env)
		if (!('tyFn' in ty)) return [Val.tyFn([], ty), [], RangedUnifier.empty()]

		const tyArgs = this.args
			.slice(0, ty.tyFn.tyParam.length)
			.map(a => shadowTyVars(a.infer(env)))

		const subst = RangedUnifier.unify([
			[Val.vecFrom(ty.tyFn.tyParam), '>=', Val.vecFrom(tyArgs)],
		])

		const unifiedTyFn = subst.substitute(ty.tyFn, false) as Val.TyFn
		const unifiedTyArgs = tyArgs.map(a => subst.substitute(a))

		return [unifiedTyFn, unifiedTyArgs, subst]
	}

	public eval(env?: Env): ValueWithLog {
		const [fn, fnLog] = this.fn.eval(env).asTuple
		const logs: Log[] = []

		if (!('fn' in fn)) return Writer.of(fn, ...fnLog)

		const [{tyParam}, tyArgs, subst] = this.inferFn(env)
		const paramNames = keys(fn.param)

		// Log unused extra arguments
		const unusedArgLogs: Log[] = this.args
			.slice(tyParam.length)
			.map(ref => ({level: 'info', ref, reason: 'Unused argument'}))
		logs.push(...unusedArgLogs)

		const args = tyParam.map((p, i) => {
			const a = this.args[i]
			const name = paramNames[i]

			if (!a) {
				logs.push({
					level: 'error',
					ref: this,
					reason: 'Insufficient argument: ' + name,
				})
				return p.defaultValue
			}

			const aTy = tyArgs[i]
			const [aVal, aLog] = a.eval(env).asTuple
			logs.push(...aLog)

			if (!aTy.isSubtypeOf(p) || aVal.type === 'bottom') {
				if (aVal.type !== 'bottom') {
					logs.push({
						level: 'error',
						ref: this,
						reason:
							`Argument ${name} expects type: ${p.print()}, ` +
							`but got: ${aTy.print()}`,
					})
				}
				return p.defaultValue
			}

			return aVal
		})

		const [result, evalLog] = fn.fn(...args).asTuple

		const resultTyped = unshadowTyVars(subst.substitute(result))

		return Writer.of(resultTyped, ...fnLog, ...logs, ...evalLog)
	}

	public infer(env?: Env): Val.Value {
		const [tyFn] = this.inferFn(env)
		return unshadowTyVars(tyFn.tyOut)
	}

	public print(): string {
		const fn = this.fn.print()
		const args = this.args.map(a => a.print())

		return '(' + [fn, ...args].join(' ') + ')'
	}

	public static of(fn: Node, ...args: Node[]) {
		const app = new App(fn, args)
		fn.parent = app
		args.forEach(a => (a.parent = app))
		return app
	}
}

export class Scope extends BaseNode {
	public readonly type: 'scope' = 'scope'

	private constructor(
		public vars: Record<string, Node>,
		public out: Node | null = null
	) {
		super()
	}

	public infer(env?: Env): Val.Value {
		return this.out ? this.out.infer(env) : Val.bottom
	}

	public eval(env?: Env): ValueWithLog {
		return this.out ? this.out.eval(env) : Writer.of(Val.bottom)
	}

	public print(): string {
		const vars = entries(this.vars).map(([k, v]) => k + '=' + v.print())
		const out = this.out ? [this.out.print()] : []

		return '{' + [...vars, ...out].join(' ') + '}'
	}

	public extend(vars: Record<string, Node>, out: Node | null = null): Scope {
		const scope = new Scope(vars, out)
		scope.parent = this
		return scope
	}

	public static of(vars: Record<string, Node>, out: Node | null = null) {
		const scope = new Scope(vars, out)
		values(vars).forEach(v => (v.parent = scope))
		if (out) out.parent = scope
		return scope
	}
}
