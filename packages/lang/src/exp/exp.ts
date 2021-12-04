import {entries, fromPairs, keys, mapValues, values} from 'lodash'

import {hasEqualValues} from '../utils/hasEqualValues'
import {isEqualArray} from '../utils/isEqualArray'
import {nullishEqual} from '../utils/nullishEqual'
import {Writer} from '../utils/Writer'
import {zip} from '../utils/zip'
import * as Val from '../val'
import {RangedUnifier, shadowTyVars, unshadowTyVars} from './unify'

export type Node =
	| Sym
	| Obj
	| Value
	| TyVar
	| Fn
	| TyFn
	| Vec
	| Dict
	| App
	| Scope

type Value =
	| All
	| Bottom
	| Unit
	| Num
	| Str
	| Atom
	| TyAtom
	| Enum
	| TyEnum
	| Prod
	| TyProd

export interface Log {
	level: 'error' | 'warn' | 'info'
	reason: string
	ref?: Node
}

export type ValueWithLog = Writer<Val.Value, Log>
export type NodeWithLog = Writer<Node, Log>

interface INode {
	readonly type: string
	parent: Node | null

	eval(env?: Env): ValueWithLog
	infer(env?: Env): Val.Value
	print(): string

	isSameTo(exp: Node): boolean
}

interface IValue {
	isEqualTo(e: Node): boolean
	isSubtypeOf(e: Value): boolean
}

