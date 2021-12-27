import {
	chain,
	difference,
	differenceWith,
	entries,
	forOwn,
	fromPairs,
	isNull,
	keys,
	mapValues,
	values,
} from 'lodash'

import {hasEqualValues} from '../utils/hasEqualValues'
import {isEqualArray} from '../utils/isEqualArray'
import {nullishEqual} from '../utils/nullishEqual'
import {union} from '../utils/SetOperation'
import {Writer} from '../utils/Writer'
import {zip} from '../utils/zip'
import {Env} from './env'
import {Log, WithLog, withLog} from './log'
import {tyUnion} from './TypeOperation'
import {getTyVars, RangedUnifier, shadowTyVars, unshadowTyVars} from './unify'

export type Exp = ExpLiteral | ExpComplex
export type ExpLiteral = Sym | Obj | LUnit | LAll | LBottom | LNum | LStr

export type ExpComplex = Call | Scope | EFn | ETyFn | EVec | EDict

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

interface IExp {
	readonly type: string
	print(): string
	parent: ExpComplex | null
	eval(env?: Env): WithLog
	infer(env?: Env): Value
	isSameTo(exp: Exp): boolean
}

interface IValue {
	readonly type: string
	defaultValue: Atomic

	isType: boolean
	isEqualTo(e: Value): boolean
	isSubtypeOf(e: Value): boolean
	toAst(): Exp
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

export class Sym implements IExp {
	readonly type = 'sym' as const
	parent: ExpComplex | null = null

	private constructor(public name: string) {}

	#resolve2(
		ref: ExpComplex | null,
		env?: Env
	): Writer<{node: Exp; mode?: 'param' | 'arg' | 'tyVar'}, Log> {
		if (!ref) {
			// If no parent and still couldn't resolve the symbol,
			// assume there's no bound expression for it.
			const log: Log = {
				level: 'error',
				ref: this,
				reason: 'Variable not bound: ' + this.name,
			}

			return Writer.of({node: LUnit.of()}, log)
		}

		if (ref.type === 'scope') {
			if (this.name in ref.vars) {
				return Writer.of({node: ref.vars[this.name]})
			}
		}
		if (ref.type === 'eFn') {
			if (env) {
				// Situation A. In a context of function appliction
				const node = env.get(this.name)
				if (node) {
					return Writer.of({node, mode: 'arg'})
				}
				// If no corresponding arg has found for the eFn, pop the env.
				env = env.pop()
			} else {
				// Situation B. While normal evaluation
				if (this.name in ref.param) {
					return Writer.of({node: ref.param[this.name], mode: 'param'})
				}
			}
		}
		// Resolve tyVars
		if (ref.type === 'eFn' || ref.type === 'eTyFn') {
			if (this.name in ref.tyVars) {
				return Writer.of({node: ref.tyVars[this.name], mode: 'tyVar'})
			}
		}

		// Resolve with parent node recursively
		return this.#resolve2(ref.parent, env)
	}

	eval = (env?: Env): WithLog => {
		return this.#resolve2(this.parent, env).bind(({node, mode}) => {
			const value = node.eval(env)

			return mode === 'param'
				? withLog(value.result.defaultValue, ...value.log)
				: value
		})
	}

	infer(env?: Env): Value {
		const {node, mode} = this.#resolve2(this.parent, env).result

		/**
		 * (=> [x:(+ 1 2)] x) のようなケースでは、 (+ 1 2) は評価しないといけない
		 */
		if (mode === 'param' || mode === 'arg' || mode === 'tyVar') {
			return node.eval(env).result
		} else {
			return node.infer(env)
		}
	}

	print = () => this.name

	isSameTo = (exp: Exp) => exp.type === 'sym' && this.name === exp.name

	static of(name: string) {
		return new Sym(name)
	}
}

export class Obj<V extends Value = Value> implements IExp {
	readonly type = 'obj' as const
	parent: ExpComplex | null = null

	private constructor(public value: V) {}

	eval = () => withLog(this.value)
	infer = () => (this.value.isType ? All.instance : this.value)

	print = () => '<object>'

	isSameTo = (exp: Exp) => this.type === exp.type && this.value === exp.value

	static of<V extends Value = Value>(value: V) {
		return new Obj(value)
	}
}

export class LUnit implements IExp {
	type = 'lUnit' as const
	parent: ExpComplex | null = null

	private constructor() {
		return this
	}

	eval = () => withLog(Unit.instance)
	infer = () => Unit.instance
	print = () => '()'
	isSameTo = (exp: Exp) => this.type === exp.type

	static of() {
		return new LUnit()
	}
}

