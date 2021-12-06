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
import {Writer} from '../utils/Writer'
import {zip} from '../utils/zip'
import * as Val from '../val'
import {RangedUnifier, shadowTyVars, unshadowTyVars} from './unify'

export type Node = Exp | Value | Obj

export type Exp = Sym | ExpComplex
export type ExpComplex = App | Scope | EFn | ETyFn | EVec | EDict

export type Value = Type | Atomic

type Type =
	| All
	| TyVar
	| TyPrim
	| TyEnum
	| TyFn
	| TyVec
	| TyDict
	| TyProd
	| TyUnion

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
	| Prod
	| TyValue

type UnitableType = Exclude<Value, All | Bottom>

export interface Log {
	level: 'error' | 'warn' | 'info'
	reason: string
	ref?: Node
}

export type ValueWithLog = Writer<Val.Value, Log>
export type ValueWithLog2 = Writer<Value, Log>
export type NodeWithLog = Writer<Node, Log>

interface INode {
	readonly type: string

	eval(env?: Env): ValueWithLog
	eval2(env?: Env): ValueWithLog2
	infer(env?: Env): Val.Value
	infer2(env?: Env): Value
	print(): string

	isSameTo(exp: Node): boolean
}

interface IExp {
	parent: ExpComplex | null
}

interface IValue {
	defaultValue: Atomic

	isType: boolean
	isEqualTo(e: Node): boolean
	isSubtypeOf(e: Value): boolean
	isInstanceOf(e: Value): boolean
}

export type IFn = (...params: any[]) => Writer<Value, Log>

interface IFnLike {
	tyFn: TyFn
	fn: IFn
}

type Env = Map<EFn, Record<string, Node>>

function isSubtypeOfGeneric(
	this: Exclude<Value, All | Bottom | TyUnion>,
	e: Value
): boolean {
	if (e.type === 'tyUnion') return e.isSupertypeOf(this)
	return this.isEqualTo(e) || this.superType.isSubtypeOf(e)
}

function isInstanceOfGeneric(this: Value, e: Value): boolean {
	if (e.type === 'all') return true
	return this.isType ? false : this.isSubtypeOf(e)
}

export class Sym implements INode, IExp {
	readonly type = 'sym' as const
	parent: ExpComplex | null = null

	private constructor(public name: string) {}

	#resolve(env?: Env): NodeWithLog {
		let ref = this.parent

		while (ref) {
			if (ref.type === 'scope' && this.name in ref.vars) {
				return Writer.of(ref.vars[this.name])
			}
			if (env && ref.type === 'eFn') {
				const param = env.get(ref)
				if (param && this.name in param) {
					return Writer.of(param[this.name])
				}
			}

			ref = ref.parent
		}

		const log: Log = {
			level: 'error',
			ref: this,
			reason: 'Variable not bound: ' + this.name,
		}

		return Writer.of(Unit.instance, log)
	}

	eval(env?: Env): ValueWithLog {
		return this.#resolve(env).bind(v => v.eval(env))
	}

	eval2 = (env?: Env): ValueWithLog2 => {
		return this.#resolve(env).bind(n => n.eval2(env))
	}

	infer(env?: Env): Val.Value {
		return this.#resolve(env).result.infer(env)
	}

	infer2(env?: Env): Value {
		return this.#resolve(env).result.infer2(env)
	}

	print = () => this.name

	isSameTo = (exp: Node) => exp.type === 'sym' && this.name === exp.name

	static of(name: string) {
		return new Sym(name)
	}
}

export class Obj implements INode, IExp {
	readonly type = 'obj' as const
	parent: ExpComplex | null = null

	private constructor(public value: Val.Value, public asType: boolean) {}

	eval(): ValueWithLog {
		return Writer.of(this.value)
	}
	// TODO: fix this
	eval2 = (): ValueWithLog2 => Writer.of(Unit.instance)

	infer(): Val.Value {
		if (this.asType === false && Val.isTy(this.value)) {
			return Val.tyValue(this.value)
		}
		return this.value
	}
	// TODO: fix this
	infer2 = () => Unit.instance

	print = () => this.value.print()

	isSameTo = (exp: Node) =>
		exp.type === 'obj' && this.value.isEqualTo(exp.value)

	static of(value: Val.Value) {
		return new Obj(value, false)
	}

	static asType(value: Val.Value) {
		return new Obj(value, true)
	}
}

export class Unit implements INode, IValue {
	readonly type = 'unit' as const
	superType!: All
	defaultValue = this

	eval = (): ValueWithLog => Writer.of(Val.unit)
	eval2 = (): ValueWithLog2 => Writer.of(this)
	infer = () => Val.unit
	infer2 = () => this
	print = () => '()'
	isSameTo = (exp: Node) => exp.type === 'unit'
	isEqualTo = this.isSameTo
	isSubtypeOf = isSubtypeOfGeneric.bind(this)
	isInstanceOf = isInstanceOfGeneric.bind(this)
	isType = false