type Env = Map<Fn, Record<string, Node>>

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
			if (env && ref.type === 'fn') {
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

	public infer(env?: Env): Val.Value {
		return this.resolve(env).result.infer(env)
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

	public infer(): Val.Value {
		if (this.asType === false && Val.isTy(this.value)) {
			return Val.tyValue(this.value)
		}
		return this.value
	}

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
	public infer = () => Val.all
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
	public infer = () => Val.bottom
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
	public infer = () => Val.unit
	public print = () => '()'
	public isSameTo = (exp: Node) => exp.type === 'unit'
	public isEqualTo = this.isSameTo
	public isSubtypeOf = (e: Node) =>
		this.isEqualTo(e) || this.superType.isEqualTo(e)

	public static of = () => new Unit()
}

export class Num implements INode {
	public readonly type = 'num' as const
	public parent: Node | null = null

	private constructor(public value: number) {}

	public eval = (): ValueWithLog => Writer.of(Val.num(this.value))
	public infer = () => Val.num(this.value)
	public print = () => this.value.toString()
	public isSameTo = (exp: Node) =>
		exp.type === 'num' && this.value === exp.value

	public static of(value: number) {
		return new Num(value)
	}
}

export class Str implements INode {
	public readonly type = 'str' as const
	public parent: Node | null = null

	private constructor(public value: string) {}

	public eval = (): ValueWithLog => Writer.of(Val.str(this.value))
	public infer = () => Val.str(this.value)
	public print = () => this.value.toString()
	public isSameTo = (exp: Node) =>
		exp.type === 'str' && this.value === exp.value

	public static of(value: string) {
		return new Str(value)
	}
}

export class Atom<T = any> implements INode, IValue {
	public readonly type = 'atom' as const
	public parent: Node | null = null

	private constructor(public superType: TyAtom, public value: T) {}

	// TODO: Fix this
	public eval = (): ValueWithLog => Writer.of(Val.unit)
	// TODO: Fix this
	public infer = () => Val.unit
	public print = () => `<instance of ${this.superType.print()}>`

	public isSameTo = (exp: Node) =>
		exp.type === 'atom' && this.superType === exp.superType

	public isEqualTo = () => false

	public isSubtypeOf = (e: Value) => this.superType.isSubtypeOf(e)
}

export class TyAtom implements INode, IValue {
	public readonly type = 'tyAtom' as const
	public parent: Node | null = null
	public superType = All.instance

	private constructor(
		private readonly name: string,
		public defaultValue: Num | Str
	) {}

	// TODO: fix this
	public eval = (): ValueWithLog => Writer.of(Val.tyAtom(this.name, null))
	public infer = () => Val.tyAtom(this.name, null)
	public print = () => this.name

	public isSameTo = (exp: Node) =>
		exp.type === 'tyAtom' && this.name === exp.name

	public isEqualTo = this.isSameTo

	public isSubtypeOf = (e: Node) =>
		this.isEqualTo(e) || this.superType.isSubtypeOf(e)

	public static ofLiteral(name: string, defaultValue: Num | Str) {
		return new TyAtom(name, defaultValue)
	}
}

export class Enum implements INode, IValue {
	public readonly type = 'enum' as const
	public parent: Node | null = null
	public superType!: TyEnum

	private constructor(public readonly name: string) {}

	// TODO: Fix this
	public eval = (): ValueWithLog => Writer.of(Val.unit)
	// TODO: Fix this
	public infer = () => Val.unit
	// TODO: fix this
	public print = () => this.name

	public isSameTo = (e: Node) =>
		e.type === 'enum' &&
		this.name === e.name &&
		this.superType.isSameTo(e.superType)

	public isEqualTo = this.isSameTo

	public isSubtypeOf = (e: Node) =>
		this.isEqualTo(e) || this.superType.isSubtypeOf(e)
}

export class TyEnum implements INode, IValue {
	public readonly type = 'tyEnum' as const
	public parent: Node | null = null
	public superType = All.instance

	private constructor(
		public readonly name: string,
		public readonly types: Enum[]
	) {}

	// TODO: Fix this
	public eval = (): ValueWithLog => Writer.of(Val.unit)
	// TODO: Fix this
	public infer = () => Val.unit
	// TODO: fix this
	public print = () => this.name

	public isSameTo = (e: Node) => e.type === 'tyEnum' && this.name === e.name

	public isEqualTo = this.isSameTo

	public isSubtypeOf = (e: Node) =>
		this.isEqualTo(e) || this.superType.isSubtypeOf(e)
}

export class TyVar implements INode, IValue {
	public readonly type = 'tyVar' as const
	public parent: Node | null = null
	public superType = All.instance

	private constructor(public name: string) {}

	public eval = (): ValueWithLog => Writer.of(Val.tyVar(this.name))
	public infer = () => Val.tyVar(this.name)
	public print = () => '<' + this.name + '>'
	public isSameTo = (exp: Node) =>
		exp.type === 'tyVar' && this.name === exp.name

	public isEqualTo = this.isSameTo

	public isSubtypeOf = (e: Node) =>
		this.isEqualTo(e) || this.superType.isSubtypeOf(e)

	public static of(name: string) {
		return new TyVar(name)
	}
}

export class Fn implements INode {
	public readonly type = 'fn' as const
	public parent: Node | null = null

	private constructor(public param: Record<string, Node>, public body: Node) {}

	public infer(env: Env = new Map()): Val.Value {
		const param = Writer.mapValues(this.param, p => p.eval(env)).result
		const paramDict = mapValues(param, p => Obj.asType(p))

		const innerEnv = new Map([...env.entries(), [this, paramDict]])
		const out = this.body.infer(innerEnv)

		return Val.tyFn(values(param), out)
	}

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

	public print(): string {
		const params = entries(this.param).map(([k, v]) => k + ':' + v.print())
		const param = params.length === 1 ? params[0] : '(' + params.join(' ') + ')'
		const body = this.body.print()

		return `(=> ${param} ${body})`
	}

	public isSameTo = (exp: Node) =>
		exp.type === 'fn' &&
		hasEqualValues(this.param, exp.param, isSame) &&
		isSame(this.body, exp.body)

	public static of(param: Record<string, Node>, body: Node) {
		const fn = new Fn(param, body)
		values(param).forEach(p => (p.parent = fn))
		body.parent = fn
		return fn
	}
}

export class TyFn implements INode {
	public readonly type = 'tyFn' as const
	public parent: Node | null = null

	private constructor(public tyParam: Node[], public out: Node) {}

	public eval(env: Env = new Map()): ValueWithLog {
		const [param, l1] = Writer.map(this.tyParam, p => p.eval(env)).asTuple
		const [out, l2] = this.out.eval(env).asTuple
		const tyFn = Val.tyFn(param, out)
		return Writer.of(tyFn, ...l1, ...l2)
	}

	public infer(env?: Env): Val.Value {
		const param = this.tyParam.map(p => p.infer(env))
		const out = this.out.infer(env)
		return Val.tyFn(param, out)
	}

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
		exp.type === 'tyFn' &&
		isEqualArray(this.tyParam, exp.tyParam, isSame) &&
		isSame(this.out, this.out)

	public static of(param: Node | Node[], out: Node) {
		const tyParam = [param].flat()
		const tyFn = new TyFn(tyParam, out)
		tyParam.forEach(p => (p.parent = tyFn))
		out.parent = tyFn
		return tyFn
	}
}

export class Vec implements INode {
	public readonly type = 'vec' as const
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

	public infer(env?: Env): Val.Value {
		const items = this.items.map(it => it.infer(env))
		const rest = this.rest?.infer(env)
		if (rest) {
			return Val.tyValue(Val.vecFrom(items, rest))
		} else {
			return Val.vecFrom(items)
		}
	}

	public print(): string {
		const items = this.items.map(it => it.print())
		const rest = this.rest ? ['...' + this.rest.print()] : []
		return '[' + [...items, ...rest].join(' ') + ']'
	}

	public isSameTo = (exp: Node): boolean =>
		exp.type === 'vec' &&
		isEqualArray(this.items, exp.items, isSame) &&
		nullishEqual(this.rest, this.rest, isSame)

	public static of(...items: Node[]) {
		const vec = new Vec(items)
		items.forEach(it => (it.parent = vec))
		return vec
	}

	public static from(items: Node[], rest: Node | null = null) {
		const vec = new Vec(items, rest)
		items.forEach(it => (it.parent = vec))
		if (rest) rest.parent = vec
		return vec
	}
}

export class Dict implements INode {
	public readonly type = 'dict' as const
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

	public eval(env?: Env): ValueWithLog {
		const [items, l] = Writer.mapValues(this.items, ({optional, value}) =>
			value.eval(env).fmap(value => ({optional, value}))
		).asTuple
		const [rest, lr] = this.rest ? this.rest.eval(env).asTuple : [undefined, []]
		return Writer.of(Val.tyDict(items, rest), ...l, ...lr)
	}

	public print(): string {
		const items = entries(this.items).map(
			([k, v]) => k + (v.optional ? '?' : '') + ': ' + v.value.print()
		)
		const rest = this.rest ? ['...' + this.rest.print()] : []
		return '{' + [...items, ...rest].join(' ') + '}'
	}

	public isSameTo = (exp: Node): boolean =>
		exp.type === 'dict' &&
		hasEqualValues(
			this.items,
			exp.items,
			(t, e) => !!t.optional === !!e.optional && isSame(t.value, e.value)
		)

	public static of(items: Record<string, Node>) {
		const its = mapValues(items, value => ({value}))
		return Dict.from(its)
	}

	public static from(
		items: Record<string, {optional?: boolean; value: Node}>,
		rest?: Node
	) {
		const dict = new Dict(items, rest)
		values(items).forEach(it => (it.value.parent = dict))
		if (rest) rest.parent = dict
		return dict
	}
}

export class Prod implements INode, IValue {
	public readonly type = 'prod' as const
	public parent: Node | null = null

	private constructor(public superType: TyProd, public items: Value[]) {}

	// TODO: Fix this
	public eval = (): ValueWithLog => Writer.of(Val.unit)
	// TODO: Fix this
	public infer = () => Val.unit

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

	public isSubtypeOf = (e: Node) =>
		this.isEqualTo(e) || this.superType.isEqualTo(e)
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
	// TODO: Fix this
	public infer = () => Val.unit
	// TODO: Fix this
	public print = () => this.name

	public isSameTo = (e: Node) => e.type === 'tyProd' && this.name === e.name

	public isEqualTo = this.isSameTo

	public isSubtypeOf = (e: Node) =>
		this.isEqualTo(e) || this.superType.isSubtypeOf(e)
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

	public infer(env?: Env): Val.Value {
		const [tyFn] = this.inferFn(env)
		return unshadowTyVars(tyFn.tyOut)
	}

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

	public eval(env?: Env): ValueWithLog {
		return this.out ? this.out.eval(env) : Writer.of(Val.bottom)
	}

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
