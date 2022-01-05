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
import {getTypeVars} from '../ast/unify'
import {Log, withLog} from '../log'
import {isEqualArray} from '../util/isEqualArray'
import {isEqualDict} from '../util/isEqualDict'
import {isEqualSet} from '../util/isEqualSet'
import {nullishEqual} from '../util/nullishEqual'
import {Writer} from '../util/Writer'
import {unionType} from './TypeOperation'
import {createFoldFn} from './walk'

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

	abstract isEqualTo(value: Value): boolean

	isSubtypeOf = (ty: Value): boolean => {
		if (ty.type === 'UnionType') return ty.isSupertypeOf(this)
		return this.isEqualTo(ty) || this.superType.isSubtypeOf(ty)
	}

	get isType(): boolean {
		return isType(this as Value)
	}

	abstract toAst(): Ast.Node

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	withDefault = (defaultValue: Atomic): Value => this as Value

	isInstance = (value: Value): boolean => {
		return !value.isType && value.isSubtypeOf(this as any)
	}

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

	isEqualTo = (value: Value) => this.type === value.type

	toAst = () => Ast.call()

	static instance = new Unit()
}

export class All extends BaseValue {
	readonly type = 'All' as const

	superType = this

	defaultValue: Atomic = Unit.instance

	toAst = () => Ast.all()

	isEqualTo = (value: Value) => this.type === value.type

	isSubtypeOf = this.isEqualTo

	withDefault = (defaultValue: Atomic) => {
		const all = new All()
		all.defaultValue = defaultValue
		return all
	}

	static instance = new All()
}

Unit.prototype.superType = All.instance

export class Never extends BaseValue {
	readonly type = 'Never' as const

	superType = All.instance

	defaultValue = this

	toAst = () => Ast.never()

	isEqualTo = (value: Value) => this.type === value.type

	isSubtypeOf = () => true

	static instance = new Never()
}

export class Prim<T = any> extends BaseValue {
	readonly type = 'Prim' as const
	defaultValue = this

	protected constructor(public superType: PrimType, public value: T) {
		super()
	}

	toAst = (): Ast.Node => Ast.value(this)

	isEqualTo = (value: Value) =>
		this.type === value.type &&
		this.value === value.value &&
		isEqual(this.superType, value.superType)

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

	isEqualTo = (value: Value) =>
		this.type === value.type && this.name === value.name

	of(value: T): Prim<T> {
		return Prim.from(this, value)
	}

	withDefault = (defaultValue: Atomic) => {
		if (!this.isInstance(defaultValue)) throw new Error('Invalid default value')

		const primType = new PrimType(this.name)
		primType.defaultValue = defaultValue

		return primType
	}

	isInstance = (value: Value): value is Prim<T> =>
		value.type === 'Prim' && value.isSubtypeOf(this)

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

	isEqualTo = (value: Value) =>
		this.type === value.type &&
		this.name === value.name &&
		this.superType.isEqualTo(value.superType)

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

	isEqualTo = (value: Value) =>
		this.type === value.type && this.name === value.name

	getEnum = (label: string) => {
		const en = this.types.find(t => t.name === label)
		if (!en) throw new Error('Cannot find label')
		return en
	}

	isInstance = (value: Value): value is Enum =>
		value.type === 'Enum' && value.isSubtypeOf(this)

	withDefault = (defaultValue: Atomic) => {
		if (!this.isInstance(defaultValue)) throw new Error('Invalid default value')

		const enumType = new EnumType(this.name, this.types)
		enumType.defaultValue = defaultValue

		return enumType
	}

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

	isEqualTo = (value: Value) => this === value

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

	isEqualTo = (value: Value) => this === value

	toAst = (): Ast.Node => {
		if (!this.body) {
			return Ast.value(this)
		}

		const {fnType} = this

		const typeVars = [...getTypeVars(fnType)].map(tv => tv.name)
		const param = mapValues(fnType.param, p => p.toAst())
		const rest = fnType.rest
			? {name: fnType.rest.name ?? '', node: fnType.rest.value.toAst()}
			: undefined

		return Ast.fn({
			typeVars,
			param,
			optionalPos: fnType.optionalPos,
			rest,
			body: this.body.clone(),
		})
	}