	static instance = new Unit()
}

export class All implements INode, IValue {
	readonly type = 'all' as const
	defaultValue = Unit.instance

	eval = (): ValueWithLog => Writer.of(Val.all)
	eval2 = (): ValueWithLog2 => Writer.of(this)
	infer = () => Val.all
	infer2 = () => this
	print = () => '_'
	isSameTo = (exp: Node) => exp.type === 'all'
	isEqualTo = this.isSameTo
	isSubtypeOf = this.isSameTo
	isInstanceOf = isInstanceOfGeneric.bind(this)
	isType = false

	static instance = new All()
}

Unit.prototype.superType = All.instance

export class Bottom implements INode, IValue {
	readonly type = 'bottom' as const
	defaultValue = this

	eval = (): ValueWithLog => Writer.of(Val.bottom)
	eval2 = (): ValueWithLog2 => Writer.of(this)
	infer = () => Val.bottom
	infer2 = () => TyValue.of(this)
	print = () => '_|_'
	isSameTo = (exp: Node) => exp.type === 'bottom'
	isEqualTo = this.isSameTo
	isSubtypeOf = () => true
	isInstanceOf = (e: Value) => e.type === 'all' || e.type === 'bottom'
	isType = true

	static instance = new Bottom()
}

export class Prim<T = any> implements INode, IValue {
	readonly type = 'prim' as const
	defaultValue = this

	protected constructor(public superType: TyPrim, public value: T) {}

	// TODO: Fix this
	eval = (): ValueWithLog => Writer.of(Val.unit)
	eval2 = (): ValueWithLog2 => Writer.of(this)
	// TODO: Fix this
	infer = (): Val.Value => Val.unit
	infer2 = () => this
	print = () => `<instance of ${this.superType.print()}>`

	isSameTo = (exp: Node) =>
		exp.type === 'prim' &&
		isSame(this.superType, exp.superType) &&
		this.value === exp.value

	isEqualTo = this.isSameTo

	isSubtypeOf: (e: Value) => boolean = isSubtypeOfGeneric.bind(this)

	isInstanceOf: (e: Value) => boolean = isInstanceOfGeneric.bind(this)

	isType = false

	static from<T>(ty: TyPrim, value: T) {
		return new Prim<T>(ty, value)
	}
}

export class Num extends Prim<number> {
	eval = (): ValueWithLog => Writer.of(Val.num(this.value))
	infer = () => Val.num(this.value)
	print = () => this.value.toString()

	static of(value: number) {
		return new Num(tyNum, value)
	}
}

export class Str extends Prim<string> {
	eval = (): ValueWithLog => Writer.of(Val.str(this.value))
	infer = () => Val.str(this.value)

	print = () => '"' + this.value + '"'

	static of(value: string) {
		return new Str(tyStr, value)
	}
}

export class TyPrim<T = any> implements INode, IValue {
	readonly type = 'tyPrim' as const
	superType = All.instance
	defaultValue!: Num | Str | Prim

	private constructor(private readonly name: string) {}

	// TODO: fix this
	eval = (): ValueWithLog => Writer.of(Val.tyAtom(this.name, null))
	eval2 = (): ValueWithLog2 => Writer.of(this)
	infer = () => Val.tyAtom(this.name, null)
	infer2 = (): Value => TyValue.of(this)
	print = () => this.name

	isSameTo = (exp: Node) => exp.type === 'tyPrim' && this.name === exp.name

	isEqualTo = this.isSameTo

	isSubtypeOf: (e: Value) => boolean = isSubtypeOfGeneric.bind(this)

	isInstanceOf: (e: Value) => boolean = isInstanceOfGeneric.bind(this)

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

export class Enum implements INode, IValue {
	readonly type = 'enum' as const
	superType!: TyEnum

	private constructor(public readonly name: string) {}

	defaultValue = this

	// TODO: Fix this
	eval = (): ValueWithLog => Writer.of(Val.unit)
	eval2 = (): ValueWithLog2 => Writer.of(this)
	// TODO: Fix this
	infer = () => Val.unit
	infer2 = () => this
	// TODO: fix this
	print = () => this.name

	isSameTo = (e: Node) =>
		e.type === 'enum' &&
		this.name === e.name &&
		this.superType.isSameTo(e.superType)

	isEqualTo = this.isSameTo

	isSubtypeOf = isSubtypeOfGeneric.bind(this)

	isInstanceOf: (e: Value) => boolean = isInstanceOfGeneric.bind(this)

	isType = false

	static of(name: string) {
		return new Enum(name)
	}
}

export class TyEnum implements INode, IValue {
	readonly type = 'tyEnum' as const
	superType = All.instance

	private constructor(
		public readonly name: string,
		public readonly types: Enum[]
	) {}

	defaultValue = this.types[0]

