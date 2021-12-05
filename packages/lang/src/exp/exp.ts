import {
	difference,
	differenceWith,
	entries,
	fromPairs,
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

type Exp = Sym | App | Scope | EFn | ETyFn | EVec | EDict

export type Value =
	| All
	| Bottom
	| Unit
	| Num
	| Str
	| Atom
	| TyVar
	| TyAtom
	| Enum
	| TyEnum
	| Fn
	| TyFn
	| Vec
	| TyVec
	| Dict
	| TyDict
	| Prod
	| TyProd
	| TyValue
	| TyUnion

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
	parent: Node | null

	eval(env?: Env): ValueWithLog
	eval2(env?: Env): ValueWithLog2
	infer(env?: Env): Val.Value
	infer2(env?: Env): Value
	print(): string

	isSameTo(exp: Node): boolean
}

interface IValue {
	isEqualTo(e: Node): boolean
	isSubtypeOf(e: Value): boolean
}

type IFn = (...params: any[]) => Writer<Value, Log>

interface IFnLike {
	superType: TyFn
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

export class Sym implements INode {
	public readonly type = 'sym' as const
	public parent: Node | null = null

	private constructor(public name: string) {}

	public resolve(env?: Env): NodeWithLog {
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

		return Writer.of(Unit.of(), log)
	}

	public eval(env?: Env): ValueWithLog {
		return this.resolve(env).bind(v => v.eval(env))
	}

	public eval2 = (env?: Env): ValueWithLog2 => {
		return this.resolve(env).bind(n => n.eval2(env))
	}

	public infer(env?: Env): Val.Value {
		return this.resolve(env).result.infer(env)
	}

	public infer2(env?: Env): Value {
		return this.resolve(env).result.infer2(env)
	}

	public print = () => this.name

	public isSameTo = (exp: Node) => exp.type === 'sym' && this.name === exp.name

	public static of(name: string) {
		return new Sym(name)
	}
}

export class Obj implements INode {
	public readonly type = 'obj' as const
	public parent: Node | null = null

	private constructor(public value: Val.Value, public asType: boolean) {}

	public eval(): ValueWithLog {
		return Writer.of(this.value)
	}
	// TODO: fix this
	public eval2 = (): ValueWithLog2 => Writer.of(Unit.of())

	public infer(): Val.Value {
		if (this.asType === false && Val.isTy(this.value)) {
			return Val.tyValue(this.value)
		}
		return this.value
	}
	// TODO: fix this
	public infer2 = () => Unit.of()

	public print = () => this.value.print()

	public isSameTo = (exp: Node) =>
		exp.type === 'obj' && this.value.isEqualTo(exp.value)

	public static of(value: Val.Value) {
		return new Obj(value, false)
	}

	public static asType(value: Val.Value) {
		return new Obj(value, true)
	}
}

export class All implements INode, IValue {
	public readonly type = 'all' as const
	public parent: Node | null = null

	public eval = (): ValueWithLog => Writer.of(Val.all)
	public eval2 = (): ValueWithLog2 => Writer.of(this)
	public infer = () => Val.all
	public infer2 = () => this
	public print = () => '_'
	public isSameTo = (exp: Node) => exp.type === 'all'
	public isEqualTo = this.isSameTo
	public isSubtypeOf = this.isSameTo

	public static of = () => new All()

	public static instance = new All()
}

export class Bottom implements INode, IValue {
	public readonly type = 'bottom' as const
	public parent: Node | null = null

	public eval = (): ValueWithLog => Writer.of(Val.bottom)
	public eval2 = (): ValueWithLog2 => Writer.of(this)
	public infer = () => Val.bottom
	public infer2 = () => this
	public print = () => '_|_'
	public isSameTo = (exp: Node) => exp.type === 'bottom'
	public isEqualTo = this.isSameTo
	public isSubtypeOf = () => true

	public static of = () => new Bottom()
}

export class Unit implements INode, IValue {
	public readonly type = 'unit' as const
	public parent: Node | null = null
	public superType = All.instance

	public eval = (): ValueWithLog => Writer.of(Val.unit)
	public eval2 = (): ValueWithLog2 => Writer.of(this)
	public infer = () => Val.unit
	public infer2 = () => this
	public print = () => '()'
	public isSameTo = (exp: Node) => exp.type === 'unit'
	public isEqualTo = this.isSameTo
	public isSubtypeOf = isSubtypeOfGeneric.bind(this)

