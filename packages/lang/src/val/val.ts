import {
	chain,
	difference,
	differenceWith,
	isNull,
	keys,
	mapValues,
	values,
} from 'lodash'

import * as Ast from '../ast'
import {Env} from '../ast/env'
import {Log, withLog} from '../log'
import {hasEqualValues} from '../utils/hasEqualValues'
import {isEqualArray} from '../utils/isEqualArray'
import {Writer} from '../utils/Writer'
import {zip} from '../utils/zip'
import {tyUnion} from './TypeOperation'

export type Value = Type | Atomic

type Type =
	| All
	| TyPrim
	| TyEnum
	| TyFn
	| TyVec
	| TyDict
	| TyStruct
	| TyUnion
	| TyVar

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

interface IValue {
	readonly type: string
	defaultValue: Atomic

	isType: boolean
	isEqualTo(e: Value): boolean
	isSubtypeOf(e: Value): boolean
	toAst(): Ast.Node
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

export class Unit implements IValue {
	readonly type = 'unit' as const
	superType!: All
	defaultValue = this

	toAst = () => Ast.lUnit()

	isEqualTo = (v: Value) => v.type === 'unit'
	isSubtypeOf = isSubtypeOfGeneric.bind(this)
	isType = false

	static instance = new Unit()
}

export class All implements IValue {
	readonly type = 'all' as const
	defaultValue = Unit.instance

	private constructor() {
		return this
	}

	toAst = () => Ast.lAll()
	isEqualTo = (v: Value) => v.type === 'all'
	isSubtypeOf = this.isEqualTo
	isType = false

	static instance = new All()
}

Unit.prototype.superType = All.instance

export class Bottom implements IValue {
	readonly type = 'bottom' as const
	defaultValue = this

	private constructor() {
		return this
	}

	toAst = () => Ast.lBottom()

	isEqualTo = (v: Value) => v.type === 'bottom'
	isSubtypeOf = () => true
	isType = true

	static instance = new Bottom()
}

export class Prim<T = any> implements IValue {
	readonly type = 'prim' as const
	defaultValue = this

	protected constructor(public superType: TyPrim, public value: T) {}

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

export class TyPrim<T = any> implements IValue {
	readonly type = 'tyPrim' as const
	superType = All.instance
	defaultValue!: Num | Str | Prim

	private constructor(private readonly name: string) {}

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

export class Enum implements IValue {
	readonly type = 'enum' as const
	superType!: TyEnum

	private constructor(public readonly name: string) {}

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

export class TyEnum implements IValue {
	readonly type = 'tyEnum' as const
	superType = All.instance

	private constructor(
		public readonly name: string,
		public readonly types: Enum[]
	) {}

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

export class TyVar implements IValue {
	readonly type = 'tyVar' as const
	superType = All.instance

	private constructor(public name: string, public readonly original?: TyVar) {}

	defaultValue = Unit.instance

	toAst = () => Ast.sym(this.name)

	isEqualTo = (v: Value) => v.type === 'tyVar' && this.name === v.name
	isSubtypeOf = isSubtypeOfGeneric.bind(this)
	isType = true