	// TODO: Fix this
	eval = (): ValueWithLog => Writer.of(Val.unit)
	eval2 = (): ValueWithLog2 => Writer.of(this)
	// TODO: Fix this
	infer = () => Val.unit
	infer2 = () => TyValue.of(this)
	// TODO: fix this
	print = () => this.name

	isSameTo = (e: Node) => e.type === 'tyEnum' && this.name === e.name

	isEqualTo = this.isSameTo

	isSubtypeOf = isSubtypeOfGeneric.bind(this)

	isInstanceOf: (e: Value) => boolean = isInstanceOfGeneric.bind(this)

	isType = true

	getEnum = (label: string) => {
		const en = this.types.find(t => t.name === label)
		if (!en) throw new Error('Cannot find label')
		return en
	}

	static of(name: string, labels: string[]) {
		if (labels.length === 0) throw new Error('Zero-length enum')

		const types = labels.map(Enum.of)
		const tyEnum = new TyEnum(name, types)
		tyEnum.defaultValue = types[0]
		types.forEach(t => (t.superType = tyEnum))

		return tyEnum
	}
}

export class TyVar implements INode, IValue {
	readonly type = 'tyVar' as const
	superType = All.instance

	private constructor(public name: string) {}

	defaultValue = Unit.instance

	eval = (): ValueWithLog => Writer.of(Val.tyVar(this.name))
	eval2 = (): ValueWithLog2 => Writer.of(this)
	infer = () => Val.tyVar(this.name)
	infer2 = () => this
	print = () => '<' + this.name + '>'
	isSameTo = (exp: Node) => exp.type === 'tyVar' && this.name === exp.name

	isEqualTo = this.isSameTo

	isSubtypeOf = isSubtypeOfGeneric.bind(this)

	isInstanceOf: (e: Value) => boolean = isInstanceOfGeneric.bind(this)

	// NOTE: is this correct?
	isType = true

	static of(name: string) {
		return new TyVar(name)
	}
}

export class EFn implements INode, IExp {
	readonly type = 'eFn' as const
	parent: ExpComplex | null = null

	private constructor(public param: Record<string, Node>, public body: Node) {}

	eval(env: Env = new Map()): ValueWithLog {
		const paramNames = keys(this.param)

		const fn: Val.IFn = (...args: Val.Value[]) => {
			const rec = fromPairs(zip(paramNames, args.map(Obj.of)))
			const innerEnv = new Map([...env.entries(), [this, rec]])

			return this.body.eval(innerEnv)
		}

		const evParam = Writer.mapValues(this.param, p => p.eval(env))
		const [param, paramLog] = evParam.asTuple

		const rec = mapValues(param, Obj.asType)
		const innerEnv = new Map([...env.entries(), [this, rec]])
		const out = this.body.infer(innerEnv)

		const fnVal = Val.fn(fn, param, out, this.body)
		return Writer.of(fnVal, ...paramLog)
	}
	// TODO: fix this
	eval2 = (): ValueWithLog2 => Writer.of(Unit.instance)

	infer(env: Env = new Map()): Val.Value {
		const param = Writer.mapValues(this.param, p => p.eval(env)).result
		const paramDict = mapValues(param, p => Obj.asType(p))

		const innerEnv = new Map([...env.entries(), [this, paramDict]])
		const out = this.body.infer(innerEnv)

		return Val.tyFn(values(param), out)
	}

	// TODO: fix this
	infer2 = () => Unit.instance

	print(): string {
		const params = entries(this.param).map(([k, v]) => k + ':' + v.print())
		const param = params.length === 1 ? params[0] : '(' + params.join(' ') + ')'
		const body = this.body.print()

		return `(=> ${param} ${body})`
	}

	isSameTo = (exp: Node) =>
		exp.type === 'eFn' &&
		hasEqualValues(this.param, exp.param, isSame) &&
		isSame(this.body, exp.body)

	static of(param: Record<string, Node>, body: Node) {
		const fn = new EFn(param, body)
		values(param).forEach(p => setParent(p, fn))
		setParent(body, fn)
		return fn
	}
}

export class Fn implements INode, IValue, IFnLike {
	readonly type = 'fn' as const

	private constructor(public superType: TyFn, public fn: IFn) {}

	tyFn = this.superType

	defaultValue = this

	// TODO: Fix this
	eval = (): ValueWithLog => Writer.of(Val.unit)
	eval2 = (): ValueWithLog2 => Writer.of(this)
	// TODO: Fix this
	infer = () => Val.unit
	infer2 = () => this
	// TODO: fix this
	print = (): string => {
		const param = this.superType.printParam()
		const out = this.superType.out.print()
		return `(=> ${param} (js code):${out})`
	}

	isSameTo = () => false
	isEqualTo = () => false
	isSubtypeOf = isSubtypeOfGeneric.bind(this)
	isInstanceOf = isInstanceOfGeneric.bind(this)
	isType = false

	static of(param: Record<string, Value>, out: Value, fn: IFn) {
		return new Fn(TyFn.from(param, out), fn)
	}
	static from(ty: TyFn, fn: IFn) {
		return new Fn(ty, fn)
	}
}

export class ETyFn implements INode, IExp {
	readonly type = 'eTyFn' as const
	parent: ExpComplex | null = null

