import {
	difference,
	differenceWith,
	entries,
	keys,
	mapValues,
	values,
} from 'lodash'

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
	| Str
	| Atom
	| Fn
	| Vec
	| Dict
	| TyDict
	| TyVar
	| TyFn
	| TyUnion
	| TyAtom
	| TyValue
	| Prod
	| TyProd
	| Enum
	| TyEnum

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
	public readonly defaultValue = this

	private constructor() {
		return this
	}

	public print = (): string => {
		return '()'
	}

	public isSubtypeOf = (): boolean => {
		return true
	}

	public isEqualTo = (val: Value) => {
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

	public print = (): string => {
		return '_'
	}

	public isSubtypeOf = (ty: Value): boolean => {
		return ty.type === 'all'
	}

	public isEqualTo = (val: Value) => {
		return val.type === this.type
	}

	public static instance = new All()
}

export class Int implements IVal {
	public readonly type: 'int' = 'int'
	public readonly defaultValue = this

	public readonly superType = tyInt
	private constructor(public readonly value: number) {}

	public print = (): string => {
		return this.value.toString()
	}

	public isSubtypeOf = (ty: Value): boolean => {
		if (ty.type === 'all') return true
		if (ty.type === 'tyUnion') return ty.types.some(this.isSubtypeOf)

		return this.superType.isEqualTo(ty) || this.isEqualTo(ty)
	}

	public isEqualTo = (val: Value) => {
		return val.type === this.type && val.value === this.value
	}

	public static of(value: number) {
		return new Int(value)
	}
}

export class Str implements IVal {
	public readonly type: 'str' = 'str'
	public readonly defaultValue = this

	public readonly superType = tyStr
	private constructor(public readonly value: string) {}

	public print = (): string => {
		return '"' + this.value.toString() + '"'
	}

	public isSubtypeOf = (ty: Value): boolean => {
		if (ty.type === 'all') return true
		if (ty.type === 'tyUnion') return ty.types.some(this.isSubtypeOf)

		return this.superType.isEqualTo(ty) || this.isEqualTo(ty)
	}

	public isEqualTo = (val: Value) => {
		return val.type === this.type && val.value === this.value
	}

	public static of(value: string) {
		return new Str(value)
	}
}

export class Atom<T = any> implements IVal {
	public readonly type: 'atom' = 'atom'
	public readonly defaultValue = this

	private constructor(
		public readonly value: T,
		public readonly superType: TyAtom
	) {}

	public print = (): string => {
		return '<instance of ' + this.superType.print() + '>'
	}

	public isSubtypeOf = (ty: Value): boolean => {
		if (ty.type === 'all') return true
		if (ty.type === 'tyUnion') return ty.types.some(this.isSubtypeOf)

		return this.superType.isEqualTo(ty)
	}

	public isEqualTo = () => {
		return false
	}

	public static of<T>(value: T, superType: TyAtom<T>) {
		return new Atom<T>(value, superType)
	}
}

export class Prod implements IVal {
	public readonly type: 'prod' = 'prod'
	public readonly defaultValue = this

	private constructor(
		public readonly superType: TyProd,
		public readonly items: Value[]
	) {}

	public print = (): string => {
		const ctor = this.superType.print()
		const items = this.items.map(it => it.print())
		return '(' + [ctor, ...items].join(' ') + ')'
	}

	public isSubtypeOf = (ty: Value): boolean => {
		if (ty.type === 'all') return true
		if (ty.type === 'tyUnion') return ty.types.some(this.isSubtypeOf)

		return this.superType.isEqualTo(ty) || this.isEqualTo(ty)
	}

	public isEqualTo = (val: Value): boolean => {
		return (
			this.type === val.type &&
			this.superType.isEqualTo(val.superType) &&
			this.items.every((t, i) => t.isEqualTo(val.items[i]))
		)
	}

	public static of(ctor: TyProd, items: Value[]) {
		return new Prod(ctor, items)
	}
}

export class TyProd implements IVal, IFnLike {
	public readonly type: 'tyProd' = 'tyProd'
	public readonly defaultValue!: Prod

	private constructor(
		public readonly uid: string,
		public readonly param: Record<string, Value>
	) {}

	public out = this

	public tyFn = TyFn.of(values(this.param), this)

	public fn: IFn = (...items: Value[]) => Writer.of(Prod.of(this, items))

	public print = () => {
		// TODO: fix this
		return this.uid
	}

