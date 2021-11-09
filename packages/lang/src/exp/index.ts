import {entries, fromPairs, isEqualWith, keys, values} from 'lodash'
import {IFn} from 'src/val/val'

import {hasEqualValues} from '../utils/hasEqualValues'
import {nullishEqual} from '../utils/nullishEqual'
import {Writer} from '../utils/Writer'
import {zip} from '../utils/zip'
import * as Val from '../val'
import {unify, useFreshTyVars} from './unify'

export type Node = Sym | Int | Obj | Fn | TyFn | Vec | Call | Scope

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

	public infer(): Val.Value {
		return this.resolve().result.infer()
	}

	public print() {
		return this.name
	}

	public static of(name: string) {
		return new Sym(name)
	}
}

export const sym = Sym.of

export class Int extends BaseNode {
	public readonly type: 'int' = 'int'

	private constructor(public value: number) {
		super()
	}

	public eval(): ValueWithLog {
		return Writer.of(Val.int(this.value))
	}

	public infer(): Val.Value {
		return Val.int(this.value)
	}

	public print() {
		return this.value.toString()
	}

	public static of(value: number) {
		return new Int(value)
	}
}

export const int = Int.of

export class Obj extends BaseNode {
	public readonly type: 'obj' = 'obj'

	private constructor(public value: Val.Value) {
		super()
	}

	public eval(): ValueWithLog {
		return Writer.of(this.value)
	}

	public infer(): Val.Value {
		if (Val.isTy(this.value)) {
			return Val.tyValue(this.value)
		}
		return this.value
	}

	public print() {
		return this.value.print()
	}

	public static of(value: Val.Value) {
		return new Obj(value)
	}
}

export const obj = Obj.of

export class Fn extends BaseNode {
	public readonly type: 'fn' = 'fn'

	private constructor(public param: Record<string, Node>, public body: Node) {
		super()
	}

	public infer(env?: Env): Val.Value {
		const param = values(this.param).map(p => p.infer(env))
		const out = this.body.infer(env)
		return Val.tyFn(param, out)
	}

	public eval(env: Env = new Map()): ValueWithLog {
		const paramNames = keys(this.param)

		const fn: IFn = (...args: Val.Value[]) => {
			const rec = fromPairs(zip(paramNames, args.map(obj)))
			const innerEnv = new Map([...env.entries(), [this, rec]])

			return this.body.eval(innerEnv).result
		}

		const param = Writer.mapValues(this.param, p => p.eval(env))

		const innerEnv = new Map([...env.entries(), [this, this.param]])
		const out = this.body.infer(innerEnv)

		return Writer.of(Val.fn(fn, param.result, out), ...param.log)
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
		const {result: param, log: l1} = Writer.map(this.tyParam, p => p.eval(env))
		const {result: out, log: l2} = this.out.eval(env)
		const tyFn = Val.tyFn(param, out)
		return Writer.of(tyFn, ...l1, ...l2)
	}

	public infer(env?: Env): Val.Value {
		const param = this.tyParam.map(p => p.infer(env))
		const out = this.out.infer(env)
		return Val.tyFn(param, out)
	}

	public print(): string {
		const params = this.tyParam.map(p => p.print())
		const param = params.length === 1 ? params[0] : '(' + params.join(' ') + ')'
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
		const {result, log} = Writer.map(this.items, it => it.eval(env))
		if (this.rest) {
			const {result: resultRest, log: logRest} = this.rest.eval(env)
			return Writer.of(Val.vecV(...result, resultRest), ...log, ...logRest)
		}
		return Writer.of(Val.vec(...result), ...log)
	}

	public infer(env?: Env): Val.Value {
		const items = this.items.map(it => it.infer(env))
		if (this.rest) {
			const rest = this.rest.infer(env)
			return Val.tyValue(Val.vecV(...items, rest))
		}
		return Val.vec(...items)
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

	public static ofV(...items: [Node, ...Node[]]) {
		const heads = items.slice(0, -1)
		const rest = items[items.length - 1]
		const vec = new Vec(heads, rest)
		heads.forEach(it => (it.parent = vec))
		rest.parent = vec
		return vec
	}
}

export const vec = Vec.of
export const vecV = Vec.ofV

export class Call extends BaseNode {
	public readonly type: 'call' = 'call'

	private constructor(public fn: Node, public args: Node[]) {
		super()
	}

	public eval(env?: Env): ValueWithLog {
		const {result: fn, log: fnLog} = this.fn.eval(env)
		const logs: Log[] = []

		if (!('callable' in fn)) return Writer.of(fn, ...fnLog)

		const rawTyParam = values(fn.param)
		const tyArgs = this.args.map(a => a.infer(env)).map(useFreshTyVars)
		const consts = zip(tyArgs, rawTyParam)
		const subst = unify(consts)
		const tyParam = rawTyParam.map(t => subst.applyTo(t))
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
			const {result: aVal, log: evalLog} = a.eval(env)
			logs.push(...evalLog)

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
		const ty = this.fn.infer(env)
		if (!('tyFn' in ty)) return ty

		// Infer type by resolving constraints
		const args = this.args.map(a => useFreshTyVars(a.infer(env)))
		const consts = zip(args, ty.tyFn.tyParam)
		const subst = unify(consts)
		const tyOut = subst.applyTo(ty.tyFn.tyOut)

		return tyOut
	}

	public print(): string {
		const fn = this.fn.print()
		const args = this.args.map(a => a.print()).join(' ')

		return `(${fn} ${args})`
	}

	public static of(fn: Node, ...args: Node[]) {
		const call = new Call(fn, args)
		fn.parent = call
		args.forEach(a => (a.parent = call))
		return call
	}
}

export const call = Call.of

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
		case 'int':
		case 'obj':
			return b.type === a.type && a.value === b.value
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
		case 'call':
			return b.type === 'call' && isEqualWith(a.args, b.args, isEqual)
		case 'scope': {
			return (
				b.type === 'scope' &&
				nullishEqual(a.out, b.out, isEqual) &&
				hasEqualValues(a.vars, b.vars, isEqual)
			)
		}
	}
}