	private constructor(public param: Record<string, Node>, public out: Node) {}

	eval(env?: Env): ValueWithLog {
		const paramArr = values(this.param)

		const [param, l1] = Writer.map(paramArr, p => p.eval(env)).asTuple
		const [out, l2] = this.out.eval(env).asTuple
		const tyFn = Val.tyFn(param, out)
		return Writer.of(tyFn, ...l1, ...l2)
	}

	eval2 = (env?: Env): ValueWithLog2 => {
		const [params, lp] = Writer.mapValues(this.param, p => p.eval2(env)).asTuple
		const [out, lo] = this.out.eval2(env).asTuple
		return Writer.of(TyFn.from(params, out), ...lp, ...lo)
	}

	infer(env?: Env): Val.Value {
		const param = values(this.param).map(p => p.infer(env))
		const out = this.out.infer(env)
		return Val.tyFn(param, out)
	}

	infer2 = (env?: Env) => TyValue.of(this.eval2(env).result)

	print = (): string => {
		const param = entries(this.param).map(printNamedNode).join(' ')
		const out = this.out.print()
		return `(-> [${param}] ${out})`
	}

	isSameTo = (exp: Node): boolean =>
		exp.type === 'eTyFn' &&
		hasEqualValues(this.param, exp.param, isSame) &&
		isSame(this.out, this.out)

	static of(param: Node | Node[], out: Node) {
		const paramArr = [param].flat()
		const pairs = paramArr.map((p, i) => [i, p] as const)
		const paramDict = Object.fromEntries(pairs)

		const tyFn = new ETyFn(paramDict, out)

		paramArr.forEach(p => setParent(p, tyFn))
		setParent(out, tyFn)

		return tyFn
	}

	static from(param: Record<string, Node>, out: Node) {
		const tyFn = new ETyFn(param, out)
		forOwn(param, p => setParent(p, tyFn))
		setParent(out, tyFn)
		return tyFn
	}
}

export class TyFn implements INode, IValue {
	readonly type = 'tyFn' as const
	superType = All.instance

	private constructor(public param: Record<string, Value>, public out: Value) {}

	#defaultValue?: Fn
	get defaultValue() {
		this.#defaultValue ??= Fn.from(this, () => Writer.of(this.out.defaultValue))
		return this.#defaultValue
	}

	// TODO: Fix this
	eval = (): ValueWithLog => Writer.of(Val.unit)
	eval2 = (): ValueWithLog2 => Writer.of(this)
	// TODO: Fix this
	infer = () => Val.unit
	infer2 = () => this

	printParam = () => `[${entries(this.param).map(printNamedNode).join(' ')}]`

	print = (): string => {
		const param = this.printParam()
		const out = this.out.print()
		return `(-> ${param} ${out})`
	}

	isSameTo = (e: Node) =>
		e.type === 'tyFn' &&
		isEqualArray(values(this.param), values(e.param), isSame) &&
		isSame(this.out, e.out)

	isEqualTo = this.isSameTo

	isSubtypeOf = (e: Value): boolean => {
		if (this.superType.isSubtypeOf(e)) return true
		if (e.type === 'tyUnion') return e.isSupertypeOf(this)
		if (e.type !== 'tyFn') return false

		const tParam = Vec.of(...values(this.param))
		const eParam = Vec.of(...values(e.param))

		return isSubtype(eParam, tParam) && isSubtype(this.out, e.out)
	}

	isInstanceOf = isInstanceOfGeneric.bind(this)

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

function printNamedNode([name, ty]: [string, Node]) {
	if (/^[0-9]+$/.test(name)) return ty.print()
	return name + ':' + ty.print()
}

export class EVec implements INode {
	readonly type = 'eVec' as const
	parent: ExpComplex | null = null

	private constructor(public items: Node[], public rest: Node | null = null) {}

	get length() {
		return this.items.length
	}

	eval(env?: Env): ValueWithLog {
		const [items, li] = Writer.map(this.items, it => it.eval(env)).asTuple
		if (this.rest) {
			const [rest, lr] = this.rest.eval(env).asTuple
			return Writer.of(Val.vecFrom(items, rest), ...li, ...lr)
		}
		return Writer.of(Val.vecFrom(items), ...li)
	}

	eval2 = (env?: Env): ValueWithLog2 => {
		const [items, li] = Writer.map(this.items, i => i.eval2(env)).asTuple
		if (this.rest) {
			const [rest, lr] = this.rest.eval2(env).asTuple
			return Writer.of(TyVec.of(items, rest), ...li, ...lr)
		} else {
			return Writer.of(Vec.of(...items), ...li)
		}
	}

	infer(env?: Env): Val.Value {
		const items = this.items.map(it => it.infer(env))
		const rest = this.rest?.infer(env)
		if (rest) {
			return Val.tyValue(Val.vecFrom(items, rest))
		} else {
			return Val.vecFrom(items)
		}
	}

