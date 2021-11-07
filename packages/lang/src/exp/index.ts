import {entries, isEqualWith, keys, values} from 'lodash'

import {Writer} from '../utils/Writer'
import {zip} from '../utils/zip'
import * as Val from '../val'
import {infer, unify} from './unify'

export type Node = Sym | Int | Bool | Obj | Fn | Vec | Call | Scope

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

	abstract eval(): ValueWithLog
	abstract infer(): Val.Value
	abstract print(): string
}

export class Sym extends BaseNode {
	public readonly type: 'sym' = 'sym'

	private constructor(public name: string) {
		super()
	}

	public resolve(): NodeWithLog {
		let ref = this.parent

		while (ref) {
			if (ref.type === 'scope' && this.name in ref.vars) {
				return Writer.of(ref.vars[this.name])
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

	public eval(): ValueWithLog {
		return this.resolve().bind(v => v.eval())
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

export class Bool extends BaseNode {
	public readonly type: 'bool' = 'bool'

	private constructor(public value: boolean) {
		super()
	}

	public eval(): ValueWithLog {
		return Writer.of(Val.bool(this.value))
	}

	public infer(): Val.Value {
		return Val.bool(this.value)
	}

	public print() {
		return this.value.toString()
	}

	public static of(value: boolean) {
		return new Bool(value)
	}
}

export const bool = Bool.of

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
		return '<JS Object>:' + this.value.print()
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

	public infer(): Val.Value {
		const param = values(this.param).map(p => p.infer())
		const out = this.body.infer()
		return Val.tyFn(param, out)
	}

	public eval(): ValueWithLog {
		// NOTE: write how to evaluate
		return Writer.of(Val.bottom)
	}

	public print(): string {
		const params = entries(this.param)
			.map(([k, v]) => `${k}:${v.print()}`)
			.join(' ')
		const body = this.body.print()

		return `(-> {${params}} ${body})`
	}

	public static of(param: Record<string, Node>, body: Node) {
		const fn = new Fn(param, body)
		values(param).forEach(p => (p.parent = fn))
		body.parent = fn
		return fn
	}
}

export const fn = Fn.of

export class Vec extends BaseNode {
	public readonly type: 'vec' = 'vec'

	private constructor(public items: Node[], public rest: Node | null = null) {
		super()
	}

	public get length() {
		return this.items.length
	}

	public eval(): ValueWithLog {
		const {result, log} = Writer.map(this.items, it => it.eval())
		if (this.rest) {
			const {result: resultRest, log: logRest} = this.rest.eval()
			return Writer.of(Val.vecV(...result, resultRest), ...log, ...logRest)
		}
		return Writer.of(Val.vec(...result), ...log)
	}

	public infer(): Val.Value {
		const items = this.items.map(it => it.infer())
		if (this.rest) {
			const rest = this.rest.infer()
			return Val.tyValue(Val.vecV(...items, rest))
		}
		return Val.tyValue(Val.vec(...items))
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

	public eval(): ValueWithLog {
		const {result: fn, log: fnLog} = this.fn.eval()
		const logs: Log[] = []

		if (fn.type !== 'fn') return Writer.of(fn, ...fnLog)

		const tyArgs = this.args.map(a => a.infer())
		const consts = zip(tyArgs, fn.tyParam)
		const subst = unify(consts)
		const tyParam = fn.tyParam.map(t => subst.applyTo(t))
		const paramNames = keys(fn.param)

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
			const {result: aVal, log: evalLog} = a.eval()
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

		const result = fn.value(...args)

		return Writer.of(result, ...fnLog, ...logs)
	}

	public infer(): Val.Value {
		const ty = this.fn.infer()
		if (!Val.isTyFn(ty)) return ty

		// Infer type by resolving constraints
		const args = this.args.map(a => a.infer())
		const consts = zip(args, ty.tyParam)
		const tyOut = infer(ty.tyOut, consts)

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

	public infer(): Val.Value {
		return this.out ? this.out.infer() : Val.bottom
	}

	public eval(): ValueWithLog {
		return this.out ? this.out.eval() : Writer.of(Val.bottom)
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
		case 'bool':
		case 'int':
		case 'obj':
			return b.type === a.type && a.value === b.value
		case 'vec':
			return (
				b.type === 'vec' &&
				a.length === b.length &&
				((a.rest === null && b.rest === null) ||
					(a.rest !== null && b.rest !== null && isEqual(a.rest, b.rest))) &&
				zip(a.items, b.items).every(([ai, bi]) => isEqual(ai, bi))
			)
		case 'fn':
			return (
				b.type === 'fn' &&
				isEqualWith(a.param, b.param, isEqual) &&
				isEqual(a.body, b.body)
			)
		case 'call':
			return b.type === 'call' && isEqualWith(a.args, b.args, isEqual)
		case 'scope': {
			return (
				b.type === 'scope' &&
				((a.out === null && b.out === null) ||
					(a.out !== null && b.out !== null && isEqual(a.out, b.out))) &&
				isEqualWith(a.vars, b.vars, isEqual)
			)
		}
	}
}