	public isSubtypeOf = (ty: Value): boolean => {
		if (ty.type === 'all') return true
		if (ty.type === 'tyUnion') return ty.types.some(this.isSubtypeOf)
		if (ty.type === 'tyFn') return this.tyFn.isSubtypeOf(ty)

		return this.isEqualTo(ty)
	}

	public isEqualTo = (val: Value): boolean => {
		return this.type === val.type && this.uid === val.uid
	}

	public static of(
		uid: string,
		param: Record<string, Value>,
		defaultValue: Value[]
	) {
		const tyParam = values(param)
		if (defaultValue.length !== tyParam.length) {
			throw new Error('Wrong parameter length')
		}
		if (!zip(defaultValue, tyParam).every(([d, t]) => d.isSubtypeOf(t))) {
			throw new Error('Wrong parameter type')
		}

		const tyProd = new TyProd(uid, param)
		const defaultProd = Prod.of(tyProd, defaultValue)
		;(tyProd as any).defaultValue = defaultProd

		return tyProd
	}
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

	public print = (): string => {
		const params = entries(this.param).map(([n, ty]) => n + ':' + ty.print())
		const param = params.length === 1 ? params[0] : '(' + params.join(' ') + ')'

		const body = this.body?.print() ?? '(js code)'
		const out = this.out.print()

		return `(=> ${param} ${body}:${out})`
	}

	public isSubtypeOf = (ty: Value): boolean => {
		if (ty.type === 'all') return true
		if (ty.type === 'tyUnion') return ty.types.some(this.isSubtypeOf)
		if (ty.type === 'tyFn') return this.tyFn.isSubtypeOf(ty)

		return this.isEqualTo(ty)
	}