	// TODO: fix this
	infer2(env?: Env): Value {
		const items = this.items.map(it => it.infer2(env))
		const rest = this.rest?.infer2(env)
		if (rest) {
			return TyValue.of(TyVec.of(items, rest))
		} else {
			return Vec.of(...items)
		}
	}

	print(): string {
		const items = this.items.map(it => it.print())
		const rest = this.rest ? ['...' + this.rest.print()] : []
		return '[' + [...items, ...rest].join(' ') + ']'
	}

	isSameTo = (exp: Node): boolean =>
		exp.type === 'eVec' &&
		isEqualArray(this.items, exp.items, isSame) &&
		nullishEqual(this.rest, this.rest, isSame)

	static of(...items: Node[]) {
		const vec = new EVec(items)
		items.forEach(it => setParent(it, vec))
		return vec
	}

	static from(items: Node[], rest: Node | null = null) {
		const vec = new EVec(items, rest)
		items.forEach(it => setParent(it, vec))
		if (rest) setParent(rest, vec)
		return vec
	}
}

export class Vec implements INode, IValue {
	readonly type = 'vec' as const
	readonly superType = All.instance

	private constructor(public items: Value[]) {}

	#defaultValue?: Vec
	get defaultValue() {
		this.#defaultValue ??= Vec.of(...this.items.map(it => it.defaultValue))
		return this.#defaultValue
	}

	// TODO: Fix this
	eval = (): ValueWithLog => Writer.of(Val.unit)
	eval2 = (): ValueWithLog2 => Writer.of(this)
	// TODO: Fix this
	infer = () => Val.unit
	infer2 = () => this

	print = (): string => {
		const items = this.items.map(print)
		return '[' + items.join(' ') + ']'
	}

	isSameTo = (e: Node) =>
		e.type === 'vec' && isEqualArray(this.items, e.items, isSame)

	isEqualTo = this.isSameTo

	isSubtypeOf = isSubtypeVecGeneric.bind(this)

	isInstanceOf = isInstanceOfGeneric.bind(this)

	get isType() {
		return this.items.some(isType)
	}

	get asTyVecLike(): TyVecLike {
		return {items: this.items}
	}

	static of(...items: Value[]) {
		return new Vec(items)
	}
}

export class TyVec implements INode, IValue {
	readonly type = 'tyVec' as const
	readonly superType = All.instance

	private constructor(public items: Value[], public rest: Value) {}

	#defaultValue?: Vec
	get defaultValue() {
		this.#defaultValue ??= Vec.of(...this.items.map(it => it.defaultValue))
		return this.#defaultValue
	}

	// TODO: Fix this
	eval = (): ValueWithLog => Writer.of(Val.unit)
	eval2 = (): ValueWithLog2 => Writer.of(this)
	// TODO: Fix this
	infer = () => Val.unit
	infer2 = () => TyValue.of(this)

	print = (): string => {
		const items = this.items.map(print)
		return '[' + items.join(' ') + ']'
	}

	isSameTo = (e: Node) =>
		e.type === 'tyVec' && isEqualArray(this.items, e.items, isSame)

	isEqualTo = this.isSameTo

	isSubtypeOf = isSubtypeVecGeneric.bind(this)

	isInstanceOf = isInstanceOfGeneric.bind(this)

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

export class EDict implements INode, IExp {
	readonly type = 'eDict' as const
	parent: ExpComplex | null = null

	private constructor(
		public items: Record<string, {optional?: boolean; value: Node}>,
		public rest?: Node
	) {}

	infer(env?: Env): Val.Value {
		const items = mapValues(this.items, it => ({
			optional: it.optional,
			value: it.value.infer(env),
		}))
		const rest = this.rest?.infer(env)
		return Val.tyDict(items, rest)
	}

	infer2 = (env?: Env): Value => {
		const items = mapValues(this.items, i => ({
			optional: i.optional,
			value: i.value.infer2(env),
		}))
		const rest = this.rest?.infer2(env)

		return TyValue.of(TyDict.of(items, rest))
	}

	eval(env?: Env): ValueWithLog {
		const [items, l] = Writer.mapValues(this.items, ({optional, value}) =>
			value.eval(env).fmap(value => ({optional, value}))
		).asTuple
		const [rest, lr] = this.rest ? this.rest.eval(env).asTuple : [undefined, []]
		return Writer.of(Val.tyDict(items, rest), ...l, ...lr)
	}

	eval2(env?: Env): ValueWithLog2 {
		const [items, li] = Writer.mapValues(this.items, ({optional, value}) =>
			value.eval2(env).fmap(value => ({optional, value}))
		).asTuple
		const [rest, lr] = this.rest
			? this.rest.eval2(env).asTuple
			: [undefined, []]

		return Writer.of(TyDict.of(items, rest), ...li, ...lr)
	}