	public static of = () => new Unit()
}

export class Atom<T = any> implements INode, IValue {
	public readonly type = 'atom' as const
	public parent: Node | null = null

	protected constructor(public superType: TyAtom, public value: T) {}

	// TODO: Fix this
	public eval = (): ValueWithLog => Writer.of(Val.unit)
	public eval2 = (): ValueWithLog2 => Writer.of(this)
	// TODO: Fix this
	public infer = (): Val.Value => Val.unit
	public infer2 = () => this
	public print = () => `<instance of ${this.superType.print()}>`

	public isSameTo = (exp: Node) =>
		exp.type === 'atom' &&
		isSame(this.superType, exp.superType) &&
		this.value === exp.value

	public isEqualTo = this.isSameTo

	public isSubtypeOf: (e: Value) => boolean = isSubtypeOfGeneric.bind(this)

	public static from<T>(ty: TyAtom, value: T) {
		return new Atom(ty, value)
	}
}

export class Num extends Atom<number> {
	public eval = (): ValueWithLog => Writer.of(Val.num(this.value))
	public infer = () => Val.num(this.value)
	public print = () => this.value.toString()

	public static of(value: number) {
		return new Num(tyNum, value)
	}
}

export class Str extends Atom<string> {
	public eval = (): ValueWithLog => Writer.of(Val.str(this.value))
	public infer = () => Val.str(this.value)

	public print = () => '"' + this.value + '"'

	public static of(value: string) {
		return new Str(tyStr, value)
	}
}

export class TyAtom<T = any> implements INode, IValue {
	public readonly type = 'tyAtom' as const
	public parent: Node | null = null
	public superType = All.instance

	private constructor(
		private readonly name: string,
		public defaultValue: Num | Str | Atom
	) {}

	// TODO: fix this
	public eval = (): ValueWithLog => Writer.of(Val.tyAtom(this.name, null))
	public eval2 = (): ValueWithLog2 => Writer.of(this)
	public infer = () => Val.tyAtom(this.name, null)
	public infer2 = () => this
	public print = () => this.name

	public isSameTo = (exp: Node) =>
		exp.type === 'tyAtom' && this.name === exp.name

	public isEqualTo = this.isSameTo

	public isSubtypeOf: (e: Value) => boolean = isSubtypeOfGeneric.bind(this)

	public of(value: T) {
		return Atom.from(this, value)
	}

	public static of(name: string, defaultValue: Atom) {
		const ty = new TyAtom(name, defaultValue)
		defaultValue.superType = ty
		return ty
	}
}

export const tyNum = TyAtom.of('Num', Num.of(0))
export const tyStr = TyAtom.of('Str', Str.of(''))

Num.prototype.superType = tyNum
Str.prototype.superType = tyStr

export class Enum implements INode, IValue {
	public readonly type = 'enum' as const
	public parent: Node | null = null
	public superType!: TyEnum

	private constructor(public readonly name: string) {}

	// TODO: Fix this
	public eval = (): ValueWithLog => Writer.of(Val.unit)
	public eval2 = (): ValueWithLog2 => Writer.of(this)
	// TODO: Fix this
	public infer = () => Val.unit
	public infer2 = () => this
	// TODO: fix this
	public print = () => this.name

	public isSameTo = (e: Node) =>
		e.type === 'enum' &&
		this.name === e.name &&
		this.superType.isSameTo(e.superType)

	public isEqualTo = this.isSameTo

	public isSubtypeOf = isSubtypeOfGeneric.bind(this)

	public static of(name: string) {
		return new Enum(name)
	}
}

export class TyEnum implements INode, IValue {
	public readonly type = 'tyEnum' as const
	public parent: Node | null = null
	public superType = All.instance
	public defaultValue!: Enum

	private constructor(
		public readonly name: string,
		public readonly types: Enum[]
	) {}

	// TODO: Fix this
	public eval = (): ValueWithLog => Writer.of(Val.unit)
	public eval2 = (): ValueWithLog2 => Writer.of(this)
	// TODO: Fix this
	public infer = () => Val.unit
	public infer2 = () => this
	// TODO: fix this
	public print = () => this.name

