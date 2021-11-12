import {differenceWith, entries, values} from 'lodash'

import * as Exp from '../exp'
import {hasEqualValues} from '../utils/hasEqualValues'
import {nullishEqual} from '../utils/nullishEqual'
import {Writer} from '../utils/Writer'
import {zip} from '../utils/zip'
import {uniteTy} from '.'

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

interface ITyFn {
	tyFn: TyFn
}

interface IFnLike extends ITyFn {
	param: Record<string, Value>
	out: Value
	fn: IFn
}

export type IFn = (...params: any[]) => Exp.ValueWithLog

export class Bottom implements IVal {
	public readonly type: 'bottom' = 'bottom'
	public readonly defaultValue = Bottom.instance

	private constructor() {
		return this
	}

	public print() {
		return '()'
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
		return '_'
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
		if (ty.type === 'tyUnion') return ty.types.some(t => this.isSubtypeOf(t))

		if (ty.isEqualTo(this.superType)) return true

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

export class Fn implements IVal, IFnLike {
	public readonly type: 'fn' = 'fn'
	public readonly defaultValue = this

	public readonly tyFn!: TyFn

	public constructor(
		public readonly fn: IFn,
		public readonly param: Record<string, Value>,
		public readonly out: Value,
		public readonly body: Exp.Node | null = null
	) {
		this.tyFn = TyFn.of(values(param), out)
	}

	public print(): string {
		const params = entries(this.param).map(([n, ty]) => n + ':' + ty.print())
		const param = params.length === 1 ? params[0] : '(' + params.join(' ') + ')'

		const body = this.body?.print() ?? '(js code)'
		const out = this.out.print()

		return `(=> ${param} ${body}:${out})`
	}

	public isSubtypeOf(ty: Value): boolean {
		if (ty.type === 'all') return true
		if (ty.type === 'tyUnion') return ty.types.some(t => this.isSubtypeOf(t))
		if (ty.type === 'tyFn') {
			return this.tyFn.isSubtypeOf(ty)
		}
		return ty.isEqualTo(this)
	}

	public isEqualTo(val: Value): boolean {
		return (
			val.type === this.type &&
			val.fn === this.fn &&
			hasEqualValues(this.param, val.param, isEqual) &&
			this.out.isEqualTo(val.out)
		)
	}

	public static of(
		value: IFn,
		tyParam: Record<string, Value>,
		tyOut: Value,
		body?: Exp.Node
	) {
		return new Fn(value, tyParam, tyOut, body)
	}
}

export class Vec implements IVal, IFnLike {
	public readonly type: 'vec' = 'vec'

	private constructor(
		public readonly items: Value[],
		public readonly rest: Value | null = null
	) {}

	public get length() {
		return this.items.length
	}

	public param: Record<string, Value> = {index: tyInt}
	public get out() {
		return uniteTy(...this.items, ...(this.rest ? [this.rest] : []))
	}

	public get tyFn() {
		return TyFn.of(tyInt, this.out)
	}

	public fn: IFn = (index: Int) => {
		const ret = this.items[index.value]
		if (ret === undefined) {
			return Writer.of(Bottom.instance, {
				level: 'warn',
				reason: 'Index out of range',
			})
		}
		return Writer.of(ret)
	}

	public isSubtypeOf(ty: Value): boolean {
		if (ty.type === 'all') return true
		if (ty.type === 'tyUnion') return ty.types.some(t => this.isSubtypeOf(t))
		if (ty.type === 'tyFn') {
			return this.tyFn.isSubtypeOf(ty)
		}

		if (ty.type !== 'vec') return false

		const isAllItemsSubtype =
			this.length >= ty.length &&
			zip(this.items, ty.items).every(([a, b]) => a.isSubtypeOf(b))

		if (!isAllItemsSubtype) {
			return false
		}

		if (ty.rest) {
			const tr = ty.rest
			const isRestSubtype = this.items
				.slice(ty.items.length)
				.every(it => it.isSubtypeOf(tr))

			if (!isRestSubtype) return false

			if (this.rest) {
				return this.rest.isSubtypeOf(ty.rest)
			}
		}

		return true
	}

	public isEqualTo(val: Value): boolean {
		return (
			val.type === 'vec' &&
			val.length === this.length &&
			nullishEqual(val.rest, this.rest, (a, b) => a.isEqualTo(b)) &&
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
	public static from(items: Value[], rest: Value | null = null) {
		return new Vec(items, rest)
	}
}

export class TyVar implements IVal {
	public readonly type: 'tyVar' = 'tyVar'
	public readonly defaultValue = Bottom.instance

	private constructor(
		private readonly id: string,
		public readonly original?: TyVar
	) {}

	public print() {
		return '<' + this.id + '>'
	}

	public isSubtypeOf(ty: Value): boolean {
		if (ty.type === 'all') return true
		if (ty.type === 'tyUnion') return ty.types.some(t => this.isSubtypeOf(t))

		return this.isEqualTo(ty)
	}

	public isEqualTo(val: Value): boolean {
		return val.type === this.type && val.id === this.id
	}

	public shadow(): TyVar {
		return new TyVar(this.id + '-' + TyVar.counter++, this)
	}

	public unshadow(): TyVar {
		return this.original ?? this
	}

	private static counter = 1
	private static store: Map<string, TyVar> = new Map()

	public static of(id: string) {
		let v = TyVar.store.get(id)
		if (!v) {
			v = new TyVar(id)
			TyVar.store.set(id, v)
		}
		return v
	}

	public static fresh() {
		return TyVar.of('T-' + TyVar.counter++)
	}
}

export class TyFn implements IVal, ITyFn {
	public readonly type: 'tyFn' = 'tyFn'

	public readonly tyFn = this

	private constructor(
		public readonly tyParam: Value[],
		public readonly tyOut: Value
	) {}

	public print(): string {
		const canOmitParens =
			this.tyParam.length === 1 && this.tyParam[0].type !== 'bottom'

		const params = this.tyParam.map(v => v.print())
		const param = canOmitParens ? params[0] : '(' + params.join(' ') + ')'
		const out = this.tyOut.print()

		return `(-> ${param} ${out})`
	}

	public get defaultValue(): Value {
		const outVal = this.tyOut.defaultValue
		return Fn.of(() => Writer.of(outVal), {}, this.tyOut)
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
	public readonly defaultValue!: Value

	private constructor(
		public readonly types: Exclude<Value, TyUnion>[],
		defaultValue?: Value
	) {
		if (types.length <= 1) throw new Error('Invalid union type')

		this.defaultValue = defaultValue ?? this.types[0].defaultValue
	}

	public isSubtypeOf(ty: Value): boolean {
		if (ty.type === 'all') return true
		if (ty.type !== 'tyUnion') return this.types.every(s => s.isSubtypeOf(ty))

		return this.types.every(s => ty.types.some(t => s.isSubtypeOf(t)))
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

	public extends(defaultValue: Value) {
		return new TyUnion(this.types, defaultValue)
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
		private readonly uid: string,
		public readonly defaultValue: Value
	) {}

	public print() {
		// TODO: fix this
		return this.uid
	}

	public isSubtypeOf(ty: Value): boolean {
		if (ty.type === 'all') return true
		if (ty.type === 'tyUnion') return ty.types.some(t => this.isSubtypeOf(t))
		return this.isEqualTo(ty)
	}

	public isEqualTo(val: Value): boolean {
		return val.type === 'tyAtom' && val.uid === this.uid
	}

	public extends(defaultValue: Value) {
		return new TyAtom(this.uid, defaultValue)
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