	print(): string {
		const items = entries(this.items).map(
			([k, v]) => k + (v.optional ? '?' : '') + ': ' + v.value.print()
		)
		const rest = this.rest ? ['...' + this.rest.print()] : []
		return '{' + [...items, ...rest].join(' ') + '}'
	}

	isSameTo = (exp: Node): boolean =>
		exp.type === 'eDict' &&
		hasEqualValues(
			this.items,
			exp.items,
			(t, e) => !!t.optional === !!e.optional && isSame(t.value, e.value)
		)

	static of(items: Record<string, Node>) {
		const its = mapValues(items, value => ({value}))
		return EDict.from(its)
	}

	static from(
		items: Record<string, {optional?: boolean; value: Node}>,
		rest?: Node
	) {
		const dict = new EDict(items, rest)
		values(items).forEach(it => setParent(it.value, dict))
		if (rest) setParent(rest, dict)
		return dict
	}
}

export class Dict implements INode, IValue {
	readonly type = 'dict' as const
	superType = All.instance

	private constructor(public items: Record<string, Value>) {}

	#defaultValue?: Dict
	get defaultValue() {
		this.#defaultValue ??= Dict.of(mapValues(this.items, it => it.defaultValue))
		return this.#defaultValue
	}

	// TODO: Fix this
	eval = (): ValueWithLog => Writer.of(Val.unit)
	eval2 = (): ValueWithLog2 => Writer.of(this)
	// TODO: Fix this
	infer = () => Val.unit
	infer2 = () => this

	print = (): string => {
		const items = entries(this.items).map(([k, v]) => k + ':' + v.print())
		return '{' + items.join(' ') + '}'
	}

	isSameTo = (e: Node) =>
		e.type === 'dict' && hasEqualValues(this.items, e.items, isSame)

	isEqualTo = this.isSameTo

	isSubtypeOf = isSubtypeDictGeneric.bind(this)

	isInstanceOf = isInstanceOfGeneric.bind(this)

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

export class TyDict implements INode, IValue {
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

	// TODO: Fix this
	eval = (): ValueWithLog => Writer.of(Val.unit)
	eval2 = (): ValueWithLog2 => Writer.of(this)
	// TODO: Fix this
	infer = () => Val.unit
	infer2 = () => TyValue.of(this)

	print = (): string => {
		const items = entries(this.items).map(([k, {optional, value}]) => {
			return k + (optional ? '?' : '') + ': ' + value.print()
		})
		const rest = this.rest ? ['...' + this.rest.print()] : []

		return '{' + [...items, ...rest].join(' ') + '}'
	}

	isSameTo = (e: Node) =>
		e.type === 'tyDict' &&
		hasEqualValues(
			this.items,
			e.items,
			(ti, ei) => !!ti.optional === !!ei.optional && isSame(ti.value, ei.value)
		)

	isEqualTo = this.isSameTo

	isSubtypeOf = isSubtypeDictGeneric.bind(this)

	isInstanceOf = isInstanceOfGeneric.bind(this)

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

export class Prod implements INode, IValue {
	readonly type = 'prod' as const

	private constructor(public superType: TyProd, public items: Value[]) {}

	defaultValue = this

	// TODO: Fix this
	eval = (): ValueWithLog => Writer.of(Val.unit)
	eval2 = (): ValueWithLog2 => Writer.of(this)
	// TODO: Fix this
	infer = () => Val.unit
	infer2 = () => this

	print = (): string => {
		const ctor = this.superType.print()
		const items = this.items.map(it => it.print())
		return '(' + [ctor, ...items].join(' ') + ')'
	}

	isSameTo = (e: Node) =>
		e.type === 'prod' &&
		this.superType.isSameTo(e.superType) &&
		isEqualArray(this.items, e.items, isSame)

	isEqualTo = this.isSameTo

	isSubtypeOf = isSubtypeOfGeneric.bind(this)

	isInstanceOf = isInstanceOfGeneric.bind(this)

	isType = false

	static of(ctor: TyProd, items: Value[]) {
		return new Prod(ctor, items)
	}
}

export class TyProd implements INode, IValue {
	readonly type = 'tyProd' as const
	superType = All.instance

	private constructor(
		public name: string,
		public param: Record<string, Value>
	) {}

	#defaultValue?: Prod
	get defaultValue() {
		if (!this.#defaultValue) {
			const items = values(this.param).map(p => p.defaultValue)
			this.#defaultValue = Prod.of(this, items)
		}
		return this.#defaultValue
	}

	// TODO: Fix this
	eval = (): ValueWithLog => Writer.of(Val.unit)
	eval2 = (): ValueWithLog2 => Writer.of(this)
	// TODO: Fix this
	infer = () => Val.unit
	infer2 = () => this
	// TODO: Fix this
	print = () => this.name

	isSameTo = (e: Node) => e.type === 'tyProd' && this.name === e.name

	isEqualTo = this.isSameTo

	isSubtypeOf = isSubtypeOfGeneric.bind(this)