export class Unit implements IValue {
	readonly type = 'unit' as const
	superType!: All
	defaultValue = this

	toAst = () => LUnit.of()

	isEqualTo = (v: Value) => v.type === 'unit'
	isSubtypeOf = isSubtypeOfGeneric.bind(this)
	isType = false

	static instance = new Unit()
}

export class LAll implements IExp {
	type = 'lAll' as const
	parent: ExpComplex | null = null

	private constructor() {
		return this
	}

	eval = () => withLog(All.instance)
	infer = () => All.instance
	print = () => '_'
	isSameTo = (exp: Exp) => this.type === exp.type

	static of() {
		return new LAll()
	}
}

export class All implements IValue {
	readonly type = 'all' as const
	defaultValue = Unit.instance

	private constructor() {
		return this
	}

	toAst = () => LAll.of()

	isEqualTo = (v: Value) => v.type === 'all'
	isSubtypeOf = this.isEqualTo
	isType = false

	static instance = new All()
}

Unit.prototype.superType = All.instance

export class LBottom implements IExp {
	type = 'lBottom' as const
	parent: ExpComplex | null = null

	private constructor() {
		return this
	}

	eval = () => withLog(Bottom.instance)
	infer = () => All.instance
	print = () => '_|_'
	isSameTo = (exp: Exp) => this.type === exp.type

	static of() {
		return new LBottom()
	}
}

export class Bottom implements IValue {
	readonly type = 'bottom' as const
	defaultValue = this

	private constructor() {
		return this
	}

	toAst = () => LBottom.of()

	isEqualTo = (v: Value) => v.type === 'bottom'
	isSubtypeOf = () => true
	isType = true

	static instance = new Bottom()
}

export class Prim<T = any> implements IValue {
	readonly type = 'prim' as const
	defaultValue = this

	protected constructor(public superType: TyPrim, public value: T) {}

	toAst = (): Exp => Obj.of(this)

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

export class LNum implements IExp {
	type = 'lNum' as const
	parent: ExpComplex | null = null

	private constructor(public value: number) {}

	eval = () => withLog(Num.of(this.value))
	infer = () => Num.of(this.value)
	print = () => this.value.toString()
	isSameTo = (exp: Exp) => this.type === exp.type && this.value === exp.value

	static of(value: number) {
		return new LNum(value)
	}
}

export class Num extends Prim<number> {
	print = () => this.value.toString()

	static of(value: number) {
		return new Num(tyNum, value)
	}
}

export class LStr implements IExp {
	type = 'lStr' as const
	parent: ExpComplex | null = null

	private constructor(public value: string) {}

	eval = () => withLog(Str.of(this.value))
	infer = () => Str.of(this.value)
	print = () => '"' + this.value + '"'
	isSameTo = (exp: Exp) => this.type === exp.type && this.value === exp.value

	static of(value: string) {
		return new LStr(value)
	}
}

export class Str extends Prim<string> {
	print = () => '"' + this.value + '"'

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
	toAst = () => Sym.of(this.name)

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
	toAst = () => Sym.of(this.name)

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
	toAst = () => Sym.of(this.name)

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

	toAst = () => Sym.of(this.name)

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

export class EFn implements IExp {
	readonly type = 'eFn' as const
	parent: ExpComplex | null = null

	readonly tyVars: Record<string, Obj<TyVar>>

	private constructor(
		tyVars: string[],
		public param: Record<string, Exp>,
		public body: Exp
	) {
		this.tyVars = fromPairs(tyVars.map(name => [name, Obj.of(TyVar.of(name))]))
	}

	eval = (env?: Env): WithLog => {
		const names = keys(this.param)

		const fn: IFn = (...args: Value[]) => {
			const objs = args.map(Obj.of)
			const arg = fromPairs(zip(names, objs))
			const innerEnv = env ? env.push(arg) : Env.from(arg)
			return this.body.eval(innerEnv)
		}

		const ty = this.infer(env)

		const fnVal = Fn.from(ty, fn, this.body)
		fnVal.env = env

		return withLog(fnVal)
	}

	infer = (env?: Env): TyFn => {
		const param = Writer.mapValues(this.param, p => p.eval(env)).result

		const innerEnv = env ? env.push(this.param) : Env.from(this.param)

		const out = this.body.infer(innerEnv)

		return TyFn.from(param, out)
	}

	print(): string {
		const tyVars = printTyVars(this.tyVars)
		const params = entries(this.param).map(([k, v]) => k + ':' + v.print())
		const param = '[' + params.join(' ') + ']'
		const body = this.body.print()

		return `(=> ${tyVars}${param} ${body})`
	}

