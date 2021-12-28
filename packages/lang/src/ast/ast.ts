import {entries, forOwn, fromPairs, keys, mapValues, values} from 'lodash'

import {Log, WithLog, withLog} from '../log'
import {isEqualArray} from '../utils/isEqualArray'
import {isEqualDict} from '../utils/isEqualDict'
import {nullishEqual} from '../utils/nullishEqual'
import {union} from '../utils/SetOperation'
import {Writer} from '../utils/Writer'
import {zip} from '../utils/zip'
import * as Val from '../val'
import {Env} from './env'
import {getTyVars, RangedUnifier, shadowTyVars, unshadowTyVars} from './unify'

export type Node = Literal | Exp
export type Literal = Sym | Obj | LUnit | LAll | LBottom | LNum | LStr

export type Exp = Call | Scope | EFn | ETyFn | EVec | EDict

abstract class BaseNode {
	abstract readonly type: string
	parent: Node | null = null

	protected constructor() {
		return this
	}

	abstract print(): string
	abstract eval(env?: Env): WithLog
	abstract infer(env?: Env): WithLog
	abstract isSameTo(ast: Node): boolean

	getLog = () => this.eval().log
}

export class Sym extends BaseNode {
	readonly type = 'sym' as const

	private constructor(public name: string) {
		super()
	}

	#resolve(
		ref: Node | null,
		env?: Env
	): Writer<{node: Node; mode?: 'param' | 'arg' | 'tyVar'}, Log> {
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
				return Writer.of({node: Obj.of(ref.tyVars[this.name]), mode: 'tyVar'})
			}
		}

		// Resolve with parent node recursively
		return this.#resolve(ref.parent, env)
	}

	eval = (env?: Env): WithLog => {
		return this.#resolve(this.parent, env).bind(({node, mode}) => {
			const value = node.eval(env)

			return mode === 'param'
				? withLog(value.result.defaultValue, ...value.log)
				: value
		})
	}

	infer = (env?: Env): WithLog => {
		const {node, mode} = this.#resolve(this.parent, env).result

		if (mode) {
			// In cases such as inferring `x` in `(=> [x:(+ 1 2)] x)`,
			// The type of parameter `(+ 1 2)` needs to be *evaluated*
			return node.eval(env)
		} else {
			// othersise, infer it as usual
			return node.infer(env)
		}
	}

	print = () => this.name

	isSameTo = (ast: Node) => ast.type === 'sym' && this.name === ast.name

	static of(name: string) {
		return new Sym(name)
	}
}

export class Obj<V extends Val.Value = Val.Value> extends BaseNode {
	readonly type = 'obj' as const

	private constructor(public readonly value: V) {
		super()
	}

	eval = () => withLog(this.value)
	infer = () => withLog(this.value.isType ? Val.all : this.value)

	print = () => {
		const ast = this.value.toAst()
		if (ast.type !== 'obj') return ast.print()
		return `<object of ${this.value.type}>`
	}

	isSameTo = (ast: Node) => this.type === ast.type && this.value === ast.value

	static of<V extends Val.Value = Val.Value>(value: V) {
		return new Obj(value)
	}
}

export class LUnit extends BaseNode {
	readonly type = 'lUnit' as const

	eval = () => withLog(Val.unit)
	infer = this.eval
	print = () => '()'
	isSameTo = (ast: Node) => this.type === ast.type

	static of() {
		return new LUnit()
	}
}

export class LAll extends BaseNode {
	readonly type = 'lAll' as const

	eval = () => withLog(Val.all)
	infer = this.eval
	print = () => '_'
	isSameTo = (ast: Node) => this.type === ast.type

	static of() {
		return new LAll()
	}
}

export class LBottom extends BaseNode {
	readonly type = 'lBottom' as const

	eval = () => withLog(Val.bottom)
	infer = () => withLog(Val.all)
	print = () => '_|_'
	isSameTo = (ast: Node) => this.type === ast.type

	static of() {
		return new LBottom()
	}
}

export class LNum extends BaseNode {
	readonly type = 'lNum' as const

	private constructor(public readonly value: number) {
		super()
	}

	eval = () => withLog(Val.num(this.value))
	infer = this.eval
	print = () => this.value.toString()
	isSameTo = (ast: Node) => this.type === ast.type && this.value === ast.value

	static of(value: number) {
		return new LNum(value)
	}
}

export class LStr extends BaseNode {
	readonly type = 'lStr' as const

	private constructor(public readonly value: string) {
		super()
	}

	eval = () => withLog(Val.str(this.value))
	infer = this.eval
	print = () => '"' + this.value + '"'
	isSameTo = (ast: Node) => this.type === ast.type && this.value === ast.value

	static of(value: string) {
		return new LStr(value)
	}
}

export class EFn extends BaseNode {
	readonly type = 'eFn' as const

	readonly tyVars: Record<string, Val.TyVar>