	isInstanceOf = isInstanceOfGeneric.bind(this)

	isType = true

	of(...items: Value[]) {
		return Prod.of(this, items)
	}

	static of(name: string, param: Record<string, Value>) {
		return new TyProd(name, param)
	}
}

export class TyValue implements INode, IValue {
	readonly type = 'tyValue' as const
	superType = All.instance

	private constructor(public value: Exclude<Type, All> | Bottom) {}

	defaultValue = Unit.instance

	// TODO: Fix this
	eval = (): ValueWithLog => Writer.of(Val.unit)
	eval2 = (): ValueWithLog2 => Writer.of(this)
	// TODO: Fix this
	infer = () => Val.unit
	infer2 = () => this
	print = () => `<${this.value.print()} as value>`

	isSameTo = (e: Node): boolean =>
		e.type === 'tyValue' && this.value.isSameTo(e.value)

	isEqualTo = this.isSameTo

	isSubtypeOf = isSubtypeOfGeneric.bind(this)

	isInstanceOf = isInstanceOfGeneric.bind(this)

	isType = false

	static of(value: Value) {
		if (TyValue.#TypesToWrap.has(value.type)) {
			return new TyValue(value as TyValue['value'])
		}
		return value
	}

	static #TypesToWrap = new Set([
		'bottom',
		'tyVar',
		'tyPrim',
		'tyEnum',
		'tyFn',
		'tyVec',
		'tyDict',
		'tyProd',
		'tyUnion',
	])
}

export class TyUnion implements INode, IValue {
	readonly type = 'tyUnion' as const
	superType = All.instance

	private constructor(public types: UnitableType[]) {}

	#defaultValue?: Atomic
	get defaultValue(): Atomic {
		return (this.#defaultValue ??= this.types[0].defaultValue)
	}

	// TODO: Fix this
	eval = (): ValueWithLog => Writer.of(Val.unit)
	eval2 = (): ValueWithLog2 => Writer.of(this)
	// TODO: Fix this
	infer = () => Val.unit
	infer2 = () => this

	print = (): string => {
		const types = this.types.map(t => t.print()).join(' ')
		return `(| ${types})`
	}

	isEqualTo = (e: Node): boolean =>
		e.type === 'tyUnion' &&
		differenceWith(this.types, e.types, isEqual).length === 0

	isSameTo = this.isEqualTo

	isSubtypeOf = (e: Value): boolean => {
		if (this.superType.isSubtypeOf(e)) return true

		const types: Value[] = e.type === 'tyUnion' ? e.types : [e]
		return this.types.every(s => types.some(s.isSubtypeOf))
	}

	isInstanceOf = isInstanceOfGeneric.bind(this)

	isType = true

	isSupertypeOf = (s: Exclude<Value, TyUnion>) => this.types.some(s.isSubtypeOf)
}

export class App implements INode, IExp {
	readonly type = 'app' as const
	parent: ExpComplex | null = null

	private constructor(public fn: Node, public args: Node[]) {}

	private inferFn(env?: Env): [Val.TyFn, Val.Value[], RangedUnifier] {
		let [ty] = this.fn.eval(env).asTuple

		if (ty.type === 'tyValue') ty = ty.value

		if (!('tyFn' in ty)) return [Val.tyFn([], ty), [], RangedUnifier.empty()]

		const tyArgs = this.args
			.slice(0, ty.tyFn.tyParam.length)
			.map(a => shadowTyVars(a.infer(env)))

		const subst = RangedUnifier.unify([
			[Val.vecFrom(ty.tyFn.tyParam), '>=', Val.vecFrom(tyArgs)],
		])

		const unifiedTyFn = subst.substitute(ty.tyFn, false) as Val.TyFn
		const unifiedTyArgs = tyArgs.map(a => subst.substitute(a))

		return [unifiedTyFn, unifiedTyArgs, subst]
	}

	eval(env?: Env): ValueWithLog {
		const [fn, fnLog] = this.fn.eval(env).asTuple
		const logs: Log[] = []

		if (!('fn' in fn)) return Writer.of(fn, ...fnLog)

		const [{tyParam}, tyArgs, subst] = this.inferFn(env)
		const paramNames = keys(fn.param)

		// Log unused extra arguments
		const unusedArgLogs: Log[] = this.args
			.slice(tyParam.length)
			.map(ref => ({level: 'info', ref, reason: 'Unused argument'}))
		logs.push(...unusedArgLogs)

		const args = tyParam.map((p, i) => {
			const a = this.args[i]
			const name = paramNames[i]

			if (!a) {
				logs.push({
					level: 'error',
					ref: this,
					reason: 'Insufficient argument: ' + name,
				})
				return p.defaultValue
			}

			const aTy = tyArgs[i]
			const [aVal, aLog] = a.eval(env).asTuple
			logs.push(...aLog)

			if (!aTy.isSubtypeOf(p)) {
				if (aTy.type !== 'unit') {
					logs.push({
						level: 'error',
						ref: this,
						reason:
							`Argument ${name} expects type: ${p.print()}, ` +
							`but got: ${aTy.print()}`,
					})
				}
				return p.defaultValue
			}

			return aVal
		})

		const [result, evalLog] = fn.fn(...args).asTuple

		const resultTyped = unshadowTyVars(subst.substitute(result))

		return Writer.of(resultTyped, ...fnLog, ...logs, ...evalLog)
	}

