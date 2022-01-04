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
import {Log, withLog} from '../log'
import {isEqualArray} from '../util/isEqualArray'
import {isEqualDict} from '../util/isEqualDict'
import {isEqualSet} from '../util/isEqualSet'
import {nullishEqual} from '../util/nullishEqual'
import {Writer} from '../util/Writer'
import {unionType} from './TypeOperation'

export type Value = Type | Atomic

type Type =
	| All
	| PrimType
	| EnumType
	| FnType
	| StructType
	| UnionType
	| TypeVar

// Value that can be a default value
type Atomic =
	| Never
	| Unit
	| Prim<any>
	| Num
	| Str
	| Enum
	| Fn
	| Vec
	| Dict
	| Struct

export type UnitableType = Exclude<Value, All | Never>

abstract class BaseValue {
	protected constructor() {
		return this
	}

	abstract readonly type: string
	abstract superType: Value
	abstract defaultValue: Atomic

	abstract isType: boolean

	isEqualTo(val: Value): boolean {
		return this === val
	}

	isSubtypeOf = (ty: Value): boolean => {
		if (ty.type === 'UnionType') return ty.isSupertypeOf(this)
		return this.isEqualTo(ty) || this.superType.isSubtypeOf(ty)
	}

	abstract toAst(): Ast.Node

	print = () => this.toAst().print()
}

export type IFn = (...params: Ast.Arg<any>[]) => Writer<Value, Omit<Log, 'ref'>>

interface IFnType {
	fnType: FnType
}

interface IFnLike extends IFnType {
	fn: IFn
}

export class Unit extends BaseValue {
	readonly type = 'Unit' as const
	superType!: All
	defaultValue = this

	toAst = () => Ast.unit()

	isType = false

	static instance = new Unit()
}

export class All extends BaseValue {
	readonly type = 'All' as const
	superType = this
	defaultValue = Unit.instance

	toAst = () => Ast.all()
	isSubtypeOf = this.isEqualTo
	isType = false

	static instance = new All()
}

Unit.prototype.superType = All.instance

export class Never extends BaseValue {
	readonly type = 'Never' as const
	superType = All.instance
	defaultValue = this

	toAst = () => Ast.never()
	isSubtypeOf = () => true
	isType = true

	static instance = new Never()
}

export class Prim<T = any> extends BaseValue {
	readonly type = 'Prim' as const
	defaultValue = this

	protected constructor(public superType: PrimType, public value: T) {
		super()
	}

	toAst = (): Ast.Node => Ast.value(this)

	isEqualTo = (val: Value) =>
		super.isEqualTo(val) ||
		(this.type === val.type &&
			this.value === val.value &&
			isEqual(this.superType, val.superType))

	isType = false

	static from<T>(ty: PrimType, value: T) {
		return new Prim<T>(ty, value)
	}
}

export class Num extends Prim<number> {
	toAst = () => Ast.num(this.value)

	static of(value: number) {
		return new Num(NumType, value)
	}
}

export class Str extends Prim<string> {
	toAst = () => Ast.str(this.value)

	static of(value: string) {
		return new Str(StrType, value)
	}
}

export class PrimType<T = any> extends BaseValue {
	readonly type = 'PrimType' as const
	superType = All.instance
	defaultValue!: Num | Str | Prim

	private constructor(private readonly name: string) {
		super()
	}

	// TODO: fix this
	toAst = () => Ast.id(this.name)

	isEqualTo = (v: Value) =>
		super.isEqualTo(v) || (this.type === v.type && this.name === v.name)

	of(value: T): Prim<T> {
		return Prim.from(this, value)
	}

	isType = true

	isInstance = (e: Value): e is Prim<T> =>
		e.type === 'Prim' && e.isSubtypeOf(this)

	static ofLiteral(name: string, defaultValue: Prim) {
		const primType = new PrimType(name)
		primType.defaultValue = defaultValue
		defaultValue.superType = primType
		return primType
	}

	static of<T>(name: string, defaultValue: T) {
		const primType = new PrimType<T>(name)
		const d = Prim.from(primType, defaultValue)
		primType.defaultValue = d
		return primType
	}
}

export const NumType = PrimType.ofLiteral('Num', Num.of(0))
export const StrType = PrimType.ofLiteral('Str', Str.of(''))

Num.prototype.superType = NumType
Str.prototype.superType = StrType

export class Enum extends BaseValue {
	readonly type = 'Enum' as const
	superType!: EnumType

	private constructor(public readonly name: string) {
		super()
	}

	defaultValue = this

	// TODO: fix this
	toAst = () => Ast.id(this.name)

