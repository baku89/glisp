import {differenceWith, entries, isEqualWith, values} from 'lodash'

import {zip} from '../utils/zip'

export type Value =
	| All
	| Bottom
	| Int
	| Bool
	| Fn
	| Vec
	| TyVar
	| TyFn
	| TyUnion
	| TyAtom
	| TyValue

interface IVal {
	type: string
	defaultValue: Value
	print(): string
	isSubtypeOf(ty: Value): boolean
	isEqualTo(val: Value): boolean
}

export class Bottom implements IVal {
	public readonly type: 'bottom' = 'bottom'
	public readonly defaultValue = Bottom.instance

	private constructor() {
		return this
	}

	public print() {
		return '_'
	}

	public isSubtypeOf() {
		return true
	}

	public isEqualTo(val: Value) {
		return val.type === this.type
	}

	public static instance = new Bottom()
}

export class All implements IVal {
	public readonly type: 'all' = 'all'
	public readonly defaultValue = Bottom.instance

	private constructor() {
		return this
	}

	public print() {
		return 'All'
	}

	public isSubtypeOf(ty: Value) {
		return ty.type === 'all'
	}

	public isEqualTo(val: Value) {
		return val.type === this.type
	}

	public static instance = new All()
}

export class Int implements IVal {
	public readonly type: 'int' = 'int'
	public readonly defaultValue = this

	public readonly superType = tyInt
	private constructor(public readonly value: number) {}

	public print() {
		return this.value.toString()
	}

	public isSubtypeOf(ty: Value): boolean {
		if (ty.type === 'all') return true
		if (ty === this.superType) return true
		if (ty.type === 'tyUnion') return ty.types.some(t => this.isSubtypeOf(t))

		return ty.type === 'int' && ty.value === this.value
	}

	public isEqualTo(val: Value) {
		return val.type === this.type && val.value === this.value
	}

	public static of(value: number) {
		return new Int(value)
	}
}

export class Bool implements IVal {
	public readonly type: 'bool' = 'bool'
	public readonly defaultValue = Bottom.instance

	public readonly superType = tyBool
	private constructor(public readonly value: boolean) {}

	public print() {
		return this.value.toString()
	}

	public isSubtypeOf(ty: Value): boolean {
		if (ty.type === 'all') return true
		if (ty === this.superType) return true
		if (ty.type === 'tyUnion') return ty.types.some(t => this.isSubtypeOf(t))

		return ty.type === 'bool' && ty.value === this.value
	}

	public isEqualTo(val: Value) {
		if (val === this) return true
		return val.type === this.type && val.value === this.value
	}

	public static of(value: boolean): Bool {
		return value ? Bool.True : Bool.False
	}

	private static True = new Bool(true)
	private static False = new Bool(false)
}

export class Fn implements IVal {
	public readonly type: 'fn' = 'fn'
	public readonly defaultValue = this

	public readonly tyParam!: Value[]
	public constructor(
		public readonly value: (...params: any[]) => Value,
		public readonly param: Record<string, Value>,
		public readonly out: Value
	) {
		this.tyParam = values(param)
	}

	public get tyOut() {
		return this.out
	}

	public print(): string {
		const params = entries(this.param).map(([n, ty]) => n + ':' + ty.print())
		const param = params.length > 1 ? '[' + params.join(' ') + ']' : params[0]

		const out = this.out.print()
		return `(=> ${param} <JS Function>:${out})`
	}

	public isSubtypeOf(ty: Value): boolean {
		if (ty.type === 'all') return true
		if (ty.type === 'tyUnion') return ty.types.some(t => this.isSubtypeOf(t))
		if (ty.type === 'tyFn') {
			const thisTy = TyFn.of(this.tyParam, this.out)
			return thisTy.isSubtypeOf(ty)
		}
		return this === ty
	}

	public isEqualTo(val: Value): boolean {
		return (
			val.type === this.type &&
			val.value === this.value &&
			isEqualWith(this.param, val.param, isEqual) &&
			this.out.isEqualTo(val.out)
		)
	}

	public static of(
		value: (...params: any[]) => Value,
		tyParam: Record<string, Value>,
		tyOut: Value
	) {
		return new Fn(value, tyParam, tyOut)
	}
}

export class Vec implements IVal {
	public readonly type: 'vec' = 'vec'

	private constructor(
		public readonly items: Value[],
		public readonly rest?: Value
	) {}

	public get length() {
		return this.items.length
	}

	public isSubtypeOf(ty: Value): boolean {
		if (ty.type === 'all') return true
		if (ty.type === 'tyUnion') return ty.types.some(t => this.isSubtypeOf(t))

		if (ty.type === 'vec') {
			return (
				this.length >= ty.length &&
				zip(this.items, ty.items).every(([a, b]) => a.isSubtypeOf(b))
			)
		}

		return false
	}

	public isEqualTo(val: Value): boolean {
		return (
			val.type === 'vec' &&
			val.length === this.length &&
			zip(val.items, this.items).every(([a, b]) => a.isEqualTo(b))
		)
	}

	public get defaultValue(): Value {
		const items = this.items.map(it => it.defaultValue)
		const rest = this.rest?.defaultValue
		return new Vec(items, rest)
	}

