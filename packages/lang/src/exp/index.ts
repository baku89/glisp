import {entries, isEqualWith, values} from 'lodash'

import * as Val from '../val'

export type Node = Var | Bottom | Int | Bool | Fn | Call

export type Type = Node['type']

interface IExp {
	type: string

	eval(): Val.Value
	inferTy(): Val.Value
	print(): string
}

export class Var implements IExp {
	public type: 'var' = 'var'

	public constructor(public name: string) {}

	public eval() {
		switch (this.name) {
			case '+':
				return new Val.Fn(
					(a: Val.Int, b: Val.Int) => new Val.Int(a.value + b.value),
					new Val.TyFn([Val.TyInt, Val.TyInt], Val.TyInt)
				)
			case '*':
				return new Val.Fn(
					(a: Val.Int, b: Val.Int) => new Val.Int(a.value * b.value),
					new Val.TyFn([Val.TyInt, Val.TyInt], Val.TyInt)
				)
			case '<':
				return new Val.Fn(
					(a: Val.Int, b: Val.Int) => new Val.Bool(a.value < b.value),
					new Val.TyFn([Val.TyInt, Val.TyInt], Val.TyBool)
				)
			default:
				throw new Error('Variable not bound: ' + this.name)
		}
	}

	public inferTy() {
		const v = this.eval()
		if (v.type === 'fn') return v.fnType
		return v
	}

	public print() {
		return this.name
	}
}

export class Bottom implements IExp {
	public type: 'bottom' = 'bottom'

	public eval() {
		return new Val.Bottom()
	}

	public inferTy() {
		return this.eval()
	}

	public print() {
		return '_'
	}
}

export class Int implements IExp {
	public type: 'int' = 'int'
	public superType = Val.TyInt
	public constructor(public value: number) {}

	public eval() {
		return new Val.Int(this.value)
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
	public superType = Val.Bool
	public constructor(public value: boolean) {}

	public eval() {
		return new Val.Bool(this.value)
	}

	public inferTy() {
		return this.eval()
	}

	public print() {
		return this.value.toString()
	}
}

export class Fn implements IExp {
	public type: 'fn' = 'fn'

	public constructor(public param: Record<string, Node>, public body: Node) {}

	public inferTy(): Val.Value {
		const param = values(this.param).map(exp => exp.inferTy())
		const out = this.body.inferTy()
		return new Val.TyFn(param, out)
	}

	public eval() {
		// NOTE: write how to evaluate
		return new Val.Bottom()
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

	public constructor(public fn: Node, public args: Node[]) {}

	public eval(): Val.Value {
		const fn = this.fn.eval()
		const args = this.args.map(a => a.eval())

		if (fn.type !== 'fn') return fn

		return fn.value(...args)
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

export function isEqual(a: Node, b: Node): boolean {
	switch (a.type) {
		case 'var':
			return b.type === 'var' && a.name === b.name
		case 'bottom':
			return b.type === 'bottom'
		case 'bool':
			return b.type === 'bool' && a.value === b.value
		case 'int':
			return b.type === 'int' && a.value === b.value
		case 'fn':
			return (
				b.type === 'fn' &&
				isEqualWith(a.param, b.param, isEqual) &&
				isEqual(a.body, b.body)
			)
		case 'call':
			return b.type === 'call' && isEqualWith(a.args, b.args, isEqual)
	}
}