	isEqualTo = (v: Value) =>
		super.isEqualTo(v) ||
		(this.type === v.type &&
			this.name === v.name &&
			this.superType.isEqualTo(v.superType))

	isType = false

	static of(name: string) {
		return new Enum(name)
	}
}

export class EnumType extends BaseValue {
	readonly type = 'EnumType' as const
	superType = All.instance

	private constructor(
		public readonly name: string,
		public readonly types: Enum[]
	) {
		super()
	}

	defaultValue = this.types[0]

	// TODO: fix this
	toAst = () => Ast.id(this.name)

	isEqualTo = (v: Value) =>
		super.isEqualTo(v) || (this.type === v.type && this.name === v.name)

	isType = true

	getEnum = (label: string) => {
		const en = this.types.find(t => t.name === label)
		if (!en) throw new Error('Cannot find label')
		return en
	}

	isInstance = (e: Value): e is Enum => e.type === 'Enum' && e.isSubtypeOf(this)

	static of(name: string, labels: string[]) {
		if (labels.length === 0) throw new Error('Zero-length enum')

		const types = labels.map(Enum.of)
		const enumType = new EnumType(name, types)
		enumType.defaultValue = types[0]
		types.forEach(t => (t.superType = enumType))

		return enumType
	}
}

export class TypeVar extends BaseValue {
	readonly type = 'TypeVar' as const
	readonly superType = All.instance

	private constructor(public name: string, public readonly original?: TypeVar) {
		super()
	}

	defaultValue = Unit.instance

	toAst = () => Ast.id(this.name)

	isType = true

	shadow = (): TypeVar => {
		return new TypeVar(this.name, this)
	}

	unshadow = (): TypeVar => {
		return this.original ?? this
	}

	public static of(name: string) {
		return new TypeVar(name)
	}
}

export class Fn extends BaseValue implements IFnLike {
	readonly type = 'Fn' as const

	private constructor(
		public superType: FnType,
		public fn: IFn,
		public body?: Ast.Node
	) {
		super()
	}

	fnType = this.superType

	defaultValue = this

	// TODO: fix this
	toAst = () => {
		return Ast.id('Fn')
	}

	isType = false

	static of(param: Record<string, Value>, out: Value, fn: IFn) {
		return new Fn(FnType.from(param, out), fn)
	}
	static from(ty: FnType, fn: IFn, body?: Ast.Node) {
		return new Fn(ty, fn, body)
	}
}

export class FnType extends BaseValue implements IFnType {
	readonly type = 'FnType' as const
	superType = All.instance

	private constructor(public param: Record<string, Value>, public out: Value) {
		super()
	}

	fnType = this

	get defaultValue(): Fn {
		return Fn.from(this, () => withLog(this.out.defaultValue))
	}

	toAst = (): Ast.FnTypeDef => {
		const param = mapValues(this.param, p => p.toAst())
		const out = this.out.toAst()
		return Ast.fnTypeFrom([], param, out)
	}

	isEqualTo = (v: Value) =>
		super.isEqualTo(v) ||
		(this.type === v.type &&
			isEqual(this.out, v.out) &&
			isEqualArray(values(this.param), values(v.param), isEqual))

	isSubtypeOf = (e: Value): boolean => {
		if (this.superType.isSubtypeOf(e)) return true
		if (e.type === 'UnionType') return e.isSupertypeOf(this)
		if (e.type !== 'FnType') return false

		const tParam = Vec.of(...values(this.param))
		const eParam = Vec.of(...values(e.param))

		return isSubtype(eParam, tParam) && isSubtype(this.out, e.out)
	}

	isType = true

	static of(param: Value | Value[], out: Value) {
		const paramArr = [param].flat()
		const pairs = paramArr.map((p, i) => [i, p] as const)
		const paramDict = Object.fromEntries(pairs)
		return new FnType(paramDict, out)
	}

	static from(param: Record<string, Value>, out: Value) {
		return new FnType(param, out)
	}
}

export class Vec extends BaseValue implements IFnLike {
	readonly type = 'Vec' as const
	readonly superType = All.instance

	private constructor(
		public readonly items: Value[],
		public readonly optionalPos: number,
		public rest?: Value
	) {
		super()
		if (optionalPos < 0 || items.length < optionalPos || optionalPos % 1 !== 0)
			throw new Error('Invalid optionalPos: ' + optionalPos)
	}

	get defaultValue(): Vec {
		return Vec.of(...this.items.map(it => it.defaultValue))
	}

	toAst = (): Ast.Node => {
		const items = this.items.map(it => it.toAst())
		return Ast.vecFrom(items, this.optionalPos, this.rest?.toAst())
	}

