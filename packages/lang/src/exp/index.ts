import {entries, isEqualWith, values} from 'lodash'

import * as Val from '../val'

export type Node = Var | Int | Bool | Obj | Fn | Call | Scope

export type Type = Node['type']

interface IExp {
	type: string
	parent: Node | null

	eval(): Val.Value
	inferTy(): Val.Value
	print(): string
}

export class Var implements IExp {
	public type: 'var' = 'var'
	public parent: Node | null = null

	public constructor(public name: string) {}

	public resolve() {
		let ref = this.parent

		while (ref) {
			if (ref.type === 'scope' && this.name in ref.vars) {
				return ref.vars[this.name]
			}

			ref = ref.parent
		}

		if (this.name in GlobalScope.vars) {
			return GlobalScope.vars[this.name]
		}

		return new Obj(Val.bottom)
	}

	public eval(): Val.Value {
		return this.resolve().eval()
	}

	public inferTy(): Val.Value {
		return this.resolve().inferTy()
	}

	public print() {
		return this.name
	}
}

export class Int implements IExp {
	public type: 'int' = 'int'
	public parent: Node | null = null

	public constructor(public value: number) {}

	public eval() {
		return Val.int(this.value)
	}

	public inferTy() {
		return this.eval()
	}

	public print() {
		return this.value.toString()
	}
}

export class Bool implements IExp {
	public type: 'bool' = 'bool'
	public parent: Node | null = null

	public constructor(public value: boolean) {}

	public eval() {
		return Val.bool(this.value)
	}

	public inferTy() {
		return this.eval()
	}

	public print() {
		return this.value.toString()
	}
}

export class Obj implements IExp {
	public type: 'obj' = 'obj'
	public parent: Node | null = null

	public constructor(public value: Val.Value) {}

	public eval() {
		return this.value
	}

	public inferTy() {
		if (
			this.value.type === 'tyAtom' ||
			this.value.type === 'tyFn' ||
			this.value.type === 'tyUnion'
		) {
			return new Val.TySingleton(this.value)
		}
		return this.value
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

	public inferTy(): Val.Value {
		const param = values(this.param).map(exp => exp.inferTy())
		const out = this.body.inferTy()
		return Val.tyFn(param, out)
	}

	public eval() {
		// NOTE: write how to evaluate
		return Val.bottom
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

	public eval(): Val.Value {
		const fn = this.fn.eval()
		const args = this.args.map(a => a.eval())

		if (fn.type !== 'fn') return fn

		const convertedArgs = fn.fnType.param.map((p, i) => {
			const a = args[i]

			if (!a) {
				return p.convert(Val.bottom)
			}

			if (!a.isSubtypeOf(p) || a.type === 'bottom') {
				return p.convert(a)
			}

			return a
		})

		return fn.value(...convertedArgs)
	}

	public inferTy(): Val.Value {
		const ty = this.fn.inferTy()
		return ty.type === 'tyFn' ? ty.out : ty
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

	public inferTy(): Val.Value {
		return this.out ? this.out.inferTy() : Val.bottom
	}

	public eval(): Val.Value {
		return this.out ? this.out.eval() : Val.bottom
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
			Val.tyFn([Val.tyInt, Val.tyInt], Val.tyInt)
		)
	),
	'*': new Obj(
		Val.fn(
			(a: Val.Int, b: Val.Int) => Val.int(a.value * b.value),
			Val.tyFn([Val.tyInt, Val.tyInt], Val.tyInt)
		)
	),
	'<': new Obj(
		Val.fn(
			(a: Val.Int, b: Val.Int) => Val.bool(a.value < b.value),
			Val.tyFn([Val.tyInt, Val.tyInt], Val.tyBool)
		)
	),
	'|': new Obj(
		Val.fn(
			(t1: Val.Value, t2: Val.Value) => Val.uniteTy(t1, t2),
			Val.tyFn([Val.all, Val.all], Val.all)
		)
	),
})
