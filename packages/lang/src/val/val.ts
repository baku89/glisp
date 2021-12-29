import {
	difference,
	differenceWith,
	entries,
	fromPairs,
	keys,
	mapValues,
	values,
} from 'lodash'

import * as Ast from '../ast'
import {Env} from '../ast/env'
import {Log, withLog} from '../log'
import {isEqualArray} from '../util/isEqualArray'
import {isEqualDict} from '../util/isEqualDict'
import {isEqualSet} from '../util/isEqualSet'
import {nullishEqual} from '../util/nullishEqual'
import {Writer} from '../util/Writer'
import {zip} from '../util/zip'
import {tyUnion} from './TypeOperation'

export type Value = Type | Atomic

type Type = All | TyPrim | TyEnum | TyFn | TyStruct | TyUnion | TyVar

type Atomic =
	| Bottom
	| Unit
	| Prim<any>
	| Num
	| Str
	| Enum
	| Fn
	| Vec
	| Dict
	| Struct

export type UnitableType = Exclude<Value, All | Bottom>

abstract class BaseValue {
	protected constructor() {
		return this
	}

	abstract readonly type: string
	abstract defaultValue: Atomic

	abstract isType: boolean
	abstract isEqualTo(e: Value): boolean
	abstract isSubtypeOf(e: Value): boolean
	abstract toAst(): Ast.Node

	print = () => this.toAst().print()
}

export type IFn = (...params: any[]) => Writer<Value, Log>

interface ITyFn {
	tyFn: TyFn
}

interface IFnLike extends ITyFn {
	fn: IFn
}

function isSubtypeOfGeneric(
	this: Exclude<Value, All | Bottom | TyUnion>,
	e: Value
): boolean {
	if (e.type === 'tyUnion') return e.isSupertypeOf(this)
	return this.isEqualTo(e) || this.superType.isSubtypeOf(e)
}

export class Unit extends BaseValue {
	readonly type = 'unit' as const
	superType!: All
	defaultValue = this

	toAst = () => Ast.lUnit()

	isEqualTo = (v: Value) => v.type === 'unit'
	isSubtypeOf = isSubtypeOfGeneric.bind(this)
	isType = false

	static instance = new Unit()
}

export class All extends BaseValue {
	readonly type = 'all' as const
	defaultValue = Unit.instance

	toAst = () => Ast.lAll()
	isEqualTo = (v: Value) => v.type === 'all'
	isSubtypeOf = this.isEqualTo
	isType = false

	static instance = new All()
}

Unit.prototype.superType = All.instance

export class Bottom extends BaseValue {
	readonly type = 'bottom' as const
	defaultValue = this

	toAst = () => Ast.lBottom()

	isEqualTo = (v: Value) => v.type === 'bottom'
	isSubtypeOf = () => true
	isType = true

	static instance = new Bottom()
}

export class Prim<T = any> extends BaseValue {
	readonly type = 'prim' as const
	defaultValue = this

	protected constructor(public superType: TyPrim, public value: T) {
		super()
	}

	toAst = (): Ast.Node => Ast.obj(this)

	isEqualTo = (val: Value) =>
		val.type === 'prim' &&
		isEqual(this.superType, val.superType) &&
		this.value === val.value

	isSubtypeOf: (e: Value) => boolean = isSubtypeOfGeneric.bind(this)

	isType = false

	static from<T>(ty: TyPrim, value: T) {
		return new Prim<T>(ty, value)
	}
}

export class Num extends Prim<number> {
	toAst = () => Ast.lNum(this.value)

	static of(value: number) {
		return new Num(tyNum, value)
	}
}

export class Str extends Prim<string> {
	toAst = () => Ast.lStr(this.value)

	static of(value: string) {
		return new Str(tyStr, value)
	}
}

export class TyPrim<T = any> extends BaseValue {
	readonly type = 'tyPrim' as const
	superType = All.instance
	defaultValue!: Num | Str | Prim

	private constructor(private readonly name: string) {
		super()
	}

	// TODO: fix this
	toAst = () => Ast.sym(this.name)

	isEqualTo = (v: Value) => v.type === 'tyPrim' && this.name === v.name

	isSubtypeOf: (e: Value) => boolean = isSubtypeOfGeneric.bind(this)