	static of(param: Record<string, Value>, out: Value, fn: IFn) {
		return new Fn(FnType.of({param, out}), fn)
	}
	static from(ty: FnType, fn: IFn, body?: Ast.Node) {
		return new Fn(ty, fn, body)
	}
}

export class FnType extends BaseValue implements IFnType {
	readonly type = 'FnType' as const
	superType = All.instance

	private constructor(
		public readonly param: Record<string, Value>,
		public readonly optionalPos: number,
		public readonly rest: {name?: string; value: Value} | undefined,
		public readonly out: Value
	) {
		super()
		if (
			optionalPos < 0 ||
			values(param).length < optionalPos ||
			optionalPos % 1 !== 0
		) {
			throw new Error('Invalid optionalPos: ' + optionalPos)
		}
	}

	fnType = this

	#defaultValue?: Fn
	get defaultValue() {
		if (!this.#defaultValue) {
			this.#defaultValue = Fn.from(this, () => withLog(this.out.defaultValue))
		}
		return this.#defaultValue
	}

	toAst = (): Ast.FnTypeDef => {
		const rest = this.rest
			? {name: this.rest.name, node: this.rest.value.toAst()}
			: undefined

		return Ast.fnType({
			param: mapValues(this.param, p => p.toAst()),
			optionalPos: this.optionalPos,
			rest,
			out: this.out.toAst(),
		})
	}

	isEqualTo = (value: Value) =>
		this.type === value.type &&
		isEqualArray(values(this.param), values(value.param), isEqual) &&
		this.optionalPos === value.optionalPos &&
		nullishEqual(
			this.rest,
			value.rest,
			(a, b) => a.name === b.name && isEqual(a.value, b.value)
		) &&
		isEqual(this.out, value.out)

	isSubtypeOf = (value: Value): boolean => {
		if (this.superType.isSubtypeOf(value)) return true
		if (value.type === 'UnionType') return value.isSupertypeOf(this)
		if (value.type !== 'FnType') return false

		const tParam = Vec.of(
			values(this.param),
			this.optionalPos,
			this.rest?.value
		)
		const eParam = Vec.of(
			values(value.param),
			value.optionalPos,
			value.rest?.value
		)

		return isSubtype(eParam, tParam) && isSubtype(this.out, value.out)
	}

	isInstance!: (value: Value) => value is Fn

	withDefault = (defaultValue: Atomic) => {
		if (!this.isInstance(defaultValue)) throw new Error('Invalid default value')

		const fnType = new FnType(this.param, this.optionalPos, this.rest, this.out)
		fnType.#defaultValue = defaultValue

		return fnType
	}

	static of({
		param = {},
		optionalPos,
		rest = undefined,
		out,
	}: {
		param?: Record<string, Value>
		optionalPos?: number
		rest?: FnType['rest']
		out: Value
	}) {
		const _optionalPos = optionalPos ?? values(param).length
		return new FnType(param, _optionalPos, rest, out)
	}
}

