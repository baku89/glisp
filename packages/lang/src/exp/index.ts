import {entries, isEqualWith} from 'lodash'

export type Node = Var | Int | Bool | Fn | Call

export type Type = Node['type']

interface IExp {
	type: string

	print(): string
}

export class Var implements IExp {
	public type: 'var' = 'var'

	public constructor(public name: string) {}

	public print() {
		return this.name
	}
}

export class Int implements IExp {
	public type: 'int' = 'int'
	public constructor(public value: number) {}

	public print() {
		return this.value.toString()
	}
}

export class Bool implements IExp {
	public type: 'bool' = 'bool'
	public constructor(public value: boolean) {}

	public print() {
		return this.value.toString()
	}
}

export class Fn implements IExp {
	public type: 'fn' = 'fn'

	public constructor(public params: Record<string, Var>, public body: Node) {}

	public print(): string {
		const params = entries(this.params)
			.map(([k, v]) => `${k}:${v.print}`)
			.join(' ')
		const body = this.body.print()

		return `(-> {${params}} ${body})`
	}
}

export class Call implements IExp {
	public type: 'call' = 'call'

	public constructor(
		public fn: Node,
		public args: Node[],
		public namedArgs: Record<string, Node> = {}
	) {}

	public print(): string {
		const fn = this.fn.print()
		const args = this.args.map(a => a.print()).join(' ')
		const namedArgs = entries(this.namedArgs)
			.map(([k, v]) => `${k}=${v.print()}`)
			.join(' ')

		return `(${fn} ${args} ${namedArgs})`
	}
}

export function isEqual(a: Node, b: Node): boolean {
	switch (a.type) {
		case 'var':
			return b.type === 'var' && a.name === b.name
		case 'bool':
			return b.type === 'bool' && a.value === b.value
		case 'int':
			return b.type === 'int' && a.value === b.value
		case 'fn':
			return (
				b.type === 'fn' &&
				isEqualWith(a.params, b.params, isEqual) &&
				isEqual(a.body, b.body)
			)
		case 'call':
			return (
				b.type === 'call' &&
				isEqualWith(a.args, b.args, isEqual) &&
				isEqualWith(a.namedArgs, b.namedArgs, isEqual)
			)
	}
}