	// TODO: polymorphic function is not yet supported
	eval2 = (env?: Env): ValueWithLog2 => {
		// Evaluate the function itself at first
		const [fn, fnLog] = this.fn.eval2(env).asTuple

		// Check if it's not a function
		if (!('tyFn' in fn)) {
			return Writer.of(fn, ...fnLog, {
				level: 'warn',
				ref: this,
				reason: 'Not a function: ' + fn.print(),
			})
		}

		// Start function application
		const logs: Log[] = []
		const names = keys(fn.tyFn.param)
		const params = values(fn.tyFn.param)

		// const [{tyParam}, tyArgs, subst] = this.inferFn(env)
		// const paramNames = keys(fn.param)

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

		// Check types of args and cast them to default if necessary
		const args = params.map((p, i) => {
			const a = this.args[i] ?? Unit.instance
			const name = names[i]

			const aTy = a.infer2(env)

			if (!isSubtype(aTy, p)) {
				if (aTy.type !== 'unit') {
					logs.push({
						level: 'error',
						ref: this,
						reason:
							`Argument '${name}' expects type: ${p.print()}, ` +
							`but got: '${aTy.print()}''`,
					})
				}
				return p.defaultValue
			}

			const [aVal, aLog] = a.eval2(env).asTuple
			logs.push(...aLog)

			return aVal
		})

		// Call the function
		const [result, callLog] = fn.fn(...args).asTuple

		// const resultTyped = unshadowTyVars(subst.substitute(result))

		return Writer.of(result, ...fnLog, ...logs, ...callLog)
	}

	infer(env?: Env): Val.Value {
		const [tyFn] = this.inferFn(env)
		return unshadowTyVars(tyFn.tyOut)
	}

	// TODO: polymorphic function is not yet supported
	infer2 = (env?: Env): Value => {
		const fn = this.fn.eval2(env).result
		if (!('tyFn' in fn)) return fn
		return fn.tyFn.out
	}

	print(): string {
		const fn = this.fn.print()
		const args = this.args.map(a => a.print())

		return '(' + [fn, ...args].join(' ') + ')'
	}

	isSameTo = (exp: Node) =>
		exp.type === 'app' && isEqualArray(this.args, exp.args, isSame)

	static of(fn: Node, ...args: Node[]) {
		const app = new App(fn, args)
		setParent(fn, app)
		args.forEach(a => setParent(a, app))
		return app
	}
}

export class Scope implements INode, IExp {
	readonly type = 'scope' as const
	parent: ExpComplex | null = null

	private constructor(
		public vars: Record<string, Node>,
		public out: Node | null = null
	) {}

	infer(env?: Env): Val.Value {
		return this.out ? this.out.infer(env) : Val.bottom
	}

	infer2 = (env?: Env): Value => this.out?.infer2(env) ?? Unit.instance

	eval(env?: Env): ValueWithLog {
		return this.out ? this.out.eval(env) : Writer.of(Val.bottom)
	}

	eval2 = (env?: Env): ValueWithLog2 =>
		this.out?.eval2(env) ?? Writer.of(Unit.instance)

	print(): string {
		const vars = entries(this.vars).map(([k, v]) => k + '=' + v.print())
		const out = this.out ? [this.out.print()] : []

		return '{' + [...vars, ...out].join(' ') + '}'
	}

	isSameTo = (exp: Node) =>
		exp.type === 'scope' &&
		nullishEqual(this.out, exp.out, isSame) &&
		hasEqualValues(this.vars, exp.vars, isSame)

	extend(vars: Record<string, Node>, out: Node | null = null): Scope {
		const scope = new Scope(vars, out)
		scope.parent = this
		return scope
	}

	def(name: string, exp: Node) {
		if (name in this.vars)
			throw new Error(`Variable '${name}' is already defined`)

		setParent(exp, this)
		this.vars[name] = exp

		return this
	}

	defs(vars: Record<string, Node>) {
		for (const [name, exp] of entries(vars)) {
			this.def(name, exp)
		}
	}

	static of(vars: Record<string, Node>, out: Node | null = null) {
		const scope = new Scope(vars, out)
		values(vars).forEach(v => setParent(v, scope))
		if (out) setParent(out, scope)
		return scope
	}
}

export function setParent(exp: Node, parent: Exclude<Exp, Sym>) {
	if ('parent' in exp) {
		exp.parent = parent
	}
}

export function isSame(a: Node, b: Node): boolean {
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

export function print(n: Node) {
	return n.print()
}