	isSameTo = (exp: Exp) =>
		exp.type === 'eFn' &&
		hasEqualValues(this.tyVars, exp.tyVars, isSame) &&
		hasEqualValues(this.param, exp.param, isSame) &&
		isSame(this.body, exp.body)

	static of(tyVars: string[], param: EFn['param'], body: Exp) {
		const fn = new EFn(tyVars, param, body)
		values(param).forEach(p => setParent(p, fn))
		setParent(body, fn)
		return fn
	}
}

export class Fn implements IValue, IFnLike {
	readonly type = 'fn' as const

	env?: Env
	isTypeCtor = false

	private constructor(
		public superType: TyFn,
		public fn: IFn,
		public body?: Exp
	) {}

	tyFn = this.superType

	defaultValue = this

	// TODO: fix this
	toAst = () => {
		return Sym.of('fn')
	}

	isSameTo = () => false
	isEqualTo = () => false
	isSubtypeOf = isSubtypeOfGeneric.bind(this)
	isType = false

	static of(param: Record<string, Value>, out: Value, fn: IFn) {
		return new Fn(TyFn.from(param, out), fn)
	}
	static from(ty: TyFn, fn: IFn, body?: Exp) {
		return new Fn(ty, fn, body)
	}
}

export class ETyFn implements IExp {
	readonly type = 'eTyFn' as const
	parent: ExpComplex | null = null

	tyVars: Record<string, Obj<TyVar>>

	private constructor(
		tyVars: string[],
		public param: Record<string, Exp>,
		public out: Exp
	) {
		this.tyVars = fromPairs(tyVars.map(name => [name, Obj.of(TyVar.of(name))]))
	}

	eval = (env?: Env): WithLog => {
		const [params, lp] = Writer.mapValues(this.param, p => p.eval(env)).asTuple
		const [out, lo] = this.out.eval(env).asTuple
		return withLog(TyFn.from(params, out), ...lp, ...lo)
	}

	infer = () => All.instance

	print = (): string => {
		const tyVars = printTyVars(this.tyVars)
		const param = entries(this.param).map(printNamedNode).join(' ')
		const out = this.out.print()
		return `(-> ${tyVars}[${param}] ${out})`
	}

	isSameTo = (exp: Exp): boolean =>
		exp.type === 'eTyFn' &&
		hasEqualValues(this.tyVars, exp.tyVars, isSame) &&
		hasEqualValues(this.param, exp.param, isSame) &&
		isSame(this.out, this.out)

	static of(tyVars: string[], param: Exp | Exp[], out: Exp) {
		const paramArr = [param].flat()
		const pairs = paramArr.map((p, i) => [i, p] as const)
		const paramDict = Object.fromEntries(pairs)

		const tyFn = new ETyFn(tyVars, paramDict, out)

		paramArr.forEach(p => setParent(p, tyFn))
		setParent(out, tyFn)

		return tyFn
	}