	public isSameTo = (e: Node) => e.type === 'tyEnum' && this.name === e.name

	public isEqualTo = this.isSameTo

	public isSubtypeOf = isSubtypeOfGeneric.bind(this)

	public getEnum = (label: string) => {
		const en = this.types.find(t => t.name === label)
		if (!en) throw new Error('Cannot find label')
		return en
	}

	public static of(name: string, labels: string[]) {
		if (labels.length === 0) throw new Error('Zero-length enum')

		const types = labels.map(Enum.of)
		const tyEnum = new TyEnum(name, types)
		tyEnum.defaultValue = types[0]
		types.forEach(t => (t.superType = tyEnum))

		return tyEnum
	}
}

export class TyVar implements INode, IValue {
	public readonly type = 'tyVar' as const
	public parent: Node | null = null
	public superType = All.instance

	private constructor(public name: string) {}

	public eval = (): ValueWithLog => Writer.of(Val.tyVar(this.name))
	public eval2 = (): ValueWithLog2 => Writer.of(this)
	public infer = () => Val.tyVar(this.name)
	public infer2 = () => this
	public print = () => '<' + this.name + '>'
	public isSameTo = (exp: Node) =>
		exp.type === 'tyVar' && this.name === exp.name

	public isEqualTo = this.isSameTo

	public isSubtypeOf = isSubtypeOfGeneric.bind(this)

	public static of(name: string) {
		return new TyVar(name)
	}
}

export class EFn implements INode {
	public readonly type = 'eFn' as const
	public parent: Node | null = null

	private constructor(public param: Record<string, Node>, public body: Node) {}

	public infer(env: Env = new Map()): Val.Value {
		const param = Writer.mapValues(this.param, p => p.eval(env)).result
		const paramDict = mapValues(param, p => Obj.asType(p))

		const innerEnv = new Map([...env.entries(), [this, paramDict]])
		const out = this.body.infer(innerEnv)

		return Val.tyFn(values(param), out)
	}

	// TODO: fix this
	public infer2 = () => Unit.of()

	public eval(env: Env = new Map()): ValueWithLog {
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
	public eval2 = (): ValueWithLog2 => Writer.of(Unit.of())

	public print(): string {
		const params = entries(this.param).map(([k, v]) => k + ':' + v.print())
		const param = params.length === 1 ? params[0] : '(' + params.join(' ') + ')'
		const body = this.body.print()

		return `(=> ${param} ${body})`
	}

	public isSameTo = (exp: Node) =>
		exp.type === 'eFn' &&
		hasEqualValues(this.param, exp.param, isSame) &&
		isSame(this.body, exp.body)

	public static of(param: Record<string, Node>, body: Node) {
		const fn = new EFn(param, body)
		values(param).forEach(p => (p.parent = fn))
		body.parent = fn
		return fn
	}
}

export class Fn implements INode, IValue, IFnLike {
	public readonly type = 'fn' as const
	public parent: Node | null = null

	private constructor(public superType: TyFn, public fn: IFn) {}

	// TODO: Fix this
	public eval = (): ValueWithLog => Writer.of(Val.unit)
	public eval2 = (): ValueWithLog2 => Writer.of(this)
	// TODO: Fix this
	public infer = () => Val.unit
	public infer2 = () => this
	// TODO: fix this
	public print = (): string => {
		const param = this.superType.printParam()
		const out = this.superType.out.print()
		return `(=> ${param} (js code):${out})`
	}

	public isSameTo = () => false
	public isEqualTo = () => false

	public isSubtypeOf = isSubtypeOfGeneric.bind(this)

	public static of(tyFn: TyFn, fn: IFn) {
		return new Fn(tyFn, fn)
	}
}

export class ETyFn implements INode {
	public readonly type = 'eTyFn' as const
	public parent: Node | null = null

	private constructor(public tyParam: Node[], public out: Node) {}

	public eval(env: Env = new Map()): ValueWithLog {
		const [param, l1] = Writer.map(this.tyParam, p => p.eval(env)).asTuple
		const [out, l2] = this.out.eval(env).asTuple
		const tyFn = Val.tyFn(param, out)
		return Writer.of(tyFn, ...l1, ...l2)
	}