	of(value: T): Prim<T> {
		return Prim.from(this, value)
	}

	isType = true

	isInstance = (e: Value): e is Prim<T> =>
		e.type === 'prim' && e.isSubtypeOf(this)

	static ofLiteral(name: string, defaultValue: Prim) {
		const ty = new TyPrim(name)
		ty.defaultValue = defaultValue
		defaultValue.superType = ty
		return ty
	}

	static of<T>(name: string, defaultValue: T) {
		const ty = new TyPrim<T>(name)
		const d = Prim.from(ty, defaultValue)
		ty.defaultValue = d
		return ty
	}
}

export const tyNum = TyPrim.ofLiteral('Num', Num.of(0))
export const tyStr = TyPrim.ofLiteral('Str', Str.of(''))

Num.prototype.superType = tyNum
Str.prototype.superType = tyStr

export class Enum extends BaseValue {
	readonly type = 'enum' as const
	superType!: TyEnum

	private constructor(public readonly name: string) {
		super()
	}

	defaultValue = this

	// TODO: fix this
	toAst = () => Ast.sym(this.name)

	isEqualTo = (v: Value) =>
		v.type === 'enum' &&
		this.name === v.name &&
		this.superType.isEqualTo(v.superType)

	isSubtypeOf = isSubtypeOfGeneric.bind(this)

	isType = false

	static of(name: string) {
		return new Enum(name)
	}
}

export class TyEnum extends BaseValue {
	readonly type = 'tyEnum' as const
	superType = All.instance

	private constructor(
		public readonly name: string,
		public readonly types: Enum[]
	) {
		super()
	}

	defaultValue = this.types[0]

	// TODO: fix this
	toAst = () => Ast.sym(this.name)

	isEqualTo = (v: Value) => v.type === 'tyEnum' && this.name === v.name

	isSubtypeOf = isSubtypeOfGeneric.bind(this)

	isType = true

	getEnum = (label: string) => {
		const en = this.types.find(t => t.name === label)
		if (!en) throw new Error('Cannot find label')
		return en
	}

	isInstance = (e: Value): e is Enum => e.type === 'enum' && e.isSubtypeOf(this)

	static of(name: string, labels: string[]) {
		if (labels.length === 0) throw new Error('Zero-length enum')

		const types = labels.map(Enum.of)
		const tyEnum = new TyEnum(name, types)
		tyEnum.defaultValue = types[0]
		types.forEach(t => (t.superType = tyEnum))

		return tyEnum
	}
}

export class TyVar extends BaseValue {
	readonly type = 'tyVar' as const
	readonly superType = All.instance

	private constructor(public name: string, public readonly original?: TyVar) {
		super()
	}

	defaultValue = Unit.instance

	toAst = () => Ast.sym(this.name)

	isEqualTo = (v: Value) => this === v
	isSubtypeOf = isSubtypeOfGeneric.bind(this)
	isType = true

	shadow = (): TyVar => {
		return new TyVar(this.name, this)
	}

	unshadow = (): TyVar => {
		return this.original ?? this
	}

	public static of(name: string) {
		return new TyVar(name)
	}
}

export class Fn extends BaseValue implements IFnLike {
	readonly type = 'fn' as const

	env?: Env
	isTypeCtor = false

	private constructor(
		public superType: TyFn,
		public fn: IFn,
		public body?: Ast.Node
	) {
		super()
	}

	tyFn = this.superType

	defaultValue = this

	// TODO: fix this
	toAst = () => {
		return Ast.sym('fn')
	}

	isEqualTo = () => false
	isSubtypeOf = isSubtypeOfGeneric.bind(this)
	isType = false

	static of(param: Record<string, Value>, out: Value, fn: IFn) {
		return new Fn(TyFn.from(param, out), fn)
	}
	static from(ty: TyFn, fn: IFn, body?: Ast.Node) {
		return new Fn(ty, fn, body)
	}
}

export class TyFn extends BaseValue implements ITyFn {
	readonly type = 'tyFn' as const
	superType = All.instance

	private constructor(public param: Record<string, Value>, public out: Value) {
		super()
	}

	tyFn = this

	get defaultValue(): Fn {
		return Fn.from(this, () => withLog(this.out.defaultValue))
	}