	private constructor(
		tyVars: string[],
		public param: Record<string, Node>,
		public body: Node
	) {
		super()

		this.tyVars = fromPairs(tyVars.map(name => [name, Val.tyVar(name)]))
	}

	eval = (env?: Env): WithLog => {
		const names = keys(this.param)

		const fn: Val.IFn = (...args: Val.Value[]) => {
			const objs = args.map(Obj.of)
			const arg = fromPairs(zip(names, objs))
			const innerEnv = env ? env.push(arg) : Env.from(arg)
			return this.body.eval(innerEnv)
		}

		const [ty, lty] = this.infer(env).asTuple

		const fnVal = Val.fnFrom(ty, fn, this.body)
		fnVal.env = env

		return withLog(fnVal, ...lty)
	}

	infer = (env?: Env): WithLog<Val.TyFn> => {
		const [param, lp] = Writer.mapValues(this.param, p => p.eval(env)).asTuple

		const innerEnv = env ? env.push(this.param) : Env.from(this.param)

		const [out, lo] = this.body.infer(innerEnv).asTuple

		return withLog(Val.tyFnFrom(param, out), ...lp, ...lo)
	}

	print = (): string => {
		const tyVars = printTyVars(this.tyVars)
		const params = entries(this.param).map(([k, v]) => k + ':' + v.print())
		const param = '[' + params.join(' ') + ']'
		const body = this.body.print()

		return `(=> ${tyVars}${param} ${body})`
	}

	isSameTo = (ast: Node) =>
		ast.type === 'eFn' &&
		isEqualArray(keys(this.tyVars), keys(ast.tyVars)) &&
		isEqualDict(this.param, ast.param, isSame) &&
		isSame(this.body, ast.body)

	static of(tyVars: string[], param: EFn['param'], body: Node) {
		const fn = new EFn(tyVars, param, body)
		values(param).forEach(p => setParent(p, fn))
		setParent(body, fn)
		return fn
	}
}

export class ETyFn extends BaseNode {
	readonly type = 'eTyFn' as const

	tyVars: Record<string, Val.TyVar>

	private constructor(
		tyVars: string[],
		public param: Record<string, Node>,
		public out: Node
	) {
		super()

		this.tyVars = fromPairs(tyVars.map(name => [name, Val.tyVar(name)]))
	}

	eval = (env?: Env): WithLog => {
		const [params, lp] = Writer.mapValues(this.param, p => p.eval(env)).asTuple
		const [out, lo] = this.out.eval(env).asTuple
		return withLog(Val.tyFnFrom(params, out), ...lp, ...lo)
	}

	infer = () => withLog(Val.all)

	print = (): string => {
		const tyVars = printTyVars(this.tyVars)
		const param = entries(this.param).map(printNamedNode).join(' ')
		const out = this.out.print()
		return `(-> ${tyVars}[${param}] ${out})`
	}

	isSameTo = (ast: Node): boolean =>
		ast.type === 'eTyFn' &&
		isEqualArray(keys(this.tyVars), keys(ast.tyVars)) &&
		isEqualDict(this.param, ast.param, isSame) &&
		isSame(this.out, this.out)

	static of(tyVars: string[], param: Node | Node[], out: Node) {
		const paramArr = [param].flat()
		const pairs = paramArr.map((p, i) => [i, p] as const)
		const paramDict = Object.fromEntries(pairs)

		const tyFn = new ETyFn(tyVars, paramDict, out)

		paramArr.forEach(p => setParent(p, tyFn))
		setParent(out, tyFn)

		return tyFn
	}

	static from(tyVars: string[], param: Record<string, Node>, out: Node) {
		const tyFn = new ETyFn(tyVars, param, out)
		forOwn(param, p => setParent(p, tyFn))
		setParent(out, tyFn)
		return tyFn
	}
}

function printTyVars(tyVars: Record<string, Val.TyVar>): string {
	const es = keys(tyVars)
	if (es.length === 0) return ''
	return '<' + es.join(' ') + '> '
}

function printNamedNode([name, ty]: [string, Node]) {
	if (/^[0-9]+$/.test(name)) return ty.print()
	return name + ':' + ty.print()
}

export class EVec extends BaseNode {
	readonly type = 'eVec' as const

	private constructor(public items: Node[], public rest: Node | null = null) {
		super()
	}

	get length() {
		return this.items.length
	}

	eval = (env?: Env): WithLog => {
		const [items, li] = Writer.map(this.items, i => i.eval(env)).asTuple
		if (this.rest) {
			const [rest, lr] = this.rest.eval(env).asTuple
			return withLog(Val.tyVec(items, rest), ...li, ...lr)
		} else {
			return withLog(Val.vec(...items), ...li)
		}
	}

	infer = (env?: Env): WithLog => {
		if (this.rest) return withLog(Val.all)
		const [items, log] = Writer.map(this.items, it => it.infer(env)).asTuple
		return withLog(Val.vec(...items), ...log)
	}

