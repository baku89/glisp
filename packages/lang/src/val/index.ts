import {values} from 'lodash'

export type Value = All | Bottom | Int | Bool | Fn | TyFn | TyAtom

interface IVal {
	type: string
	print(): string
	convert(val: Value): Value
	isSubtypeOf(ty: Value): boolean
}

export class All implements IVal {
	public type: 'all' = 'all'

	public print() {
		return 'All'
	}

	public convert() {
		return new Bottom()
	}

	public isSubtypeOf(ty: Value) {
		return ty.type === 'all'
	}
}

export class Bottom implements IVal {
	public type: 'bottom' = 'bottom'

	public print() {
		return '_'
	}

	public convert() {
		return new Bottom()
	}

	public isSubtypeOf() {
		return true
	}
}

export class Int implements IVal {
	public type: 'int' = 'int'
	public tyAtom = TyInt
	public constructor(public value: number) {}

	public print() {
		return this.value.toString()
	}

	public convert() {
		return this
	}

	public isSubtypeOf(ty: Value) {
		if (ty.type === 'all') return true
		if (ty === this.tyAtom) return true

		return ty.type === 'int' && ty.value === this.value
	}
}

export class Bool implements IVal {
	public type: 'bool' = 'bool'
	public tyAtom = TyBool
	public constructor(public value: boolean) {}

	public print() {
		return this.value.toString()
	}

	public convert() {
		return this
	}

	public isSubtypeOf(ty: Value) {
		if (ty.type === 'all') return true
		if (ty === this.tyAtom) return true

		return ty.type === 'bool' && ty.value === this.value
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

	public convert() {
		return this
	}

	public isSubtypeOf(ty: Value) {
		if (ty.type === 'all') return true
		if (ty.type === 'tyFn') return this.fnType.isSubtypeOf(ty)
		return this === ty
	}
}

export class TyFn implements IVal {
	public type: 'tyFn' = 'tyFn'
	public constructor(public param: Value[], public out: Value) {}

	public print(): string {
		const param = this.param.map(v => v.print()).join(' ')
		const out = this.out.print()

		return `(-> [${param} ${out})`
	}

	public convert(val: Value): Value {
		const outVal = this.out.convert(val)

		return new Fn(() => outVal, this)
	}

	public isSubtypeOf(ty: Value): boolean {
		if (ty.type === 'all') return true
		if (ty.type !== 'tyFn') return false

		const curParam = values(this.param)
		const tyParam = values(ty.param)

		if (curParam.length > tyParam.length) return false

		const isParamSubtype = curParam.every((cty, i) =>
			tyParam[i].isSubtypeOf(cty)
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
		return ty.type === 'all' || this === ty
	}
}

export const TyInt = new TyAtom('Int', () => new Int(0))
export const TyBool = new TyAtom('Bool', () => new Bool(false))