	public eval2 = (env?: Env): ValueWithLog2 => {
		const [params, lp] = Writer.map(this.tyParam, p => p.eval2(env)).asTuple
		const [out, lo] = this.out.eval2(env).asTuple
		return Writer.of(TyFn.of(params, out), ...lp, ...lo)
	}

	public infer(env?: Env): Val.Value {
		const param = this.tyParam.map(p => p.infer(env))
		const out = this.out.infer(env)
		return Val.tyFn(param, out)
	}

	public infer2 = (env?: Env) => this.eval2(env).result

	public print(): string {
		let canOmitParens = this.tyParam.length === 1
		if (canOmitParens) {
			const fp = this.tyParam[0]
			const isFirstParamUnit = fp.type === 'obj' && fp.value.type === 'unit'
			canOmitParens = !isFirstParamUnit
		}

		const params = this.tyParam.map(p => p.print())
		const param = canOmitParens ? params[0] : '(' + params.join(' ') + ')'
		const out = this.out.print()

		return `(-> ${param} ${out})`
	}

	public isSameTo = (exp: Node): boolean =>
		exp.type === 'eTyFn' &&
		isEqualArray(this.tyParam, exp.tyParam, isSame) &&
		isSame(this.out, this.out)

	public static of(param: Node | Node[], out: Node) {
		const tyParam = [param].flat()
		const tyFn = new ETyFn(tyParam, out)
		tyParam.forEach(p => (p.parent = tyFn))
		out.parent = tyFn
		return tyFn
	}
}

export class TyFn implements INode, IValue {
	public readonly type = 'tyFn' as const
	public parent: Node | null = null
	public superType = All.instance

	private constructor(public param: Record<string, Value>, public out: Value) {}

	public printParam = () => {
		const pStr = entries(this.param).map(TyFn.printParamPair).join(' ')

		const names = keys(this.param)
		const canOmitParens =
			names.length === 1 && this.param[names[0]].type !== 'unit'

		return canOmitParens ? pStr : `(${pStr})`
	}

	// TODO: Fix this
	public eval = (): ValueWithLog => Writer.of(Val.unit)
	public eval2 = (): ValueWithLog2 => Writer.of(this)
	// TODO: Fix this
	public infer = () => Val.unit
	public infer2 = () => this

	public print = (): string => {
		return `(-> ${this.printParam()} ${this.out.print()})`
	}

	public isSameTo = (e: Node) =>
		e.type === 'tyFn' &&
		isEqualArray(values(this.param), values(e.param), isSame) &&
		isSame(this.out, e.out)

	public isEqualTo = this.isSameTo

	public isSubtypeOf = (e: Value): boolean => {
		if (this.superType.isSubtypeOf(e)) return true
		if (e.type === 'tyUnion') return e.isSupertypeOf(this)
		if (e.type !== 'tyFn') return false

		const tParam = Vec.of(...values(this.param))
		const eParam = Vec.of(...values(e.param))

		return isSubtype(eParam, tParam) && isSubtype(this.out, e.out)
	}

	private static printParamPair([name, ty]: [string, Value]) {
		if (/^\$[0-9]$/.test(name)) return ty
		return name + ':' + ty
	}

	public static of(param: Value | Value[], out: Value) {
		const paramArr = [param].flat()
		const pairs = paramArr.map((p, i) => ['$' + i, p])
		const paramDict = fromPairs(pairs)
		return new TyFn(paramDict, out)
	}
}

export class EVec implements INode {
	public readonly type = 'eVec' as const
	public parent: Node | null = null

	private constructor(public items: Node[], public rest: Node | null = null) {}

	public get length() {
		return this.items.length
	}

	public eval(env?: Env): ValueWithLog {
		const [items, li] = Writer.map(this.items, it => it.eval(env)).asTuple
		if (this.rest) {
			const [rest, lr] = this.rest.eval(env).asTuple
			return Writer.of(Val.vecFrom(items, rest), ...li, ...lr)
		}
		return Writer.of(Val.vecFrom(items), ...li)
	}