	isEqualTo = (v: Value) =>
		super.isEqualTo(v) ||
		(this.type === v.type &&
			isEqualArray(this.items, v.items, isEqual) &&
			this.optionalPos === v.optionalPos &&
			nullishEqual(this.rest, v.rest, isEqual))

	private *asIterator(): Generator<Value, void, boolean> {
		for (const it of this.items) {
			yield it
		}
		if (!this.rest) return
		while (true) {
			const endsWithRest: boolean = yield this.rest
			if (endsWithRest) return
		}
	}

	isSubtypeOf = (v: Value): boolean => {
		if (this.superType.isSubtypeOf(v)) return true
		if (v.type === 'UnionType') return v.isSupertypeOf(this)
		if (v.type !== 'Vec') return false

		if (this.optionalPos < v.optionalPos) return false

		const tIter = this.asIterator()

		let i = 0
		for (const vi of v.items) {
			const ti = tIter.next().value
			if (!ti && v.optionalPos <= i++) break
			if (!ti || !isSubtype(ti, vi)) return false
		}

		if (v.rest) {
			for (let ti; (ti = tIter.next(true).value); ) {
				if (!isSubtype(ti, v.rest)) return false
			}
		}

		return true
	}

	get isType() {
		return (
			!!this.rest ||
			this.optionalPos < this.items.length ||
			this.items.some(isType)
		)
	}

	fnType = FnType.of(NumType, unionType(...this.items))

	fn: IFn = (index: Ast.Arg<Num>) => {
		const ret = this.items[index().value]
		if (ret === undefined) {
			throw new Error('Index out of range')
		}
		return withLog(ret)
	}

	static of(...items: Value[]) {
		return Vec.from(items)
	}

	static from(items: Value[], optionalPos?: number, rest?: Value) {
		return new Vec(items, optionalPos ?? items.length, rest)
	}
}
export class Dict extends BaseValue {
	readonly type = 'Dict' as const
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

	toAst = (): Ast.DictLiteral => {
		const items = mapValues(this.items, it => it.toAst())
		return Ast.dictFrom(items, this.optionalKeys, this.rest?.toAst())
	}

	isEqualTo = (v: Value) =>
		super.isEqualTo(v) ||
		(this.type === v.type &&
			isEqualDict(this.items, v.items, isEqual) &&
			isEqualSet(this.optionalKeys, v.optionalKeys) &&
			nullishEqual(this.rest, v.rest, isEqual))

	isSubtypeOf = (v: Value): boolean => {
		if (this.superType.isSubtypeOf(v)) return true
		if (v.type === 'UnionType') return v.isSupertypeOf(this)
		if (v.type !== 'Dict') return false

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
	readonly type = 'Struct' as const

	private constructor(public superType: StructType, public items: Value[]) {
		super()
	}

	defaultValue = this

	toAst = (): Ast.Node => {
		const items = this.items.map(it => it.toAst())
		const fn = this.superType.toAst()
		return Ast.call(fn, ...items)
	}

	isEqualTo = (v: Value) =>
		super.isEqualTo(v) ||
		(this.type === v.type &&
			isEqual(this.superType, v.superType) &&
			isEqualArray(this.items, v.items, isEqual))

	isType = false

	static of(ctor: StructType, items: Value[]) {
		return new Struct(ctor, items)
	}
}

export class StructType extends BaseValue implements IFnLike {
	readonly type = 'StructType' as const
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

	fnType: FnType = FnType.from(this.param, this)

	fn = (...items: Ast.Arg[]) => withLog(this.of(...items.map(i => i())))

	// TODO: Fix this
	toAst = () => Ast.id(this.name)

	isEqualTo = (v: Value) =>
		super.isEqualTo(v) || (this.type === v.type && this.name === v.name)

	isType = true

	of(...items: Value[]) {
		return Struct.of(this, items)
	}

	static of(name: string, param: Record<string, Value>) {
		return new StructType(name, param)
	}
}

export class UnionType extends BaseValue {
	readonly type = 'UnionType' as const
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
		return Ast.call(Ast.id('|'), ...types)
	}

	isEqualTo = (v: Value): boolean =>
		super.isEqualTo(v) ||
		(this.type === v.type &&
			differenceWith(this.types, v.types, isEqual).length === 0)

	isSubtypeOf = (e: Value): boolean => {
		if (this.superType.isSubtypeOf(e)) return true

		const types: Value[] = e.type === 'UnionType' ? e.types : [e]
		return this.types.every(s => types.some(s.isSubtypeOf))
	}

	isType = true

	isSupertypeOf = (s: Pick<Value, 'isSubtypeOf'>) =>
		this.types.some(s.isSubtypeOf)

	static fromTypesUnsafe(types: UnitableType[]) {
		return new UnionType(types)
	}

	static of = unionType
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