	toAst = (): Ast.ETyFn => {
		const param = mapValues(this.param, p => p.toAst())
		const out = this.out.toAst()
		return Ast.eTyFnFrom([], param, out)
	}

	isEqualTo = (v: Value) =>
		v.type === 'tyFn' &&
		isEqualArray(values(this.param), values(v.param), isEqual) &&
		isEqual(this.out, v.out)

	isSubtypeOf = (e: Value): boolean => {
		if (this.superType.isSubtypeOf(e)) return true
		if (e.type === 'tyUnion') return e.isSupertypeOf(this)
		if (e.type !== 'tyFn') return false

		const tParam = Vec.of(...values(this.param))
		const eParam = Vec.of(...values(e.param))

		return isSubtype(eParam, tParam) && isSubtype(this.out, e.out)
	}

	isType = true

	static of(param: Value | Value[], out: Value) {
		const paramArr = [param].flat()
		const pairs = paramArr.map((p, i) => [i, p] as const)
		const paramDict = Object.fromEntries(pairs)
		return new TyFn(paramDict, out)
	}

	static from(param: Record<string, Value>, out: Value) {
		return new TyFn(param, out)
	}
}

export class Vec extends BaseValue implements IFnLike {
	readonly type = 'vec' as const
	readonly superType = All.instance

	private constructor(public readonly items: Value[], public rest?: Value) {
		super()
	}

	get defaultValue(): Vec {
		return Vec.of(...this.items.map(it => it.defaultValue))
	}

	toAst = (): Ast.Node => {
		const items = this.items.map(it => it.toAst())
		return Ast.eVecFrom(items, this.rest?.toAst())
	}

	isEqualTo = (v: Value) =>
		v.type === 'vec' &&
		isEqualArray(this.items, v.items, isEqual) &&
		nullishEqual(this.rest, v.rest, isEqual)

	isSubtypeOf = (v: Value): boolean => {
		if (this.superType.isSubtypeOf(v)) return true
		if (v.type === 'tyUnion') return v.isSupertypeOf(this)
		if (v.type !== 'vec') return false

		const isAllItemsSubtype =
			this.items.length >= v.items.length &&
			zip(this.items, v.items).every(([ti, vi]) => isSubtype(ti, vi))

		if (!isAllItemsSubtype) return false

		if (v.rest) {
			const tr = v.rest
			const isRestSubtype = this.items
				.slice(v.items.length)
				.every(ti => ti.isSubtypeOf(tr))

			if (!isRestSubtype) return false

			if (this.rest) {
				return isSubtype(this.rest, v.rest)
			}
		}

		return true
	}

	get isType() {
		return !!this.rest || this.items.some(isType)
	}

	tyFn = TyFn.of(tyNum, tyUnion(...this.items))

	fn: IFn = (index: Num) => {
		const ret = this.items[index.value]
		if (ret === undefined) {
			return withLog(this.tyFn.out.defaultValue, {
				level: 'error',
				reason: 'Index out of range',
			})
		}
		return withLog(ret)
	}

	static of(...items: Value[]) {
		return new Vec(items)
	}

	static from(items: Value[], rest?: Value) {
		return new Vec(items, rest)
	}
}
export class Dict extends BaseValue {
	readonly type = 'dict' as const
	superType = All.instance

	private constructor(
		public readonly items: Record<string, Value>,
		public readonly optionalKeys: Set<string>,
		public readonly rest?: Value
	) {
		super()
	}