	public eval2 = (env?: Env): ValueWithLog2 => {
		const [items, li] = Writer.map(this.items, i => i.eval2(env)).asTuple
		if (this.rest) {
			const [rest, lr] = this.rest.eval2(env).asTuple
			return Writer.of(TyVec.of(items, rest), ...li, ...lr)
		} else {
			return Writer.of(Vec.of(...items), ...li)
		}
	}

	public infer(env?: Env): Val.Value {
		const items = this.items.map(it => it.infer(env))
		const rest = this.rest?.infer(env)
		if (rest) {
			return Val.tyValue(Val.vecFrom(items, rest))
		} else {
			return Val.vecFrom(items)
		}
	}

	// TODO: fix this
	public infer2 = () => Unit.of()

	public print(): string {
		const items = this.items.map(it => it.print())
		const rest = this.rest ? ['...' + this.rest.print()] : []
		return '[' + [...items, ...rest].join(' ') + ']'
	}

	public isSameTo = (exp: Node): boolean =>
		exp.type === 'eVec' &&
		isEqualArray(this.items, exp.items, isSame) &&
		nullishEqual(this.rest, this.rest, isSame)

	public static of(...items: Node[]) {
		const vec = new EVec(items)
		items.forEach(it => (it.parent = vec))
		return vec
	}

	public static from(items: Node[], rest: Node | null = null) {
		const vec = new EVec(items, rest)
		items.forEach(it => (it.parent = vec))
		if (rest) rest.parent = vec
		return vec
	}
}

export class Vec implements INode, IValue {
	public readonly type = 'vec' as const
	public readonly superType = All.instance
	public parent: Node | null = null

	private constructor(public items: Value[]) {}

	// TODO: Fix this
	public eval = (): ValueWithLog => Writer.of(Val.unit)
	public eval2 = (): ValueWithLog2 => Writer.of(this)
	// TODO: Fix this
	public infer = () => Val.unit
	public infer2 = () => this

	public print = (): string => {
		const items = this.items.map(print)
		return '[' + items.join(' ') + ']'
	}

	public isSameTo = (e: Node) =>
		e.type === 'vec' && isEqualArray(this.items, e.items, isSame)

	public isEqualTo = this.isSameTo

	public isSubtypeOf = (e: Value): boolean => {
		if (this.superType.isSubtypeOf(e)) return true
		if (e.type === 'tyUnion') return e.isSupertypeOf(this)

		if (e.type !== 'vec' && e.type !== 'tyVec') return false

		const isAllItemsSubtype =
			this.items.length >= e.items.length &&
			e.items.every((ei, i) => isSubtype(this.items[i], ei))

		const isRestSubtype =
			!('rest' in e) ||
			this.items.slice(e.items.length).every(ti => ti.isSubtypeOf(e.rest))

		return isAllItemsSubtype && isRestSubtype
	}

	public static of(...items: Value[]) {
		return new Vec(items)
	}
}

export class TyVec implements INode, IValue {
	public readonly type = 'tyVec' as const
	public readonly superType = All.instance
	public parent: Node | null = null

	private constructor(public items: Value[], public rest: Value) {}

	// TODO: Fix this
	public eval = (): ValueWithLog => Writer.of(Val.unit)
	public eval2 = (): ValueWithLog2 => Writer.of(this)
	// TODO: Fix this
	public infer = () => Val.unit
	public infer2 = () => this

	public print = (): string => {
		const items = this.items.map(print)
		return '[' + items.join(' ') + ']'
	}

	public isSameTo = (e: Node) =>
		e.type === 'tyVec' && isEqualArray(this.items, e.items, isSame)

	public isEqualTo = this.isSameTo

	public isSubtypeOf = (e: Value): boolean => {
		if (this.superType.isSubtypeOf(e)) return true
		if (e.type === 'tyUnion') return e.isSupertypeOf(this)

		if (e.type !== 'tyVec') return false

		const isAllItemsSubtype =
			this.items.length >= e.items.length &&
			e.items.every((ei, i) => isSubtype(this.items[i], ei))

		const isSurplusItemsSubtype = this.items
			.slice(e.items.length)
			.every(ti => ti.isSubtypeOf(e.rest))

		const isRestSubtype = isSubtype(this.rest, e.rest)

		return isAllItemsSubtype && isSurplusItemsSubtype && isRestSubtype
	}