	public isEqualTo = (val: Value): boolean => {
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

	public readonly tyFn = TyFn.of(tyInt, this.out)

	public readonly fn: IFn = (index: Int) => {
		const ret = this.items[index.value]
		if (ret === undefined) {
			return Writer.of(Bottom.instance, {
				level: 'warn',
				reason: 'Index out of range',
			})
		}
		return Writer.of(ret)
	}

	public isSubtypeOf = (ty: Value): boolean => {
		if (ty.type === 'all') return true
		if (ty.type === 'tyUnion') return ty.types.some(this.isSubtypeOf)
		if (ty.type === 'tyFn') return this.tyFn.isSubtypeOf(ty)

		if (ty.type !== 'vec') return false

		const isAllItemsSubtype =
			this.length >= ty.length &&
			zip(this.items, ty.items).every(([a, b]) => a.isSubtypeOf(b))

		if (!isAllItemsSubtype) return false

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

	public isEqualTo = (val: Value): boolean => {
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

	public print = (): string => {
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

export class Dict implements IVal {
	public readonly type: 'dict' = 'dict'
	private constructor(public readonly items: Record<string, Value>) {}

	public get defaultValue(): Value {
		const items = mapValues(this.items, it => it.defaultValue)
		return new Dict(items)
	}

	public print = (): string => {
		const items = entries(this.items).map(([k, v]) => k + ':' + v.print())
		return '{' + items.join(' ') + '}'
	}

	public isSubtypeOf = (ty: Value): boolean => {
		if (ty.type === 'all') return true
		if (ty.type === 'tyUnion') return ty.types.some(this.isSubtypeOf)
		if (!('asTyDictLike' in ty)) return false

		return isSubtypeDict(this.asTyDictLike, ty.asTyDictLike)
	}

	public isEqualTo = (val: Value): boolean => {
		if (this.type !== val.type) return false
		return hasEqualValues(this.items, val.items, isEqual)
	}

	public get asTyDictLike(): TyDictLike {
		const items = mapValues(this.items, value => ({optional: false, value}))
		return {items, rest: null}
	}

	public static of(items: Record<string, Value>) {
		return new Dict(items)
	}
}

type TyDictItems = Record<string, {optional: boolean; value: Value}>

interface TyDictLike {
	items: TyDictItems
	rest: Value | null
}

export class TyDict implements IVal {
	public readonly type: 'tyDict' = 'tyDict'
	public readonly defaultValue = this

	private constructor(
		public readonly items: TyDictItems,
		public readonly rest: Value | null = null
	) {}

	public print = (): string => {
		const items = entries(this.items).map(([k, {optional, value}]) => {
			return k + (optional ? '?' : '') + ':' + value.print()
		})
		const rest = this.rest ? ['...' + this.rest.print()] : []

		return '{' + [...items, ...rest].join(' ') + '}'
	}

	public isSubtypeOf = (ty: Value): boolean => {
		if (ty.type === 'all') return true
		if (ty.type === 'tyUnion') return ty.types.some(this.isSubtypeOf)
		if (!('asTyDictLike' in ty)) return false

		return isSubtypeDict(this, ty.asTyDictLike)
	}

	public isEqualTo = (val: Value): boolean => {
		if (val.type !== 'tyDict') return false

		const isItemsSame = hasEqualValues(
			this.items,
			val.items,
			(t, v) => t.optional === v.optional && isEqual(t.value, v.value)
		)

		const isRestSame = nullishEqual(this.rest, val.rest, isEqual)

		return isItemsSame && isRestSame
	}

	public asTyDictLike: TyDictLike = this

	public static of(items: TyDictItems, rest?: Value) {
		const noOptional = values(items).every(it => !it.optional)

		if (noOptional && !rest) {
			const itemsRec = mapValues(items, it => it.value)
			return Dict.of(itemsRec)
		}

		return new TyDict(items, rest)
	}
}

function isSubtypeDict(s: TyDictLike, t: TyDictLike) {
	const tKeys = keys(t.items)

	for (const k of tKeys) {
		const tk = t.items[k]
		if (!tk.optional) {
			const sx =
				k in s.items
					? !s.items[k].optional
						? s.items[k].value
						: undefined
					: s.rest
			if (!sx || !sx.isSubtypeOf(tk.value)) return false
		} else {
			const sx = k in s.items ? s.items[k].value : s.rest
			if (sx && !sx.isSubtypeOf(tk.value)) return false
		}
	}

	if (t.rest) {
		const sKeys = keys(s.items)
		for (const k of difference(tKeys, sKeys)) {
			if (!s.items[k].value.isSubtypeOf(t.rest)) return false
		}
		if (s.rest) {
			if (!s.rest.isSubtypeOf(t.rest)) return false
		}
	}

	return true
}

export class TyVar implements IVal {
	public readonly type: 'tyVar' = 'tyVar'
	public readonly defaultValue = Bottom.instance

	private constructor(
		private readonly id: string,
		public readonly original?: TyVar
	) {}

	public print = (): string => {
		return '<' + this.id + '>'
	}

	public isSubtypeOf = (ty: Value): boolean => {
		if (ty.type === 'all') return true
		if (ty.type === 'tyUnion') return ty.types.some(this.isSubtypeOf)
		return this.isEqualTo(ty)
	}

	public isEqualTo = (val: Value): boolean => {
		return val.type === this.type && val.id === this.id
	}

	public shadow = (): TyVar => {
		return new TyVar(this.id + '-' + TyVar.counter++, this)
	}

	public unshadow = (): TyVar => {
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

	public get defaultValue(): Value {
		const outVal = this.tyOut.defaultValue
		return Fn.of(() => Writer.of(outVal), {}, this.tyOut)
	}

	public print = (): string => {
		const canOmitParens =
			this.tyParam.length === 1 && this.tyParam[0].type !== 'bottom'

		const params = this.tyParam.map(v => v.print())
		const param = canOmitParens ? params[0] : '(' + params.join(' ') + ')'
		const out = this.tyOut.print()

		return `(-> ${param} ${out})`
	}

	public isSubtypeOf = (ty: Value): boolean => {
		if (ty.type === 'all') return true
		if (ty.type === 'tyUnion') return ty.types.some(this.isSubtypeOf)
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

	public isEqualTo = (val: Value): boolean => {
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

	public isSubtypeOf = (ty: Value): boolean => {
		if (ty.type === 'all') return true
		if (ty.type !== 'tyUnion') return this.types.every(s => s.isSubtypeOf(ty))

		return this.types.every(s => ty.types.some(s.isSubtypeOf))
	}

	public print = (): string => {
		const types = this.types.map(t => t.print()).join(' ')
		return `(| ${types})`
	}

	public isEqualTo = (val: Value): boolean => {
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

export class TyAtom<T = any> implements IVal {
	public readonly type: 'tyAtom' = 'tyAtom'
	private constructor(
		private readonly uid: string,
		public readonly defaultValue: Int | Str | Atom<T>
	) {}

	public print = (): string => {
		// TODO: fix this
		return this.uid
	}

	public isInstance = <T = any>(val: Value): val is Atom<T> => {
		return val.type === 'atom' && val.superType.uid === this.uid
	}

	public isSubtypeOf = (ty: Value): boolean => {
		if (ty.type === 'all') return true
		if (ty.type === 'tyUnion') return ty.types.some(this.isSubtypeOf)
		return this.isEqualTo(ty)
	}

	public isEqualTo = (val: Value): boolean => {
		return val.type === 'tyAtom' && val.uid === this.uid
	}

	public extends = <T>(defaultValue: Int | Str | Atom<T>) => {
		return new TyAtom<T>(this.uid, defaultValue)
	}

	public static ofLiteral(name: string, defaultValue: Int | Str): TyAtom<any> {
		return new TyAtom(name, defaultValue)
	}

	public static of<T>(name: string, defaultValue: T): TyAtom<T> {
		const tyAtom = new TyAtom(name, null as any)
		const defaultAtom = Atom.of(defaultValue, tyAtom)
		;(tyAtom as any).defaultValue = defaultAtom
		return tyAtom
	}
}

export class TyValue implements IVal {
	public readonly type: 'tyValue' = 'tyValue'
	private constructor(
		public readonly value:
			| Vec
			| TyFn
			| TyUnion
			| TyAtom
			| TyVar
			| TyEnum
			| TyProd
	) {}

	public readonly defaultValue = this.value

	public print = (): string => {
		return '(tyValue ' + this.value.print() + ')'
	}

	public isSubtypeOf = (ty: Value): boolean => {
		if (ty.type === 'all') return true
		if (ty.type === 'tyUnion') return ty.types.some(this.isSubtypeOf)
		return this.isEqualTo(ty)
	}

	public isEqualTo = (val: Value): boolean => {
		return val.type === this.type && val.value.isEqualTo(this.value)
	}

	public static of(
		ty: Vec | TyFn | TyUnion | TyAtom | TyVar | TyEnum | TyProd
	) {
		return new TyValue(ty)
	}
}

export class Enum implements IVal {
	public readonly type: 'enum' = 'enum'
	public readonly defaultValue: Enum = this
	public readonly superType!: TyEnum

	public constructor(public readonly uid: string) {}

	public print = (): string => {
		// TODO: fix this
		return this.uid
	}

	public isSubtypeOf = (ty: Value): boolean => {
		if (ty.type === 'all') return true
		if (ty.type === 'tyUnion') return ty.types.some(this.isSubtypeOf)
		if (ty.type === 'tyEnum') {
			return this.superType.isEqualTo(ty)
		}

		return this.isEqualTo(ty)
	}

	public isEqualTo = (val: Value): boolean => {
		return (
			val.type === this.type &&
			val.uid === this.uid &&
			this.superType.isEqualTo(val.superType)
		)
	}
}

export class TyEnum implements IVal {
	public readonly type: 'tyEnum' = 'tyEnum'
	public readonly defaultValue!: Enum

	public constructor(
		public readonly uid: string,
		public readonly types: Enum[]
	) {}

	public print = (): string => {
		// TODO: fix this
		return this.uid
	}

	public isSubtypeOf = (ty: Value): boolean => {
		if (ty.type === 'all') return true
		if (ty.type === 'tyUnion') return ty.types.some(this.isSubtypeOf)

		return this.isEqualTo(ty)
	}

	public isEqualTo = (val: Value) => {
		return val.type === this.type && val.uid === this.uid
	}

	public extends(defaultValue: Enum): TyEnum {
		const tyEnum = new TyEnum(this.uid, this.types)
		;(tyEnum as any).defaultValue = defaultValue
		return tyEnum
	}

	public getEnum(label: string) {
		const en = this.types.find(t => t.uid === label)
		if (!en) throw new Error('Cannot find label')
		return en
	}

	public static of(uid: string, labels: string[]) {
		if (labels.length === 0) throw new Error('Zero-length enum')

		const values = labels.map(l => new Enum(l))
		const tyEnum = new TyEnum(uid, values)
		;(tyEnum as any).defaultValue = values[0]
		values.forEach(v => ((v as any).superType = tyEnum))

		return tyEnum
	}
}

export const tyInt = TyAtom.ofLiteral('Int', Int.of(0))
export const tyStr = TyAtom.ofLiteral('Str', Str.of(''))
export const tyBool = TyEnum.of('Bool', ['false', 'true'])

export const isEqual = (a: Value, b: Value) => a.isEqualTo(b)
