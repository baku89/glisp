import {entries, values} from 'lodash'

export type Value = Any | Bottom | Int | Bool | Fn | TyFn | TyAtom

interface IVal {
	type: string
	print(): string
	isSubtypeOf(ty: Value): boolean
}

export class Any implements IVal {
	public type: 'any' = 'any'

	public print() {
		return 'Any'
	}

	public isSubtypeOf(ty: Value) {
		return ty.type === 'any'
	}
}

export class Bottom implements IVal {
	public type: 'bottom' = 'bottom'

	public print() {
		return '_'
	}

	public isSubtypeOf() {
		return true
	}
}

export class Int implements IVal {
	public type: 'int' = 'int'
	public constructor(public value: number) {}

	public print() {
		return this.value.toString()
	}

	public isSubtypeOf(ty: Value) {
		return ty.type === 'any' || ty === TyInt
	}
}

export class Bool implements IVal {
	public type: 'bool' = 'bool'
	public constructor(public value: boolean) {}

	public print() {
		return this.value.toString()
	}

	public isSubtypeOf(ty: Value) {
		return ty.type === 'any' || ty === TyBool
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

	public isSubtypeOf(ty: Value) {
		if (ty.type === 'any') return true
		if (ty.type === 'tyFn') return this.fnType.isSubtypeOf(ty)
		return this === ty
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

	public isSubtypeOf(ty: Value): boolean {
		if (ty.type === 'any') return true
		if (ty.type !== 'tyFn') return false

		const curParams = values(this.param)
		const tyParams = values(ty.param)

		if (curParams.length < tyParams.length) return false

		const isParamSubtype = tyParams.every((typ, i) =>
			typ.isSubtypeOf(curParams[i])
		)

		const isOutSubtype = this.out.isSubtypeOf(ty.out)

		return isParamSubtype && isOutSubtype
	}
}

export class TyAtom implements IVal {
	public type: 'tyAtom' = 'tyAtom'
	public constructor(
		public name: string,
		public convert: (val: Value) => Value
	) {}

	public print() {
		return `(tyAtom ${this.name})`
	}

	public isSubtypeOf(ty: Value) {
		return ty.type === 'any' || this === ty
	}
}

export const TyInt = new TyAtom('Int', () => new Int(0))
export const TyBool = new TyAtom('Bool', () => new Bool(false))