	public static of(items: Value[], rest: Value) {
		return new TyVec(items, rest)
	}
}

export class EDict implements INode {
	public readonly type = 'eDict' as const
	public parent: Node | null = null

	private constructor(
		public items: Record<string, {optional?: boolean; value: Node}>,
		public rest?: Node
	) {}

	public infer(env?: Env): Val.Value {
		const items = mapValues(this.items, it => ({
			optional: it.optional,
			value: it.value.infer(env),
		}))
		const rest = this.rest?.infer(env)
		return Val.tyDict(items, rest)
	}

	public infer2 = (env?: Env): Value => {
		const items = mapValues(this.items, i => ({
			optional: i.optional,
			value: i.value.infer2(env),
		}))
		const rest = this.rest?.infer2(env)

		const noOptional = values(items).every(it => !it.optional)
		const noRest = !rest

		if (noOptional && noRest) {
			return Dict.of(mapValues(items, i => i.value))
		} else {
			return TyDict.of(items, rest)
		}
	}

	public eval(env?: Env): ValueWithLog {
		const [items, l] = Writer.mapValues(this.items, ({optional, value}) =>
			value.eval(env).fmap(value => ({optional, value}))
		).asTuple
		const [rest, lr] = this.rest ? this.rest.eval(env).asTuple : [undefined, []]
		return Writer.of(Val.tyDict(items, rest), ...l, ...lr)
	}

	public eval2(env?: Env): ValueWithLog2 {
		const [items, li] = Writer.mapValues(this.items, ({optional, value}) =>
			value.eval2(env).fmap(value => ({optional, value}))
		).asTuple
		const [rest, lr] = this.rest
			? this.rest.eval2(env).asTuple
			: [undefined, []]

		const noOptional = values(items).every(it => !it.optional)
		const noRest = !rest

		if (noOptional && noRest) {
			return Writer.of(Dict.of(mapValues(items, i => i.value)), ...li)
		} else {
			return Writer.of(TyDict.of(items, rest), ...li, ...lr)
		}
	}

	public print(): string {
		const items = entries(this.items).map(
			([k, v]) => k + (v.optional ? '?' : '') + ': ' + v.value.print()
		)
		const rest = this.rest ? ['...' + this.rest.print()] : []
		return '{' + [...items, ...rest].join(' ') + '}'
	}

	public isSameTo = (exp: Node): boolean =>
		exp.type === 'eDict' &&
		hasEqualValues(
			this.items,
			exp.items,
			(t, e) => !!t.optional === !!e.optional && isSame(t.value, e.value)
		)

	public static of(items: Record<string, Node>) {
		const its = mapValues(items, value => ({value}))
		return EDict.from(its)
	}

	public static from(
		items: Record<string, {optional?: boolean; value: Node}>,
		rest?: Node
	) {
		const dict = new EDict(items, rest)
		values(items).forEach(it => (it.value.parent = dict))
		if (rest) rest.parent = dict
		return dict
	}
}

export class Dict implements INode, IValue {
	public readonly type = 'dict' as const
	public parent: Node | null = null
	public superType = All.instance

	private constructor(public items: Record<string, Value>) {}

	// TODO: Fix this
	public eval = (): ValueWithLog => Writer.of(Val.unit)
	public eval2 = (): ValueWithLog2 => Writer.of(this)
	// TODO: Fix this
	public infer = () => Val.unit
	public infer2 = () => this

	public print = (): string => {
		const items = entries(this.items).map(([k, v]) => k + ':' + v.print())
		return '{' + items.join(' ') + '}'
	}

	public isSameTo = (e: Node) =>
		e.type === 'dict' && hasEqualValues(this.items, e.items, isSame)

	public isEqualTo = this.isSameTo

	public isSubtypeOf = (e: Value): boolean => {
		if (this.superType.isSubtypeOf(e)) return true
		if (e.type === 'tyUnion') return e.isSupertypeOf(this)
		if (!('asTyDictLike' in e)) return false

		return isSubtypeDict(this.asTyDictLike, e.asTyDictLike)
	}

	public get asTyDictLike(): TyDictLike {
		const items = mapValues(this.items, value => ({value}))
		return {items, rest: null}
	}

