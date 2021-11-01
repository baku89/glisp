import {values} from 'lodash'

export type Value =
	| All
	| Bottom
	| Int
	| Bool
	| Fn
	| TyFn
	| TyUnion
	| TyAtom
	| TySingleton

interface IVal {
	type: string
	print(): string
	convert(val: Value): Value
	isSubtypeOf(ty: Value): boolean
	isEqualTo(val: Value): boolean
}

export class All implements IVal {
	public type: 'all' = 'all'

	public print() {
		return 'All'
	}

	public convert() {
		return bottom
	}

	public isSubtypeOf(ty: Value) {
		return ty.type === 'all'
	}

	public isEqualTo(val: Value) {
		return val.type === this.type
	}
}

export const all = new All()

export class Bottom implements IVal {
	public type: 'bottom' = 'bottom'

	public print() {
		return '_'
	}

	public convert() {
		return bottom
	}

	public isSubtypeOf() {
		return true
	}

	public isEqualTo(val: Value) {
		return val.type === this.type
	}
}

export const bottom = new Bottom()

export class Int implements IVal {
	public type: 'int' = 'int'
	public tyAtom = tyInt
	constructor(public value: number) {}

	public print() {
		return this.value.toString()
	}

	public convert() {
		return this
	}

	public isSubtypeOf(ty: Value): boolean {
		if (ty.type === 'all') return true
		if (ty.type === 'tyUnion') return ty.types.some(t => this.isSubtypeOf(t))
		if (ty === this.tyAtom) return true

		return ty.type === 'int' && ty.value === this.value
	}

	public isEqualTo(val: Value) {
		return val.type === this.type && val.value === this.value
	}
}

export const int = (value: number) => new Int(value)

export class Bool implements IVal {
	public type: 'bool' = 'bool'
	public tyAtom = tyBool
	public constructor(public value: boolean) {}

	public print() {
		return this.value.toString()
	}

	public convert() {
		return this
	}

	public isSubtypeOf(ty: Value): boolean {
		if (ty.type === 'all') return true
		if (ty.type === 'tyUnion') return ty.types.some(t => this.isSubtypeOf(t))
		if (ty === this.tyAtom) return true

		return ty.type === 'bool' && ty.value === this.value
	}

	public isEqualTo(val: Value) {
		return val.type === this.type && val.value === this.value
	}
}

export const bool = (value: boolean) => new Bool(value)

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

	public isSubtypeOf(ty: Value): boolean {
		if (ty.type === 'all') return true
		if (ty.type === 'tyUnion') return ty.types.some(t => this.isSubtypeOf(t))
		if (ty.type === 'tyFn') return this.fnType.isSubtypeOf(ty)
		return this === ty
	}

	public isEqualTo(val: Value) {
		return (
			val.type === this.type &&
			val.value === this.value &&
			val.fnType.isEqualTo(this.fnType)
		)
	}
}

export function fn(value: (...params: any[]) => Value, fnType: TyFn) {
	return new Fn(value, fnType)
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

		return fn(() => outVal, this)
	}

	public isSubtypeOf(ty: Value): boolean {
		if (ty.type === 'all') return true
		if (ty.type === 'tyUnion') return ty.types.some(t => this.isSubtypeOf(t))
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

	public isEqualTo(val: Value): boolean {
		return (
			val.type === this.type &&
			val.param.length === this.param.length &&
			val.param.every((v, i) => v.isEqualTo(this.param[i])) &&
			val.out.isEqualTo(this.out)
		)
	}
}

export function tyFn(param: Value[], out: Value) {
	return new TyFn(param, out)
}

export class TyUnion implements IVal {
	public type: 'tyUnion' = 'tyUnion'
	public constructor(public types: Exclude<Value, TyUnion>[]) {
		if (types.length <= 1) throw new Error('Invalid union type')
	}

	public isSubtypeOf(ty: Value): boolean {
		if (ty.type === 'all') return true
		if (ty.type !== 'tyUnion') return false

		return this.types.every(s => ty.types.some(t => s.isSubtypeOf(t)))
	}

	public convert(val: Value): Value {
		return this.types[0].convert(val)
	}

	public print(): string {
		const types = this.types.map(t => t.print()).join(' ')
		return `(| ${types})`
	}

	public isEqualTo(val: Value): boolean {
		if (val.type !== this.type) return false
		if (val.types.length !== this.types.length) return false

		const dstTypes = [...this.types]
		for (const ty of val.types) {
			const idx = dstTypes.findIndex(dty => ty.isEqualTo(dty))
			if (idx === -1) return false
			dstTypes.splice(idx, 1)
		}

		return true
	}
}

export function uniteTy(...types: Value[]) {
	const flattenedTypes = types.flatMap(ty =>
		ty.type === 'tyUnion' ? ty.types : [ty]
	)

	const normalizedTypes = flattenedTypes.reduce((prev, ty) => {
		const index = prev.findIndex(p => p.isSubtypeOf(ty))
		if (index !== -1) {
			const cur = [...prev]
			cur[index] = ty
			return cur
		}

		const included = prev.some(p => ty.isSubtypeOf(p))
		return included ? prev : [...prev, ty]
	}, [] as Exclude<Value, TyUnion>[])

	if (normalizedTypes.length === 0) return bottom
	if (normalizedTypes.length === 1) return normalizedTypes[0]
	return new TyUnion(normalizedTypes)
}

export class TyAtom implements IVal {
	public type: 'tyAtom' = 'tyAtom'
	public constructor(
		public name: string,
		public convert: (val: Value) => Value
	) {}

	public print() {
		// TODO: fix this
		return this.name
	}

	public isSubtypeOf(ty: Value): boolean {
		if (ty.type === 'all') return true
		if (ty.type === 'tyUnion') return ty.types.some(t => this.isSubtypeOf(t))
		return this === ty
	}

	public isEqualTo(val: Value): boolean {
		return val === this
	}
}

export class TySingleton implements IVal {
	public type: 'tySingleton' = 'tySingleton'
	public constructor(public value: TyFn | TyUnion | TyAtom) {}

	public print() {
		return '(singleton ' + this.value.print() + ')'
	}

	public isSubtypeOf(ty: Value): boolean {
		if (ty.type === 'all') return true
		if (ty.type === 'tyUnion') return ty.types.some(t => this.isSubtypeOf(t))
		if (ty.type === 'tySingleton') {
			return ty.value.isEqualTo(this.value)
		}
		return false
	}

	public convert() {
		return this
	}

	public isEqualTo(val: Value): boolean {
		return val.type === this.type && val.value.isEqualTo(this.value)
	}
}

export const tyInt = new TyAtom('Int', () => new Int(0))
export const tyBool = new TyAtom('Bool', () => new Bool(false))
