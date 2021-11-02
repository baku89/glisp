import {entries, isEqualWith, values} from 'lodash'

import {Writer} from '../utils/Writer'
import * as Val from '../val'

export type Node = Sym | Int | Bool | Obj | Fn | Call | Scope

export type Type = Node['type']

interface Log {
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
	abstract infer(): ValueWithLog
	abstract print(): string
}

export class Sym extends BaseNode {
	public type: 'sym' = 'sym'
	public parent: Node | null = null

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

		if (this.name in GlobalScope.vars) {
			return Writer.of(GlobalScope.vars[this.name])
		}

		const log: Log = {
			level: 'error',
			ref: this,
			reason: `Variable not bound: ${this.name}`,
		}

		return Writer.of(obj(Val.bottom), log)
	}

	public eval(): ValueWithLog {
		return this.resolve().bind(v => v.eval())
	}

	public infer(): ValueWithLog {
		return this.resolve().bind(v => v.infer())
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
	public type: 'int' = 'int'
	public parent: Node | null = null

	private constructor(public value: number) {
		super()
	}

	public eval(): ValueWithLog {
		return Writer.of(Val.int(this.value))
	}

	public infer(): ValueWithLog {
		return Writer.of(Val.int(this.value))
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
	public type: 'bool' = 'bool'
	public parent: Node | null = null

	private constructor(public value: boolean) {
		super()
	}

	public eval(): ValueWithLog {
		return Writer.of(Val.bool(this.value))
	}

	public infer(): ValueWithLog {
		return Writer.of(Val.bool(this.value))
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
	public type: 'obj' = 'obj'
	public parent: Node | null = null

	private constructor(public value: Val.Value) {
		super()
	}

	public eval(): ValueWithLog {
		return Writer.of(this.value)
	}

	public infer(): ValueWithLog {
		if (
			this.value.type === 'tyAtom' ||
			this.value.type === 'tyFn' ||
			this.value.type === 'tyUnion'
		) {
			return Writer.of(Val.singleton(this.value))
		}
		return Writer.of(this.value)
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
	public type: 'fn' = 'fn'
	public parent: Node | null = null

	private constructor(public param: Record<string, Node>, public body: Node) {
		super()
	}

	public infer(): ValueWithLog {
		const {result: param, log: paramLog} = Writer.map(values(this.param), exp =>
			exp.infer()
		)
		const {result: out, log: outLog} = this.body.infer()
		return Writer.of(Val.tyFn(param, out), ...paramLog, ...outLog)
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

export class Call extends BaseNode {
	public type: 'call' = 'call'
	public parent: Node | null = null

	private constructor(public fn: Node, public args: Node[]) {
		super()
	}

	public eval(): ValueWithLog {
		const {result: fn, log: fnLog} = this.fn.eval()
		const logs: Log[] = []

		if (fn.type !== 'fn') return Writer.of(fn, ...fnLog)

		const convertedArgs = entries(fn.tyParam).map(([name, p], i) => {
			const a = this.args[i]

			if (!a) {
				logs.push({
					level: 'error',
					ref: this,
					reason: `Insufficient argument: ${name}`,
				})
				return p.convert(Val.bottom)
			}

			const {result: aTy, log: inferLog} = a.infer()
			const {result: aVal, log: evalLog} = a.eval()
			logs.push(...inferLog, ...evalLog)

			if (!aTy.isSubtypeOf(p) || aVal.type === 'bottom') {
				if (aVal.type !== 'bottom') {
					logs.push({
						level: 'error',
						ref: this,
						reason: `Parameter ${name} expects type: ${p.print()}, but got: ${aTy.print()}`,
					})
				}
				return p.convert(aVal)
			}

			return aVal
		})

		const result = fn.value(...convertedArgs)

		return Writer.of(result, ...fnLog, ...logs)
	}

	public infer(): ValueWithLog {
		return this.fn
			.infer()
			.bind(ty => Writer.of(ty.type === 'fn' ? ty.tyOut : ty))
	}

	public print(): string {
		const fn = this.fn.print()
		const args = this.args.map(a => a.print()).join(' ')

		return `(${fn} ${args})`
	}

	public static of(fn: Node, args: Node[]) {
		const call = new Call(fn, args)
		fn.parent = call
		args.forEach(a => (a.parent = call))
		return call
	}
}

export const call = Call.of

export class Scope extends BaseNode {
	public type: 'scope' = 'scope'
	public parent: Node | null = null

	private constructor(
		public vars: Record<string, Node>,
		public out: Node | null = null
	) {
		super()
	}

	public infer(): ValueWithLog {
		return this.out ? this.out.infer() : Writer.of(Val.bottom)
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

const GlobalScope = scope({
	_: obj(Val.bottom),
	Int: obj(Val.tyInt),
	Bool: obj(Val.tyBool),
	'+': obj(
		Val.fn(
			(a: Val.Int, b: Val.Int) => Val.int(a.value + b.value),
			{x: Val.tyInt, y: Val.tyInt},
			Val.tyInt
		)
	),
	'*': obj(
		Val.fn(
			(a: Val.Int, b: Val.Int) => Val.int(a.value * b.value),
			{x: Val.tyInt, y: Val.tyInt},
			Val.tyInt
		)
	),
	'<': obj(
		Val.fn(
			(a: Val.Int, b: Val.Int) => Val.bool(a.value < b.value),
			{x: Val.tyInt, y: Val.tyInt},
			Val.tyBool
		)
	),
	'|': obj(
		Val.fn(
			(t1: Val.Value, t2: Val.Value) => Val.uniteTy(t1, t2),
			{x: Val.tyInt, y: Val.tyInt},
			Val.tyInt
		)
	),
})