export class Vec<TItems extends Value[] = Value[]>
	extends BaseValue
	implements IFnLike
{
	readonly type = 'Vec' as const
	readonly superType = All.instance

	private constructor(
		public readonly items: TItems,
		public readonly optionalPos: number,
		public rest?: Value
	) {
		super()
		if (optionalPos < 0 || items.length < optionalPos || optionalPos % 1 !== 0)
			throw new Error('Invalid optionalPos: ' + optionalPos)
	}

	#defaultValue?: Vec
	get defaultValue(): Vec {
		if (!this.#defaultValue) {
			const items = this.items
				.slice(0, this.optionalPos)
				.map(it => it.defaultValue)

			this.#defaultValue = Vec.of(items)
		}

		return this.#defaultValue
	}

	toAst = (): Ast.Node => {
		const items = this.items.map(it => it.toAst())
		return Ast.vec(items, this.optionalPos, this.rest?.toAst())
	}

	isEqualTo = (value: Value) =>
		this.type === value.type &&
		isEqualArray(this.items, value.items, isEqual) &&
		this.optionalPos === value.optionalPos &&
		nullishEqual(this.rest, value.rest, isEqual)

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

	isSubtypeOf = (value: Value): boolean => {
		if (this.superType.isSubtypeOf(value)) return true
		if (value.type === 'UnionType') return value.isSupertypeOf(this)
		if (value.type !== 'Vec') return false

		if (this.optionalPos < value.optionalPos) return false

		const tIter = this.asIterator()

		let i = 0
		for (const vi of value.items) {
			const ti = tIter.next().value
			if (!ti && value.optionalPos <= i++) break
			if (!ti || !isSubtype(ti, vi)) return false
		}

		if (value.rest) {
			for (let ti; (ti = tIter.next(true).value); ) {
				if (!isSubtype(ti, value.rest)) return false
			}
		}

		return true
	}

	get isType(): boolean {
		return (
			!!this.rest ||
			this.optionalPos < this.items.length ||
			this.items.some(isType)
		)
	}

	fnType = FnType.of({param: {index: NumType}, out: unionType(...this.items)})

	fn: IFn = (index: Ast.Arg<Num>) => {
		const ret = this.items[index().value]
		if (ret === undefined) {
			throw new Error('Index out of range')
		}
		return withLog(ret)
	}

	isInstance!: (value: Value) => value is Vec

	withDefault = (defaultValue: Atomic) => {
		if (!this.isInstance(defaultValue)) throw new Error('Invalid default value')

		const vecType = Vec.of(this.items, this.optionalPos, this.rest)
		vecType.#defaultValue = defaultValue

		return vecType
	}

	static of<TItems extends Value[]>(
		items: TItems = [] as any,
		optionalPos?: number,
		rest?: Value
	) {
		return new Vec(items, optionalPos ?? items.length, rest)
	}
}

export class Dict<
	TItems extends Record<string, Value> = Record<string, Value>
