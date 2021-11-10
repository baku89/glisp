import {entries, fromPairs, isEqualWith, keys, mapValues, values} from 'lodash'

import {hasEqualValues} from '../utils/hasEqualValues'
import {nullishEqual} from '../utils/nullishEqual'
import {Writer} from '../utils/Writer'
import {zip} from '../utils/zip'
import * as Val from '../val'
import {
	Const,
	createFreshTyVarsTable,
	replaceTyVars,
	Subst,
	unify,
	useFreshTyVars,
} from './unify'

export type Node = Sym | Obj | Fn | TyFn | Vec | App | Scope

export type Type = Node['type']

export interface Log {
	level: 'error' | 'warn' | 'info'
	reason: string
	ref: Node
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

		return Writer.of(obj(Val.bottom), log)
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

export const sym = Sym.of

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

export const obj = Obj.of
export const int = (v: number) => Obj.of(Val.int(v))

export class Fn extends BaseNode {
	public readonly type: 'fn' = 'fn'

	private constructor(public param: Record<string, Node>, public body: Node) {
		super()
	}

	public infer(env: Env = new Map()): Val.Value {
		const param = Writer.mapValues(this.param, p => p.eval(env)).result
		const [table, tableRev] = createFreshTyVarsTable(...values(param))
		const rec = mapValues(param, p => Obj.asType(replaceTyVars(p, table)))

		const innerEnv = new Map([...env.entries(), [this, rec]])
		const out = this.body.infer(innerEnv)

		return Val.tyFn(values(param), replaceTyVars(out, tableRev))
	}

	public eval(env: Env = new Map()): ValueWithLog {
		const paramNames = keys(this.param)

		const fn: Val.IFn = (...args: Val.Value[]) => {
			const rec = fromPairs(zip(paramNames, args.map(obj)))
			const innerEnv = new Map([...env.entries(), [this, rec]])

			return this.body.eval(innerEnv).result
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

export const fn = Fn.of

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

export const tyFn = TyFn.of

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

export const vec = Vec.of
export const vecFrom = Vec.from

export class App extends BaseNode {
	public readonly type: 'app' = 'app'

	private constructor(public fn: Node, public args: Node[]) {
		super()
	}

	private inferFn(env?: Env): [Val.TyFn, Subst, Val.Value[]] {
		const ty = this.fn.infer(env)
		if (!('tyFn' in ty)) return [Val.tyFn([], ty), Subst.empty(), []]

		// Infer type by resolving constraints
		const tyFn = useFreshTyVars(ty.tyFn) as Val.TyFn

		const tyArgs = this.args.map(a => useFreshTyVars(a.infer(env)))
		const consts = tyFn.tyParam.map(
			(pTy, i) => [tyArgs[i] ?? Val.bottom, pTy] as Const
		)
		const subst = unify(consts)
		const tyParam = tyFn.tyParam.map(p => subst.applyTo(p))
		const tyOut = subst.applyTo(tyFn.tyOut)

		return [Val.tyFn(tyParam, tyOut), subst, tyArgs]
	}

	public eval(env?: Env): ValueWithLog {
		const [fn, fnLog] = this.fn.eval(env).asTuple
		const logs: Log[] = []

		if (!('fn' in fn)) return Writer.of(fn, ...fnLog)

		const [{tyParam}, subst, tyArgs] = this.inferFn(env)
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

		const result = subst.applyTo(fn.fn(...args))

		return Writer.of(result, ...fnLog, ...logs)
	}

	public infer(env?: Env): Val.Value {
		const [tyFn] = this.inferFn(env)
		return tyFn.tyOut
	}

	public print(): string {
		const fn = this.fn.print()
		const args = this.args.map(a => a.print()).join(' ')

		return `(${fn} ${args})`
	}

	public static of(fn: Node, ...args: Node[]) {
		const app = new App(fn, args)
		fn.parent = app
		args.forEach(a => (a.parent = app))
		return app
	}
}

export const app = App.of

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

	public static of(vars: Record<string, Node>, out: Node | null = null) {
		const scope = new Scope(vars, out)
		values(vars).forEach(v => (v.parent = scope))
		if (out) out.parent = scope
		return scope
	}
}

export const scope = Scope.of

export function isEqual(a: Node, b: Node): boolean {
	switch (a.type) {
		case 'sym':
			return b.type === 'sym' && a.name === b.name
		case 'obj':
			return b.type === a.type && a.value.isEqualTo(b.value)
		case 'vec':
			return (
				b.type === 'vec' &&
				a.length === b.length &&
				nullishEqual(a.rest, b.rest, isEqual) &&
				zip(a.items, b.items).every(([ai, bi]) => isEqual(ai, bi))
			)
		case 'fn':
			return (
				b.type === 'fn' &&
				hasEqualValues(a.param, b.param, isEqual) &&
				isEqual(a.body, b.body)
			)
		case 'tyFn': {
			return (
				b.type === 'tyFn' &&
				a.tyParam.length === b.tyParam.length &&
				zip(a.tyParam, b.tyParam).every(([ap, bp]) => isEqual(ap, bp)) &&
				isEqual(a.out, b.out)
			)
		}
		case 'app':
			return b.type === 'app' && isEqualWith(a.args, b.args, isEqual)
		case 'scope': {
			return (
				b.type === 'scope' &&
				nullishEqual(a.out, b.out, isEqual) &&
				hasEqualValues(a.vars, b.vars, isEqual)
			)
		}
	}
}