	public static of(items: Record<string, Value>) {
		return new Dict(items)
	}
}

export class TyDict implements INode, IValue {
	public readonly type = 'tyDict' as const
	public parent: Node | null = null
	public superType = All.instance

	private constructor(
		public items: Record<string, {optional?: boolean; value: Value}>,
		public rest: Value | null
	) {}

	// TODO: Fix this
	public eval = (): ValueWithLog => Writer.of(Val.unit)
	public eval2 = (): ValueWithLog2 => Writer.of(this)
	// TODO: Fix this
	public infer = () => Val.unit
	public infer2 = () => this

	public print = (): string => {
		const items = entries(this.items).map(([k, {optional, value}]) => {
			return k + (optional ? '?' : '') + ': ' + value.print()
		})
		const rest = this.rest ? ['...' + this.rest.print()] : []

		return '{' + [...items, ...rest].join(' ') + '}'
	}

	public isSameTo = (e: Node) =>
		e.type === 'tyDict' &&
		hasEqualValues(
			this.items,
			e.items,
			(ti, ei) => !!ti.optional === !!ei.optional && isSame(ti.value, ei.value)
		)

	public isEqualTo = this.isSameTo

	public isSubtypeOf = (e: Value): boolean => {
		if (this.superType.isSubtypeOf(e)) return true
		if (e.type === 'tyUnion') return e.isSupertypeOf(this)
		if (!('asTyDictLike' in e)) return false

		return isSubtypeDict(this, e.asTyDictLike)
	}

	public asTyDictLike: TyDictLike = this