	#isRequredKey(key: string) {
		return key in this.items && !this.optionalKeys.has(key)
	}

	get defaultValue(): Dict {
		const itemEntries = entries(this.items)
			.filter(([k]) => this.#isRequredKey(k))
			.map(([k, v]) => [k, v.defaultValue])

		return Dict.of(fromPairs(itemEntries))
	}

	toAst = (): Ast.EDict => {
		const items = mapValues(this.items, it => it.toAst())
		return Ast.eDictFrom(items, this.optionalKeys, this.rest?.toAst())
	}

	isEqualTo = (v: Value) =>
		v.type === 'dict' &&
		isEqualDict(this.items, v.items, isEqual) &&
		isEqualSet(this.optionalKeys, v.optionalKeys) &&
		nullishEqual(this.rest, v.rest, isEqual)

	isSubtypeOf = (v: Value): boolean => {
		if (this.superType.isSubtypeOf(v)) return true
		if (v.type === 'tyUnion') return v.isSupertypeOf(this)
		if (v.type !== 'dict') return false

		const tKeys = keys(v.items)

		for (const k of tKeys) {
			const vi = v.items[k]
			if (v.#isRequredKey(k)) {
				const sv = this.#isRequredKey(k) ? this.items[k] : false
				if (!sv || !isSubtype(sv, vi)) return false
			} else {
				const sv = k in this.items ? this.items[k] : this.rest
				if (sv && !isSubtype(sv, vi)) return false
			}
		}

		if (v.rest) {
			const sKeys = keys(this.items)
			const extraKeys = difference(sKeys, tKeys)
			for (const k of extraKeys) {
				if (!isSubtype(this.items[k], v.rest)) return false
			}
			if (this.rest && !isSubtype(this.rest, v.rest)) return false
		}

		return true
	}

	get isType() {
		return (
			!!this.rest ||
			this.optionalKeys.size > 0 ||
			values(this.items).some(isType)
		)
	}

	static of(
		items: Record<string, Value>,
		optionalKeys: Iterable<string> = [],
		rest?: Value
	) {
		return new Dict(items, new Set(optionalKeys), rest)
	}
}

export class Struct extends BaseValue {
	readonly type = 'struct' as const

	private constructor(public superType: TyStruct, public items: Value[]) {
		super()
	}

	defaultValue = this

	toAst = (): Ast.Node => {
		const items = this.items.map(it => it.toAst())
		const fn = this.superType.toAst()
		return Ast.call(fn, ...items)
	}

	isEqualTo = (v: Value) =>
		v.type === 'struct' &&
		this.superType.isEqualTo(v.superType) &&
		isEqualArray(this.items, v.items, isEqual)

	isSubtypeOf = isSubtypeOfGeneric.bind(this)

	isType = false

	static of(ctor: TyStruct, items: Value[]) {
		return new Struct(ctor, items)
	}
}

export class TyStruct extends BaseValue implements IFnLike {
	readonly type = 'tyStruct' as const
	superType = All.instance

	private constructor(
		public name: string,
		public param: Record<string, Value>
	) {
		super()
	}

	get defaultValue(): Struct {
		const items = values(this.param).map(p => p.defaultValue)
		return Struct.of(this, items)
	}

	tyFn: TyFn = TyFn.from(this.param, this)

	fn = (...items: Value[]) => withLog(this.of(...items))

	// TODO: Fix this
	toAst = () => Ast.sym(this.name)

	isEqualTo = (v: Value) => v.type === 'tyStruct' && this.name === v.name

	isSubtypeOf = isSubtypeOfGeneric.bind(this)

	isType = true

	of(...items: Value[]) {
		return Struct.of(this, items)
	}

	static of(name: string, param: Record<string, Value>) {
		return new TyStruct(name, param)
	}
}

export class TyUnion extends BaseValue {
	readonly type = 'tyUnion' as const
	superType = All.instance

	private constructor(public types: UnitableType[]) {
		super()
		if (types.length < 2) throw new Error('Too few types to create union type')
	}

	get defaultValue(): Atomic {
		return this.types[0].defaultValue
	}

	toAst = (): Ast.Call => {
		const types = this.types.map(ty => ty.toAst())
		return Ast.call(Ast.sym('|'), ...types)
	}

	isEqualTo = (v: Value): boolean =>
		v.type === 'tyUnion' &&
		differenceWith(this.types, v.types, isEqual).length === 0

	isSubtypeOf = (e: Value): boolean => {
		if (this.superType.isSubtypeOf(e)) return true

		const types: Value[] = e.type === 'tyUnion' ? e.types : [e]
		return this.types.every(s => types.some(s.isSubtypeOf))
	}

	isType = true

	isSupertypeOf = (s: Exclude<Value, TyUnion>) => this.types.some(s.isSubtypeOf)

	static fromTypesUnsafe(types: UnitableType[]) {
		return new TyUnion(types)
	}

	static of = tyUnion
}

export function isEqual(a: Value, b: Value): boolean {
	return a.isEqualTo(b)
}

export function isSubtype(a: Value, b: Value): boolean {
	return a.isSubtypeOf(b)
}

function isType(value: Value): boolean {
	return value.isType
}