	print = (): string => {
		const items = this.items.map(it => it.print())
		const rest = this.rest ? ['...' + this.rest.print()] : []
		return '[' + [...items, ...rest].join(' ') + ']'
	}

	isSameTo = (ast: Node): boolean =>
		ast.type === 'eVec' &&
		isEqualArray(this.items, ast.items, isSame) &&
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

export class EDict extends BaseNode {
	readonly type = 'eDict' as const

	private constructor(
		public items: Record<string, {optional?: boolean; value: Node}>,
		public rest?: Node
	) {
		super()
	}

	infer = (): WithLog => {
		if (this.rest) return withLog(Val.all)
		const items: Val.Dict['items'] = {}
		const logs: Log[] = []
		for (const [key, {optional, value}] of entries(this.items)) {
			if (optional) return withLog(Val.all)
			const [inferred, l] = value.infer().asTuple
			items[key] = inferred
			logs.push(...l)
		}
		return withLog(Val.dict(items), ...logs)
	}

	eval = (env?: Env): WithLog => {
		const [items, li] = Writer.mapValues(this.items, ({optional, value}) =>
			value.eval(env).fmap(value => ({optional, value}))
		).asTuple
		const [rest, lr] = this.rest ? this.rest.eval(env).asTuple : [undefined, []]

		return withLog(Val.tyDict(items, rest), ...li, ...lr)
	}

	print = (): string => {
		const items = entries(this.items).map(
			([k, v]) => k + (v.optional ? '?' : '') + ': ' + v.value.print()
		)
		const rest = this.rest ? ['...' + this.rest.print()] : []
		return '{' + [...items, ...rest].join(' ') + '}'
	}

	isSameTo = (ast: Node): boolean =>
		ast.type === 'eDict' &&
		isEqualDict(
			this.items,
			ast.items,
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

export class Call extends BaseNode {
	readonly type = 'call' as const

	private constructor(public fn: Node, public args: Node[]) {
		super()
	}

	#unifyFn(env?: Env): [RangedUnifier, Val.Value[]] {
		const ty = this.fn.infer(env).result

		if (!('tyFn' in ty)) return [RangedUnifier.empty(), []]

		const tyFn = ty.tyFn

		const params = values(tyFn.param)

		const shadowedArgs = this.args
			.slice(0, params.length)
			.map(a => shadowTyVars(a.infer(env).result))

		const subst = RangedUnifier.unify([
			Val.vec(...params),
			'>=',
			Val.vec(...shadowedArgs),
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
			const aTy = unifiedArgs[i] ?? Val.unit
			const name = names[i]

			if (!Val.isSubtype(aTy, pTy)) {
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
		let result: Val.Value, callLog: Log[]
		if ('body' in fn && fn.body) {
			const arg: Record<string, Val.Value> = fromPairs(zip(names, args))

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

	infer = (env?: Env): WithLog => {
		const [ty] = this.fn.infer(env).asTuple
		if (!('tyFn' in ty)) return withLog(ty)

		if (ty.type === 'fn' && ty.isTypeCtor) {
			return this.eval(env)
		}

		const [subst] = this.#unifyFn(env)
		return withLog(unshadowTyVars(subst.substitute(ty.tyFn.out)))
	}

	print = (): string => {
		const fn = this.fn.print()
		const args = this.args.map(a => a.print())

		return '(' + [fn, ...args].join(' ') + ')'
	}

	isSameTo = (ast: Node) =>
		ast.type === 'call' && isEqualArray(this.args, ast.args, isSame)

	static of(fn: Node, ...args: Node[]) {
		const app = new Call(fn, args)
		setParent(fn, app)
		args.forEach(a => setParent(a, app))
		return app
	}
}

export class Scope extends BaseNode {
	readonly type = 'scope' as const

	private constructor(
		public vars: Record<string, Node>,
		public out: Node | null = null
	) {
		super()
	}

	infer = (env?: Env): WithLog => this.out?.infer(env) ?? withLog(Val.unit)

	eval = (env?: Env): WithLog => this.out?.eval(env) ?? Writer.of(Val.unit)

	print = (): string => {
		const vars = entries(this.vars).map(([k, v]) => k + ' = ' + v.print())
		const out = this.out ? [this.out.print()] : []

		return '(let ' + [...vars, ...out].join(' ') + ')'
	}

	isSameTo = (ast: Node) =>
		ast.type === 'scope' &&
		nullishEqual(this.out, ast.out, isSame) &&
		isEqualDict(this.vars, ast.vars, isSame)

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

export function setParent(exp: Node, parent: Node) {
	if ('parent' in exp) {
		exp.parent = parent
	}
}

export function isSame(a: Node, b: Node): boolean {
	return a.isSameTo(b)
}

export function print(n: Node) {
	return n.print()
}