	shadow = (): TyVar => {
		return new TyVar(this.name + '-' + TyVar.#counter++, this)
	}

	unshadow = (): TyVar => {
		return this.original ?? this
	}
	static #counter = 1
	static #store: Map<string, TyVar> = new Map()

	public static fresh() {
		return TyVar.of('T-' + TyVar.#counter++)
	}

	public static of(name: string) {
		let v = TyVar.#store.get(name)
		if (!v) {
			v = new TyVar(name)
			TyVar.#store.set(name, v)
		}
		return v
	}
}

export class Fn implements IValue, IFnLike {
	readonly type = 'fn' as const

	env?: Env
	isTypeCtor = false

	private constructor(
		public superType: TyFn,
		public fn: IFn,
		public body?: Ast.Node
	) {}

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

export class TyFn implements IValue, ITyFn {
	readonly type = 'tyFn' as const
	superType = All.instance

	private constructor(public param: Record<string, Value>, public out: Value) {}

	tyFn = this

	#defaultValue?: Fn
	get defaultValue() {
		this.#defaultValue ??= Fn.from(this, () => withLog(this.out.defaultValue))
		return this.#defaultValue
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

export class Vec implements IValue, IFnLike {
	readonly type = 'vec' as const
	readonly superType = All.instance

	private constructor(public items: Value[]) {}

	#defaultValue?: Vec
	get defaultValue() {
		this.#defaultValue ??= Vec.of(...this.items.map(it => it.defaultValue))
		return this.#defaultValue
	}

	toAst = (): Ast.Node => {
		const items = this.items.map(it => it.toAst())
		return Ast.eVecFrom(items)
	}

	isEqualTo = (v: Value) =>
		v.type === 'vec' && isEqualArray(this.items, v.items, isEqual)

	isSubtypeOf = isSubtypeVecGeneric.bind(this)

	get isType() {
		return this.items.some(isType)
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

	get asTyVecLike(): TyVecLike {
		return {items: this.items}
	}

	static of(...items: Value[]) {
		return new Vec(items)
	}
}

export class TyVec implements IValue {
	readonly type = 'tyVec' as const
	readonly superType = All.instance

	private constructor(public items: Value[], public rest: Value) {}

	#defaultValue?: Vec
	get defaultValue() {
		this.#defaultValue ??= Vec.of(...this.items.map(it => it.defaultValue))
		return this.#defaultValue
	}

	toAst = (): Ast.EVec => {
		const items = this.items.map(it => it.toAst())
		const rest = this.rest.toAst()
		return Ast.eVecFrom(items, rest)
	}

	isEqualTo = (v: Value) =>
		v.type === 'tyVec' && isEqualArray(this.items, v.items, isEqual)

	isSubtypeOf = isSubtypeVecGeneric.bind(this)

	isType = true

	asTyVecLike: TyVecLike = this

	static of(items: Value[], rest: Value) {
		return new TyVec(items, rest)
	}
}

type TyVecLike = {
	items: Value[]
	rest?: Value
}

function isSubtypeVecGeneric(this: Vec | TyVec, e: Value): boolean {
	if (this.superType.isSubtypeOf(e)) return true
	if (e.type === 'tyUnion') return e.isSupertypeOf(this)
	if (!('asTyVecLike' in e)) return false

	return isSubtypeVec(this.asTyVecLike, e.asTyVecLike)
}

function isSubtypeVec(s: TyVecLike, t: TyVecLike) {
	const isAllItemsSubtype =
		s.items.length >= t.items.length &&
		zip(s.items, t.items).every(([si, ti]) => isSubtype(si, ti))

	if (!isAllItemsSubtype) return false

	if (t.rest) {
		const tr = t.rest
		const isRestSubtype = s.items
			.slice(t.items.length)
			.every(ti => ti.isSubtypeOf(tr))

		if (!isRestSubtype) return false

		if (s.rest) {
			return isSubtype(s.rest, t.rest)
		}
	}

	return true
}

export class Dict implements IValue {
	readonly type = 'dict' as const
	superType = All.instance

	private constructor(public items: Record<string, Value>) {}

	#defaultValue?: Dict
	get defaultValue() {
		this.#defaultValue ??= Dict.of(mapValues(this.items, it => it.defaultValue))
		return this.#defaultValue
	}

	toAst = (): Ast.EDict => {
		const items = mapValues(this.items, it => ({
			optional: false,
			value: it.toAst(),
		}))
		return Ast.eDictFrom(items)
	}

	isEqualTo = (v: Value) =>
		v.type === 'dict' && hasEqualValues(this.items, v.items, isEqual)

	isSubtypeOf = isSubtypeDictGeneric.bind(this)

	get isType() {
		return values(this.items).some(isType)
	}

	get asTyDictLike(): TyDictLike {
		const items = mapValues(this.items, value => ({value}))
		return {items}
	}

	static of(items: Record<string, Value>) {
		return new Dict(items)
	}
}

export class TyDict implements IValue {
	readonly type = 'tyDict' as const
	superType = All.instance

	private constructor(
		public items: Record<string, {optional?: boolean; value: Value}>,
		public rest?: Value
	) {}

	#defaultValue?: Dict
	get defaultValue(): Dict {
		if (!this.#defaultValue) {
			const items = chain(this.items)
				.mapValues(it => (it.optional ? null : it.value.defaultValue))
				.omitBy(isNull)
				.value() as Record<string, Atomic>
			this.#defaultValue = Dict.of(items)
		}

		return this.#defaultValue
	}

	toAst = (): Ast.EDict => {
		const items = mapValues(this.items, ({optional, value}) => ({
			optional,
			value: value.toAst(),
		}))
		return Ast.eDictFrom(items)
	}

	isEqualTo = (v: Value) =>
		v.type === 'tyDict' &&
		hasEqualValues(
			this.items,
			v.items,
			(ti, ei) => !!ti.optional === !!ei.optional && isEqual(ti.value, ei.value)
		)

	isSubtypeOf = isSubtypeDictGeneric.bind(this)

	isType = true

	asTyDictLike: TyDictLike = this

	static of(items: TyDict['items'], rest?: Value) {
		const noOptional = values(items).every(it => !it.optional)
		const noRest = !rest

		if (noOptional && noRest) {
			return Dict.of(mapValues(items, i => i.value))
		} else {
			return new TyDict(items, rest)
		}
	}
}

type TyDictLike = Pick<TyDict, 'items' | 'rest'>

function isSubtypeDictGeneric(this: Dict | TyDict, e: Value): boolean {
	if (this.superType.isSubtypeOf(e)) return true
	if (e.type === 'tyUnion') return e.isSupertypeOf(this)
	if (!('asTyDictLike' in e)) return false

	return isSubtypeDict(this.asTyDictLike, e.asTyDictLike)
}

function isSubtypeDict(s: TyDictLike, t: TyDictLike) {
	const tKeys = keys(t.items)

	for (const k of tKeys) {
		const ti = t.items[k]
		if (!ti.optional) {
			const sv = k in s.items && !s.items[k].optional ? s.items[k].value : false
			if (!sv || !isSubtype(sv, ti.value)) return false
		} else {
			const sv = k in s.items ? s.items[k].value : s.rest
			if (sv && !isSubtype(sv, ti.value)) return false
		}
	}

	if (t.rest) {
		const sKeys = keys(s.items)
		const extraKeys = difference(sKeys, tKeys)
		for (const k of extraKeys) {
			if (!isSubtype(s.items[k].value, t.rest)) return false
		}
		if (s.rest && !isSubtype(s.rest, t.rest)) return false
	}

	return true
}

export class Struct implements IValue {
	readonly type = 'struct' as const

	private constructor(public superType: TyStruct, public items: Value[]) {}

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

export class TyStruct implements IValue, IFnLike {
	readonly type = 'tyStruct' as const
	superType = All.instance

	private constructor(
		public name: string,
		public param: Record<string, Value>
	) {}

	#defaultValue?: Struct
	get defaultValue() {
		if (!this.#defaultValue) {
			const items = values(this.param).map(p => p.defaultValue)
			this.#defaultValue = Struct.of(this, items)
		}
		return this.#defaultValue
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

export class TyUnion implements IValue {
	readonly type = 'tyUnion' as const
	superType = All.instance

	private constructor(public types: UnitableType[]) {
		if (types.length < 2) throw new Error('Too few types to create union type')
	}

	#defaultValue?: Atomic
	get defaultValue(): Atomic {
		return (this.#defaultValue ??= this.types[0].defaultValue)
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