> extends BaseValue {
	readonly type = 'Dict' as const
	superType = All.instance

	private constructor(
		public readonly items: TItems,
		public readonly optionalKeys: Set<string>,
		public readonly rest?: Value
	) {
		super()
	}

	#isRequredKey(key: string) {
		return key in this.items && !this.optionalKeys.has(key)
	}

	#defaultValue?: Dict
	get defaultValue(): Dict {
		if (!this.#defaultValue) {
			const itemEntries = entries(this.items)
				.filter(([k]) => this.#isRequredKey(k))
				.map(([k, v]) => [k, v.defaultValue])

			this.#defaultValue = Dict.of(fromPairs(itemEntries))
		}

		return this.#defaultValue
	}

	toAst = (): Ast.DictLiteral => {
		const items = mapValues(this.items, it => it.toAst())
		return Ast.dict(items, this.optionalKeys, this.rest?.toAst())
	}

	isEqualTo = (value: Value) =>
		this.type === value.type &&
		isEqualDict(this.items, value.items, isEqual) &&
		isEqualSet(this.optionalKeys, value.optionalKeys) &&
		nullishEqual(this.rest, value.rest, isEqual)

	isSubtypeOf = (value: Value): boolean => {
		if (this.superType.isSubtypeOf(value)) return true
		if (value.type === 'UnionType') return value.isSupertypeOf(this)
		if (value.type !== 'Dict') return false

		const tKeys = keys(value.items)

		for (const k of tKeys) {
			const vi = value.items[k]
			if (value.#isRequredKey(k)) {
				const sv = this.#isRequredKey(k) ? this.items[k] : false
				if (!sv || !isSubtype(sv, vi)) return false
			} else {
				const sv = k in this.items ? this.items[k] : this.rest
				if (sv && !isSubtype(sv, vi)) return false
			}
		}

		if (value.rest) {
			const sKeys = keys(this.items)
			const extraKeys = difference(sKeys, tKeys)
			for (const k of extraKeys) {
				if (!isSubtype(this.items[k], value.rest)) return false
			}
			if (this.rest && !isSubtype(this.rest, value.rest)) return false
		}

		return true
	}

	get isType(): boolean {
		return (
			!!this.rest ||
			this.optionalKeys.size > 0 ||
			values(this.items).some(isType)
		)
	}

	isInstance!: (value: Value) => value is Dict

	withDefault = (defaultValue: Atomic) => {
		if (!this.isType) return this

		if (!this.isInstance(defaultValue)) throw new Error('Invalid default value')

		const dictType = Dict.of(this.items, this.optionalKeys, this.rest)
		dictType.#defaultValue = defaultValue

		return dictType
	}

	static of<TItems extends Record<string, Value>>(
		items: TItems,
		optionalKeys: Iterable<string> = [],
		rest?: Value
	) {
		return new Dict<TItems>(items, new Set(optionalKeys), rest)
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

	isEqualTo = (value: Value) =>
		this.type === value.type &&
		isEqual(this.superType, value.superType) &&
		isEqualArray(this.items, value.items, isEqual)

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

	#defaultValue?: Struct
	get defaultValue(): Struct {
		if (!this.#defaultValue) {
			const items = values(this.param).map(p => p.defaultValue)
			this.#defaultValue = Struct.of(this, items)
		}

		return this.#defaultValue
	}

	fnType: FnType = FnType.of({param: this.param, out: this})

	fn = (...items: Ast.Arg[]) => withLog(this.of(...items.map(i => i())))

	// TODO: Fix this
	toAst = () => Ast.id(this.name)

	isEqualTo = (value: Value) =>
		this.type === value.type && this.name === value.name

	of(...items: Value[]) {
		return Struct.of(this, items)
	}

	isInstance!: (value: Value) => value is Struct

	withDefault = (defaultValue: Atomic): Value => {
		if (!this.isInstance(defaultValue)) throw new Error('Invalid default value')

		const structType = StructType.of(this.name, this.param)
		structType.#defaultValue = defaultValue

		return structType
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

	#defaultValue!: Atomic
	get defaultValue(): Atomic {
		return (this.#defaultValue ??= this.types[0].defaultValue)
	}

	toAst = (): Ast.Call => {
		const types = this.types.map(ty => ty.toAst())
		return Ast.call(Ast.id('|'), ...types)
	}

	isEqualTo = (value: Value): boolean =>
		this.type === value.type &&
		differenceWith(this.types, value.types, isEqual).length === 0

	isSubtypeOf = (type: Value): boolean => {
		if (this.superType.isSubtypeOf(type)) return true

		const types: Value[] = type.type === 'UnionType' ? type.types : [type]
		return this.types.every(s => types.some(s.isSubtypeOf))
	}

	isSupertypeOf = (s: Pick<Value, 'isSubtypeOf'>) =>
		this.types.some(s.isSubtypeOf)

	withDefault = (defaultValue: Atomic) => {
		if (!this.isInstance(defaultValue)) throw new Error('Invalid default value')

		const unionType = new UnionType(this.types)
		unionType.#defaultValue = defaultValue

		return unionType
	}

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

const or = (...xs: boolean[]) => xs.reduce(x => x)

const isType = createFoldFn(
	{
		TypeVar: () => true,
		Never: () => true,
		PrimType: () => true,
		EnumType: () => true,
		FnType: () => true,
		StructType: () => true,
		UnionType: () => true,

		Fn: () => false,

		Vec(v, fold, c) {
			return fold(...v.items.map(c), v.optionalPos < v.items.length, !!v.rest)
		},
		Dict(v, fold, c) {
			return fold(...values(v.items).map(c), v.optionalKeys.size > 0, !!v.rest)
		},
	},
	false,
	or
)