	public print(): string {
		const items = this.items.map(it => it.print())
		const rest = this.rest ? ['...' + this.rest.print()] : []
		return '[' + [...items, ...rest].join(' ') + ']'
	}

	public static of(...items: Value[]) {
		return new Vec(items)
	}
	public static ofV(...items: Value[]) {
		const heads = items.slice(0, -1)
		const rest = items[items.length - 1]
		return new Vec(heads, rest)
	}
}

export class TyVar implements IVal {
	public readonly type: 'tyVar' = 'tyVar'
	public readonly defaultValue = Bottom.instance

	private constructor(private readonly id: number = TyVar.counter++) {}

	public print() {
		return '<t' + this.id + '>'
	}

	public isSubtypeOf(ty: Value): boolean {
		if (ty.type === 'all') return true
		if (ty.type === 'tyUnion') return ty.types.some(t => this.isSubtypeOf(t))

		return false
	}

	public isEqualTo(val: Value): boolean {
		return val.type === this.type && val.id === this.id
	}

	private static counter = 1

	public static fresh() {
		return new TyVar()
	}
}

export class TyFn implements IVal {
	public readonly type: 'tyFn' = 'tyFn'

	private constructor(
		public readonly tyParam: Value[],
		public readonly tyOut: Value
	) {}

	public print(): string {
		const params = this.tyParam.map(v => v.print())
		const param = params.length > 1 ? '[' + params.join(' ') + ']' : params[0]
		const out = this.tyOut.print()

		return `(-> ${param} ${out})`
	}

	public get defaultValue(): Value {
		const outVal = this.tyOut.defaultValue
		return Fn.of(() => outVal, {}, this.tyOut)
	}

	public isSubtypeOf(ty: Value): boolean {
		if (ty.type === 'all') return true
		if (ty.type === 'tyUnion') return ty.types.some(t => this.isSubtypeOf(t))
		if (ty.type !== 'tyFn') return false

		const curParam = this.tyParam
		const tyParam = ty.tyParam

		if (curParam.length > tyParam.length) return false

		const isParamSubtype = curParam.every((cty, i) =>
			tyParam[i].isSubtypeOf(cty)
		)

		const isOutSubtype = this.tyOut.isSubtypeOf(ty.tyOut)

		return isParamSubtype && isOutSubtype
	}

	public isEqualTo(val: Value): boolean {
		return (
			val.type === this.type &&
			val.tyParam.length === this.tyParam.length &&
			val.tyParam.every((v, i) => v.isEqualTo(this.tyParam[i])) &&
			val.tyOut.isEqualTo(this.tyOut)
		)
	}

	public static of(param: Value | Value[], out: Value) {
		return new TyFn([param].flat(), out)
	}
}

export class TyUnion implements IVal {
	public readonly type: 'tyUnion' = 'tyUnion'

	private constructor(public readonly types: Exclude<Value, TyUnion>[]) {
		if (types.length <= 1) throw new Error('Invalid union type')
	}

	public isSubtypeOf(ty: Value): boolean {
		if (ty.type === 'all') return true
		if (ty.type !== 'tyUnion') return this.types.every(s => s.isSubtypeOf(ty))

		return this.types.every(s => ty.types.some(t => s.isSubtypeOf(t)))
	}

	public get defaultValue(): Value {
		return this.types[0].defaultValue
	}

	public print(): string {
		const types = this.types.map(t => t.print()).join(' ')
		return `(| ${types})`
	}

	public isEqualTo(val: Value): boolean {
		if (val.type !== this.type) return false
		if (val.types.length !== this.types.length) return false

		return differenceWith(val.types, this.types, isEqual).length === 0
	}

	public static fromTypesUnsafe(types: Value[]) {
		const flattenTypes = types.flatMap(ty =>
			ty.type === 'tyUnion' ? ty.types : ty
		)
		return new TyUnion(flattenTypes)
	}
}

export class TyAtom implements IVal {
	public readonly type: 'tyAtom' = 'tyAtom'
	private constructor(
		public readonly name: string,
		public readonly defaultValue: Value
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

	public static of(name: string, defaultValue: Int | Bool) {
		return new TyAtom(name, defaultValue)
	}
}

export class TyValue implements IVal {
	public readonly type: 'tyValue' = 'tyValue'
	private constructor(
		public readonly value: Vec | TyFn | TyUnion | TyAtom | TyVar
	) {}

	public print() {
		return '(tyValue ' + this.value.print() + ')'
	}

	public isSubtypeOf(ty: Value): boolean {
		if (ty.type === 'all') return true
		if (ty.type === 'tyUnion') return ty.types.some(t => this.isSubtypeOf(t))
		if (ty.type === 'tyValue') {
			return ty.value.isEqualTo(this.value)
		}
		return false
	}

	public readonly defaultValue = this.value

	public isEqualTo(val: Value): boolean {
		return val.type === this.type && val.value.isEqualTo(this.value)
	}

	public static of(ty: Vec | TyFn | TyUnion | TyAtom | TyVar) {
		return new TyValue(ty)
	}
}

export const tyInt = TyAtom.of('Int', Int.of(0))
export const tyBool = TyUnion.fromTypesUnsafe([Bool.of(false), Bool.of(true)])

const isEqual = (a: Value, b: Value) => a.isEqualTo(b)