	static from(tyVars: string[], param: Record<string, Exp>, out: Exp) {
		const tyFn = new ETyFn(tyVars, param, out)
		forOwn(param, p => setParent(p, tyFn))
		setParent(out, tyFn)
		return tyFn
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

	toAst = (): Exp => {
		const param = mapValues(this.param, p => p.toAst())
		const out = this.out.toAst()
		return ETyFn.from([], param, out)
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

function printTyVars(tyVars: Record<string, Obj<TyVar>>): string {
	const es = keys(tyVars)
	if (es.length === 0) return ''
	return '<' + es.join(' ') + '> '
}

function printNamedNode([name, ty]: [string, Exp]) {
	if (/^[0-9]+$/.test(name)) return ty.print()
	return name + ':' + ty.print()
}

export class EVec implements IExp {
	readonly type = 'eVec' as const
	parent: ExpComplex | null = null

	private constructor(public items: Exp[], public rest: Exp | null = null) {}

	get length() {
		return this.items.length
	}

	eval = (env?: Env): WithLog => {
		const [items, li] = Writer.map(this.items, i => i.eval(env)).asTuple
		if (this.rest) {
			const [rest, lr] = this.rest.eval(env).asTuple
			return withLog(TyVec.of(items, rest), ...li, ...lr)
		} else {
			return withLog(Vec.of(...items), ...li)
		}
	}

	infer(env?: Env): Value {
		if (this.rest) return All.instance
		const items = this.items.map(it => it.infer(env))
		return Vec.of(...items)
	}

	print(): string {
		const items = this.items.map(it => it.print())
		const rest = this.rest ? ['...' + this.rest.print()] : []
		return '[' + [...items, ...rest].join(' ') + ']'
	}

	isSameTo = (exp: Exp): boolean =>
		exp.type === 'eVec' &&
		isEqualArray(this.items, exp.items, isSame) &&
		nullishEqual(this.rest, this.rest, isSame)

	static of(...items: Exp[]) {
		const vec = new EVec(items)
		items.forEach(it => setParent(it, vec))
		return vec
	}

	static from(items: Exp[], rest: Exp | null = null) {
		const vec = new EVec(items, rest)
		items.forEach(it => setParent(it, vec))
		if (rest) setParent(rest, vec)
		return vec
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

	toAst = (): Exp => {
		const items = this.items.map(it => it.toAst())
		return EVec.of(...items)
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

	toAst = (): Exp => {
		const items = this.items.map(it => it.toAst())
		const rest = this.rest.toAst()
		return EVec.from(items, rest)
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

export class EDict implements IExp {
	readonly type = 'eDict' as const
	parent: ExpComplex | null = null

	private constructor(
		public items: Record<string, {optional?: boolean; value: Exp}>,
		public rest?: Exp
	) {}

	infer = (): Value => {
		if (this.rest) return All.instance
		const items: Dict['items'] = {}
		for (const [key, {optional, value}] of entries(this.items)) {
			if (optional) return All.instance
			items[key] = value.infer()
		}
		return Dict.of(items)
	}

	eval = (env?: Env): WithLog => {
		const [items, li] = Writer.mapValues(this.items, ({optional, value}) =>
			value.eval(env).fmap(value => ({optional, value}))
		).asTuple
		const [rest, lr] = this.rest ? this.rest.eval(env).asTuple : [undefined, []]

		return withLog(TyDict.of(items, rest), ...li, ...lr)
	}

	print(): string {
		const items = entries(this.items).map(
			([k, v]) => k + (v.optional ? '?' : '') + ': ' + v.value.print()
		)
		const rest = this.rest ? ['...' + this.rest.print()] : []
		return '{' + [...items, ...rest].join(' ') + '}'
	}

	isSameTo = (exp: Exp): boolean =>
		exp.type === 'eDict' &&
		hasEqualValues(
			this.items,
			exp.items,
			(t, e) => !!t.optional === !!e.optional && isSame(t.value, e.value)
		)

	static of(items: Record<string, Exp>) {
		const its = mapValues(items, value => ({value}))
		return EDict.from(its)
	}

	static from(
		items: Record<string, {optional?: boolean; value: Exp}>,
		rest?: Exp
	) {
		const dict = new EDict(items, rest)
		values(items).forEach(it => setParent(it.value, dict))
		if (rest) setParent(rest, dict)
		return dict
	}
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

	toAst = (): Exp => {
		const items = mapValues(this.items, it => ({
			optional: false,
			value: it.toAst(),
		}))
		return EDict.from(items)
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

	toAst = (): Exp => {
		const items = mapValues(this.items, ({optional, value}) => ({
			optional,
			value: value.toAst(),
		}))
		return EDict.from(items)
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

	toAst = (): Exp => {
		const items = this.items.map(it => it.toAst())
		const fn = this.superType.toAst()
		return Call.of(fn, ...items)
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
	toAst = () => Sym.of(this.name)

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

	toAst = (): Exp => {
		const types = this.types.map(ty => ty.toAst())
		return Call.of(Sym.of('|'), ...types)
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

export class Call implements IExp {
	readonly type = 'call' as const
	parent: ExpComplex | null = null

	private constructor(public fn: Exp, public args: Exp[]) {}

	#unifyFn(env?: Env): [RangedUnifier, Value[]] {
		const ty = this.fn.infer(env)

		if (!('tyFn' in ty)) return [RangedUnifier.empty(), []]

		const tyFn = ty.tyFn

		const params = values(tyFn.param)

		const shadowedArgs = this.args
			.slice(0, params.length)
			.map(a => shadowTyVars(a.infer(env)))

		const subst = RangedUnifier.unify([
			Vec.of(...params),
			'>=',
			Vec.of(...shadowedArgs),
		])

		return [subst, shadowedArgs]
	}

	eval = (env?: Env): WithLog => {
		// Evaluate the function itself at first
		const [fn, fnLog] = this.fn.eval(env).asTuple

		// Check if it's not a function
		if (!('fn' in fn)) {
			return Writer.of(fn, ...fnLog, {
				level: 'warn',
				ref: this,
				reason: 'Not a function',
			})
		}

		// Start function application
		const logs: Log[] = []
		const names = keys(fn.tyFn.param)
		const params = values(fn.tyFn.param)

		// Length-check of arguments
		const lenArgs = this.args.length
		const lenParams = params.length

		if (lenArgs !== lenParams) {
			logs.push({
				level: 'info',
				ref: this,
				reason: `Expected ${lenParams} arguments, but got ${lenArgs}`,
			})
		}

		// Unify tyFn and args
		const [subst, shadowedArgs] = this.#unifyFn(env)
		const unifiedParams = params.map(subst.substitute)
		const unifiedArgs = shadowedArgs.map(subst.substitute)

		// Check types of args and cast them to default if necessary
		const args = unifiedParams.map((pTy, i) => {
			const aTy = unifiedArgs[i] ?? Unit.instance
			const name = names[i]

			if (!isSubtype(aTy, pTy)) {
				if (aTy.type !== 'unit') {
					const aTyUnshadowed = unshadowTyVars(aTy)
					logs.push({
						level: 'error',
						ref: this,
						reason:
							`Argument '${name}' expects type: ${pTy.toAst().print()}, ` +
							`but got: '${aTyUnshadowed.toAst().print()}''`,
					})
				}
				return pTy.defaultValue
			}

			const [aVal, aLog] = this.args[i].eval(env).asTuple

			logs.push(...aLog)

			return aVal
		})

		// Call the function
		let result: Value, callLog: Log[]
		if ('body' in fn && fn.body) {
			const arg: Record<string, Value> = fromPairs(zip(names, args))

			const tyVars = union(...params.map(getTyVars))

			for (const tv of tyVars) {
				arg[tv.name] = unshadowTyVars(subst.substitute(tv))
			}

			const objs = mapValues(arg, Obj.of)

			const innerEnv = fn.env ? fn.env.push(objs) : Env.from(objs)

			;[result, callLog] = fn.body.eval(innerEnv).asTuple
		} else {
			;[result, callLog] = fn.fn(...args).asTuple
		}

		// Set this as 'ref'
		const callLogWithRef = callLog.map(log => ({...log, ref: this}))

		return withLog(result, ...fnLog, ...logs, ...callLogWithRef)
	}

	infer = (env?: Env): Value => {
		const ty = this.fn.infer(env)
		if (!('tyFn' in ty)) return ty

		if (ty.type === 'fn' && ty.isTypeCtor) {
			return this.eval(env).result
		}

		const [subst] = this.#unifyFn(env)
		return unshadowTyVars(subst.substitute(ty.tyFn.out))
	}

	print(): string {
		const fn = this.fn.print()
		const args = this.args.map(a => a.print())

		return '(' + [fn, ...args].join(' ') + ')'
	}

	isSameTo = (exp: Exp) =>
		exp.type === 'call' && isEqualArray(this.args, exp.args, isSame)

	static of(fn: Exp, ...args: Exp[]) {
		const app = new Call(fn, args)
		setParent(fn, app)
		args.forEach(a => setParent(a, app))
		return app
	}
}

export class Scope implements IExp {
	readonly type = 'scope' as const
	parent: ExpComplex | null = null

	private constructor(
		public vars: Record<string, Exp>,
		public out: Exp | null = null
	) {}

	infer = (env?: Env): Value => this.out?.infer(env) ?? Unit.instance

	eval = (env?: Env): WithLog => this.out?.eval(env) ?? Writer.of(Unit.instance)

	print(): string {
		const vars = entries(this.vars).map(([k, v]) => k + ' = ' + v.print())
		const out = this.out ? [this.out.print()] : []

		return '(let ' + [...vars, ...out].join(' ') + ')'
	}

	isSameTo = (exp: Exp) =>
		exp.type === 'scope' &&
		nullishEqual(this.out, exp.out, isSame) &&
		hasEqualValues(this.vars, exp.vars, isSame)

	extend(vars: Record<string, Exp>, out: Exp | null = null): Scope {
		const scope = new Scope(vars, out)
		scope.parent = this
		return scope
	}

	def(name: string, exp: Exp) {
		if (name in this.vars)
			throw new Error(`Variable '${name}' is already defined`)

		setParent(exp, this)
		this.vars[name] = exp

		return this
	}

	defs(vars: Record<string, Exp>) {
		for (const [name, exp] of entries(vars)) {
			this.def(name, exp)
		}
	}

	static of(vars: Record<string, Exp>, out: Exp | null = null) {
		const scope = new Scope(vars, out)
		values(vars).forEach(v => setParent(v, scope))
		if (out) setParent(out, scope)
		return scope
	}
}

export function setParent(exp: Exp, parent: ExpComplex) {
	if ('parent' in exp) {
		exp.parent = parent
	}
}

export function isSame(a: Exp, b: Exp): boolean {
	return a.isSameTo(b)
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

export function print(n: Exp) {
	return n.print()
}
