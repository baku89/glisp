import {entries} from 'lodash'

export type Value = Any | Bottom | Int | Bool | Fn | TyFn | TyAtom

interface IVal {
	type: string
	print(): string
}

export class Any implements IVal {
	public type: 'any' = 'any'

	public print() {
		return 'Any'
	}
}

export class Bottom implements IVal {
	public type: 'bottom' = 'bottom'

	public print() {
		return '_'
	}
}

export class Int implements IVal {
	public type: 'int' = 'int'
	public constructor(public value: number) {}

	public print() {
		return this.value.toString()
	}
}

export class Bool implements IVal {
	public type: 'bool' = 'bool'
	public constructor(public value: boolean) {}

	public print() {
		return this.value.toString()
	}
}

export class Fn implements IVal {
	public type: 'fn' = 'fn'
	public constructor(
		public value: (...params: any[]) => Value,
		public fnType: TyFn
	) {}

	public print() {
		return '(-> <JS Function>)'
	}
}

export class TyFn implements IVal {
	public type: 'tyFn' = 'tyFn'
	public constructor(public param: Record<string, Value>, public out: Value) {}

	public print(): string {
		const param = entries(this.param)
			.map(([k, v]) => k + ':' + v.print())
			.join(' ')

		const out = this.out.print()

		return `(-> {${param}} ${out})`
	}
}

export class TyAtom implements IVal {
	public type: 'tyAtom' = 'tyAtom'
	public constructor(public name: string) {}

	public print() {
		return `(tyAtom ${this.name})`
	}
}

export const TyInt = new TyAtom('Int')
export const TyBool = new TyAtom('Bool')
