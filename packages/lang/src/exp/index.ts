import {entries, isEqualWith, values} from 'lodash'

import {bindWithLog, mapWithLog, WithLog, withLog} from '../utils/WithLog'
import * as Val from '../val'

export type Node = Var | Int | Bool | Obj | Fn | Call | Scope

export type Type = Node['type']

interface Log {
	level: 'error' | 'warn' | 'info'
	reason: string
	ref: Node
}

export type ValueWithLog = WithLog<Val.Value, Log>

interface IExp {
	type: string
	parent: Node | null

	eval(): ValueWithLog
	infer(): ValueWithLog
	print(): string
}

export class Var implements IExp {
	public type: 'var' = 'var'
	public parent: Node | null = null

	public constructor(public name: string) {}

	public resolve(): WithLog<Node, Log> {
		let ref = this.parent

		while (ref) {
			if (ref.type === 'scope' && this.name in ref.vars) {
				return withLog(ref.vars[this.name])
			}

			ref = ref.parent
		}

		if (this.name in GlobalScope.vars) {
			return withLog(GlobalScope.vars[this.name])
		}

		const log: Log = {
			level: 'error',
			ref: this,
			reason: `Variable not bound: ${this.name}`,
		}

		return withLog(new Obj(Val.bottom), [log])
	}

	public eval(): ValueWithLog {
		return bindWithLog(this.resolve(), v => v.eval())
	}

	public infer(): ValueWithLog {
		return bindWithLog(this.resolve(), v => v.infer())
	}

	public print() {
		return this.name
	}
}

export class Int implements IExp {
	public type: 'int' = 'int'
	public parent: Node | null = null

	public constructor(public value: number) {}

	public eval(): ValueWithLog {
		return withLog(Val.int(this.value))
	}

	public infer(): ValueWithLog {
		return withLog(Val.int(this.value))
	}

	public print() {
		return this.value.toString()
	}
}

export class Bool implements IExp {
	public type: 'bool' = 'bool'
	public parent: Node | null = null

	public constructor(public value: boolean) {}

	public eval(): ValueWithLog {
		return withLog(Val.bool(this.value))
	}

	public infer(): ValueWithLog {
		return withLog(Val.bool(this.value))
	}

	public print() {
		return this.value.toString()
	}
}

export class Obj implements IExp {
	public type: 'obj' = 'obj'
	public parent: Node | null = null

	public constructor(public value: Val.Value) {}

	public eval(): ValueWithLog {
		return withLog(this.value)
	}

	public infer(): ValueWithLog {
		if (
			this.value.type === 'tyAtom' ||
			this.value.type === 'tyFn' ||
			this.value.type === 'tyUnion'
		) {
			return withLog(new Val.TySingleton(this.value))
		}
		return withLog(this.value)
	}

	public print() {
		return '<JS Object>:' + this.value.print()
	}
}

export class Fn implements IExp {
	public type: 'fn' = 'fn'
	public parent: Node | null = null

	public constructor(public param: Record<string, Node>, public body: Node) {
		values(param).forEach(p => (p.parent = this))
		body.parent = this
	}

	public infer(): ValueWithLog {
		const {result: param, log: paramLog} = mapWithLog(values(this.param), exp =>
			exp.infer()
		)
		const {result: out, log: outLog} = this.body.infer()
		return withLog(Val.tyFn(param, out), [...paramLog, ...outLog])
	}

	public eval(): ValueWithLog {
		// NOTE: write how to evaluate
		return withLog(Val.bottom)
	}

	public print(): string {
		const params = entries(this.param)
			.map(([k, v]) => `${k}:${v.print()}`)
			.join(' ')
		const body = this.body.print()

		return `(-> {${params}} ${body})`
	}
}

export class Call implements IExp {
	public type: 'call' = 'call'
	public parent: Node | null = null

	public constructor(public fn: Node, public args: Node[]) {
		fn.parent = this
		args.forEach(a => (a.parent = this))
	}

	public eval(): ValueWithLog {
		const {result: fn, log: fnLog} = this.fn.eval()
		const {result: args, log: argsLog} = mapWithLog(this.args, a => a.eval())
		const logs: Log[] = []

		if (fn.type !== 'fn') return withLog(fn, fnLog)

		const convertedArgs = entries(fn.tyParam).map(([name, p], i) => {
			const a = args[i]

			if (!a) {
				logs.push({
					level: 'error',
					ref: this,
					reason: `Insufficient argument: ${name}`,
				})
				return p.convert(Val.bottom)
			}

			if (!a.isSubtypeOf(p) || a.type === 'bottom') {
				if (a.type !== 'bottom') {
					logs.push({
						level: 'error',
						ref: this,
						reason: `Parameter ${name} expects type: ${p.print()}, but got: ${a.print()}`,
					})
				}
				return p.convert(a)
			}

			return a
		})

		const result = fn.value(...convertedArgs)

		return withLog(result, [...fnLog, ...argsLog, ...logs])
	}

	public infer(): ValueWithLog {
		return bindWithLog(this.fn.infer(), ty =>
			withLog(ty.type === 'tyFn' ? ty.out : ty)
		)
	}

	public print(): string {
		const fn = this.fn.print()
		const args = this.args.map(a => a.print()).join(' ')

		return `(${fn} ${args})`
	}
}

export class Scope implements IExp {
	public type: 'scope' = 'scope'
	public parent: Node | null = null

	public constructor(
		public vars: Record<string, Node>,
		public out: Node | null = null
	) {
		values(vars).forEach(v => (v.parent = this))
		if (out) out.parent = this
	}

	public infer(): ValueWithLog {
		return this.out ? this.out.infer() : withLog(Val.bottom)
	}

	public eval(): ValueWithLog {
		return this.out ? this.out.eval() : withLog(Val.bottom)
	}

	public print(): string {
		const vars = entries(this.vars).map(([k, v]) => k + '=' + v.print())
		const out = this.out ? [this.out.print()] : []

		return '{' + [...vars, ...out].join(' ') + '}'
	}
}

export function isEqual(a: Node, b: Node): boolean {
	switch (a.type) {
		case 'var':
			return b.type === 'var' && a.name === b.name
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

const GlobalScope = new Scope({
	_: new Obj(Val.bottom),
	Int: new Obj(Val.tyInt),
	Bool: new Obj(Val.tyBool),
	'+': new Obj(
		Val.fn(
			(a: Val.Int, b: Val.Int) => Val.int(a.value + b.value),
			{x: Val.tyInt, y: Val.tyInt},
			Val.tyInt
		)
	),
	'*': new Obj(
		Val.fn(
			(a: Val.Int, b: Val.Int) => Val.int(a.value * b.value),
			{x: Val.tyInt, y: Val.tyInt},
			Val.tyInt
		)
	),
	'<': new Obj(
		Val.fn(
			(a: Val.Int, b: Val.Int) => Val.bool(a.value < b.value),
			{x: Val.tyInt, y: Val.tyInt},
			Val.tyInt
		)
	),
	'|': new Obj(
		Val.fn(
			(t1: Val.Value, t2: Val.Value) => Val.uniteTy(t1, t2),
			{x: Val.tyInt, y: Val.tyInt},
			Val.tyInt
		)
	),
})