	public static of(items: TyDict['items'], rest?: Value) {
		return new TyDict(items, rest ?? null)
	}
}

type TyDictLike = Pick<TyDict, 'items' | 'rest'>

function isSubtypeDict(s: TyDictLike, t: TyDictLike) {
	const tKeys = keys(t.items)

	for (const k of tKeys) {
		const tk = t.items[k]
		if (!tk.optional) {
			const sx =
				k in s.items ? (!s.items[k].optional ? s.items[k].value : null) : s.rest
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

export class Prod implements INode, IValue {
	public readonly type = 'prod' as const
	public parent: Node | null = null

	private constructor(public superType: TyProd, public items: Value[]) {}

	// TODO: Fix this
	public eval = (): ValueWithLog => Writer.of(Val.unit)
	public eval2 = (): ValueWithLog2 => Writer.of(this)
	// TODO: Fix this
	public infer = () => Val.unit
	public infer2 = () => this

	public print = (): string => {
		const ctor = this.superType.print()
		const items = this.items.map(it => it.print())
		return '(' + [ctor, ...items].join(' ') + ')'
	}

	public isSameTo = (e: Node) =>
		e.type === 'prod' &&
		this.superType.isSameTo(e.superType) &&
		isEqualArray(this.items, e.items, isSame)

	public isEqualTo = this.isSameTo

	public isSubtypeOf = isSubtypeOfGeneric.bind(this)
}

export class TyProd implements INode, IValue {
	public readonly type = 'tyProd' as const
	public parent: Node | null = null
	public superType = All.instance

	private constructor(
		public name: string,
		public param: Record<string, Value>
	) {}

	// TODO: Fix this
	public eval = (): ValueWithLog => Writer.of(Val.unit)
	public eval2 = (): ValueWithLog2 => Writer.of(this)
	// TODO: Fix this
	public infer = () => Val.unit
	public infer2 = () => this
	// TODO: Fix this
	public print = () => this.name

	public isSameTo = (e: Node) => e.type === 'tyProd' && this.name === e.name

	public isEqualTo = this.isSameTo

	public isSubtypeOf = isSubtypeOfGeneric.bind(this)
}

export class TyValue implements INode, IValue {
	public readonly type = 'tyValue' as const
	public parent: Node | null = null
	public superType = All.instance

	private constructor(
		public value: Bottom | TyVec | TyUnion | TyAtom | TyVar | TyEnum | TyProd
	) {}

	// TODO: Fix this
	public eval = (): ValueWithLog => Writer.of(Val.unit)
	public eval2 = (): ValueWithLog2 => Writer.of(this)
	// TODO: Fix this
	public infer = () => Val.unit
	public infer2 = () => this
	public print = () => this.value.print()

	public isSameTo = (e: Node): boolean =>
		e.type === 'tyValue' && this.isSameTo(e)

	public isEqualTo = this.isSameTo

	public isSubtypeOf = isSubtypeOfGeneric.bind(this)
}

export class TyUnion implements INode, IValue {
	public readonly type = 'tyUnion' as const
	public parent: Node | null = null
	public superType = All.instance

	private constructor(public types: UnitableType[]) {}

	// TODO: Fix this
	public eval = (): ValueWithLog => Writer.of(Val.unit)
	public eval2 = (): ValueWithLog2 => Writer.of(this)
	// TODO: Fix this
	public infer = () => Val.unit
	public infer2 = () => this

	public print = (): string => {
		const types = this.types.map(t => t.print()).join(' ')
		return `(| ${types})`
	}

	public isEqualTo = (e: Node): boolean =>
		e.type === 'tyUnion' &&
		differenceWith(this.types, e.types, isEqual).length === 0

	public isSameTo = this.isEqualTo

	public isSubtypeOf = (e: Value): boolean => {
		if (this.superType.isSubtypeOf(e)) return true

		const types: Value[] = e.type === 'tyUnion' ? e.types : [e]
		return this.types.every(s => types.some(s.isSubtypeOf))
	}

	public isSupertypeOf = (s: Exclude<Value, TyUnion>) =>
		this.types.some(s.isSubtypeOf)
}

export class App implements INode {
	public readonly type = 'app' as const
	public parent: Node | null = null

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

	public eval(env?: Env): ValueWithLog {
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

	// TODO: fix this
	public eval2 = (): ValueWithLog2 => Writer.of(Unit.of())

	public infer(env?: Env): Val.Value {
		const [tyFn] = this.inferFn(env)
		return unshadowTyVars(tyFn.tyOut)
	}

	// TODO: fix this
	public infer2 = () => Unit.of()

	public print(): string {
		const fn = this.fn.print()
		const args = this.args.map(a => a.print())

		return '(' + [fn, ...args].join(' ') + ')'
	}

	public isSameTo = (exp: Node) =>
		exp.type === 'app' && isEqualArray(this.args, exp.args, isSame)

	public static of(fn: Node, ...args: Node[]) {
		const app = new App(fn, args)
		fn.parent = app
		args.forEach(a => (a.parent = app))
		return app
	}
}

export class Scope implements INode {
	public readonly type = 'scope' as const
	public parent: Node | null = null

	private constructor(
		public vars: Record<string, Node>,
		public out: Node | null = null
	) {}

	public infer(env?: Env): Val.Value {
		return this.out ? this.out.infer(env) : Val.bottom
	}

	public infer2 = (env?: Env): Value => this.out?.infer2(env) ?? Unit.of()

	public eval(env?: Env): ValueWithLog {
		return this.out ? this.out.eval(env) : Writer.of(Val.bottom)
	}

	public eval2 = (env?: Env): ValueWithLog2 =>
		this.out?.eval2(env) ?? Writer.of(Unit.of())

	public print(): string {
		const vars = entries(this.vars).map(([k, v]) => k + '=' + v.print())
		const out = this.out ? [this.out.print()] : []

		return '{' + [...vars, ...out].join(' ') + '}'
	}

	public isSameTo = (exp: Node) =>
		exp.type === 'scope' &&
		nullishEqual(this.out, exp.out, isSame) &&
		hasEqualValues(this.vars, exp.vars, isSame)

	public extend(vars: Record<string, Node>, out: Node | null = null): Scope {
		const scope = new Scope(vars, out)
		scope.parent = this
		return scope
	}

	public def(name: string, exp: Node) {
		if (name in this.vars)
			throw new Error(`Variable '${name}' is already defined`)

		exp.parent = this
		this.vars[name] = exp

		return this
	}

	public defs(vars: Record<string, Node>) {
		for (const [name, exp] of entries(vars)) {
			this.def(name, exp)
		}
	}

	public static of(vars: Record<string, Node>, out: Node | null = null) {
		const scope = new Scope(vars, out)
		values(vars).forEach(v => (v.parent = scope))
		if (out) out.parent = scope
		return scope
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

export function print(n: Node) {
	return n.print()
}
