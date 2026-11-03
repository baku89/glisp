/**
 * `expand(ast, env)`: one step down the abstraction ladder.
 *
 * A call to a Glisp closure steps to the closure's body with the
 * parameters replaced by the argument expressions. The body is the next
 * rung, so `circle` defined in terms of `ellipse` expands to `ellipse`.
 *
 * `~expr` in the body marks an implementation detail: it is worked out
 * within this step, so its intermediate forms never appear on the ladder.
 * Only what is needed gets computed. A condition of `?` or an argument to
 * a host function is forced, while an argument that is merely passed along
 * stays as written:
 *
 *   pow = (=> (x: number a: number): number (* ...~(repeat x a)))
 *   (pow (+ 1 1) (+ 1 2))  →  (* (+ 1 1) (+ 1 1) (+ 1 1))
 *
 * A host function can say what its calls expand to with `withExpansion`.

`~` never changes the final value, only where the rungs fall. See
 * docs/spec/eval.md (Multi-step evaluation / Abstraction ladder).
 */

import {
	evaluate,
	type GlispClosure,
	type HostExpansion,
	isGlispClosure,
	isTypedHostFn,
	lookupBareName,
	matchValue,
	toAst,
	type TypedHostFn,
} from './eval.js'
import { freeRefs } from './resolve.js'
import {
	AccessAST,
	type AST,
	CallAST,
	type Env,
	FnAST,
	type FnParam,
	HostAST,
	LetAST,
	LitAST,
	MetaAST,
	RecordAST,
	type RecordEntry,
	SpreadAST,
	SymAST,
	UNIT,
	UnquoteAST,
	VecAST,
} from './types.js'

/**
 * Iterate `expand` from `ast` until a fixed point is reached. Returns the
 * sequence of intermediate ASTs (the "abstraction ladder" per
 * docs/spec/eval.md), starting with the input. The last entry is always
 * the fixed point: calling `expand` again yields the same node.
 *
 * `maxSteps` guards against pathologically slow but non-cyclic expansion.
 * Defaults to 64.
 */
export function expandLadder(
	ast: AST,
	env: Env,
	options?: { readonly maxSteps?: number }
): ReadonlyArray<AST> {
	const max = options?.maxSteps ?? 64
	const ladder: AST[] = [ast]
	let current = ast
	for (let i = 0; i < max; i++) {
		const next = expand(current, env)
		if (next === current) break
		ladder.push(next)
		current = next
	}
	return ladder
}

/**
 * Convenience: same as `expandLadder(ast, env).at(-1)`, only the
 * fully-expanded fixed point.
 */
export function expandAll(
	ast: AST,
	env: Env,
	options?: { readonly maxSteps?: number }
): AST {
	const ladder = expandLadder(ast, env, options)
	return ladder[ladder.length - 1]!
}

/** Forms with custom dispatch, which have no body to step into. */
const NON_EXPANDING = new Set(['|>', ':', 'overload'])

/**
 * One step of expansion. A closure call steps to its body, `?` steps to its
 * selected clause, and a name steps to what it is bound to. Anything else,
 * including a host function call, is a fixed point: its only remaining rung
 * is its value, from `evaluate`.
 *
 * A `~` that recurses without end leaves the call unexpanded, in keeping
 * with the rule that evaluation never throws on user errors.
 */
export function expand(ast: AST, env: Env): AST {
	if (ast.kind === 'sym') return expandName(ast, env)
	if (ast.kind !== 'call') return ast
	if (ast.head.kind === 'sym' && NON_EXPANDING.has(ast.head.name)) return ast
	try {
		return new Step(env).callStep(ast) ?? ast
	} catch (e) {
		if (e instanceof RangeError) return ast
		throw e
	}
}

/**
 * A name steps to the expression it is bound to, without its metadata, which is
 * about the binding. It means the same thing here as it did there. What has no expression, as a host value does not, is a fixed
 * point, and so is one with a path in it, which is relative to where it is.
 */
function expandName(ast: SymAST, env: Env): AST {
	const definition = lookupBareName(ast.name, env)
	if (definition === null) return ast
	const bound = definition.ast.kind === 'meta' ? definition.ast.expr : definition.ast
	if (bound.kind === 'host' || freeRefs(definition.ast).paths.length > 0) return ast
	if (bound.kind === 'sym' && bound.name === ast.name) return ast
	return substitute(bound, new Map(), {
		captured: definition.env,
		caller: env,
		argFrees: new Set(),
	})
}

/** `name → replacement`, where `null` marks a name bound inside the body. */
type Subst = ReadonlyMap<string, AST | null>

/**
 * State for one `expand` call. `passedAlong` holds the argument expressions
 * bound so far: they belong to the caller, so `~` leaves them unevaluated
 * unless a value is actually required.
 */
class Step {
	private readonly passedAlong = new Set<AST>()

	constructor(private readonly env: Env) {}

	/** The next rung of a call, or null when it has none. */
	callStep(ast: CallAST): AST | null {
		const body = this.reduceHead(ast)
		return body === null ? null : this.lower(body)
	}

	/** Step a call to its body, resolving any `?` at the body's tail. */
	private reduceHead(ast: CallAST): AST | null {
		if (isMatch(ast)) return this.resolveTail(this.selectClause(ast))
		const head = evaluate(ast.head, this.env).value
		if (isTypedHostFn(head) && head.expansion !== undefined) {
			return this.expandHost(head, head.expansion, ast)
		}
		if (!isGlispClosure(head) || head.ast.body === null) return null
		return this.resolveTail(this.instantiate(head, ast))
	}

	/** The next rung that a host function says a call to it has. */
	private expandHost(
		fn: TypedHostFn,
		expansion: HostExpansion,
		call: CallAST
	): AST | null {
		if (call.args.some(arg => arg.kind === 'spread')) return null
		const args: Array<AST | undefined> = [...call.args]
		fn.paramNames?.forEach((name, i) => {
			args[i] ??= call.kwargs?.get(name)
		})
		for (const arg of args) {
			if (arg !== undefined) this.passedAlong.add(arg)
		}
		return expansion(args, {
			value: ast => evaluate(ast, this.env).value,
			call: (name, value, callArgs) => {
				const target = lookupBareName(name, this.env)
				const means =
					target !== null && evaluate(target.ast, target.env).value === value
				return new CallAST(
					means ? new SymAST(name) : new HostAST(value),
					[...callArgs]
				)
			},
		})
	}

	private resolveTail(ast: AST): AST {
		let current = ast
		while (current.kind === 'call' && isMatch(current)) {
			current = this.selectClause(current)
		}
		return current
	}

	private selectClause(ast: CallAST): AST {
		const [valueAst, ...clauses] = ast.args
		if (valueAst === undefined) return new LitAST(UNIT)
		const value = evaluate(valueAst, this.env).value
		for (let i = 0; i + 1 < clauses.length; i += 2) {
			const pattern = clauses[i]!
			if (
				(pattern.kind === 'sym' && pattern.name === '_') ||
				matchValue(value, evaluate(pattern, this.env).value)
			) {
				return clauses[i + 1]!
			}
		}
		return new LitAST(UNIT)
	}

	/** The closure's body with its parameters replaced by the call's args. */
	private instantiate(closure: GlispClosure, call: CallAST): AST {
		const subst = this.bindArgs(closure, call)
		const argFrees = new Set<string>()
		for (const arg of subst.values()) {
			for (const name of freeRefs(arg).names) argFrees.add(name)
		}
		return substitute(closure.ast.body!, subst, {
			captured: closure.capturedEnv,
			caller: this.env,
			argFrees,
		})
	}

	private bindArgs(closure: GlispClosure, call: CallAST): Map<string, AST> {
		const subst = new Map<string, AST>()
		let next = 0
		for (const param of closure.ast.params) {
			let arg: AST
			if (param.variadic) {
				arg =
					call.kwargs?.get(param.name) ?? new VecAST(call.args.slice(next))
				next = call.args.length
			} else {
				arg =
					call.args[next++] ??
					call.kwargs?.get(param.name) ??
					new LitAST(UNIT)
			}
			this.passedAlong.add(arg)
			subst.set(param.name, arg)
		}
		return subst
	}

	/** Work out each `~` in a rung, leaving everything around it as written. */
	private lower(ast: AST): AST {
		if (this.passedAlong.has(ast)) return ast
		switch (ast.kind) {
			case 'unquote':
				return this.compute(ast.expr)
			case 'call': {
				// A `~` inside a clause of `?` waits until its clause is selected.
				if (isMatch(ast)) return ast
				return new CallAST(
					this.lower(ast.head),
					this.lowerList(ast.args),
					mapValues(ast.kwargs, v => this.lower(v))
				)
			}
			case 'vec':
				return new VecAST(this.lowerList(ast.elements))
			case 'record':
				return new RecordAST(
					ast.fields.map(entry => this.lowerField(entry)),
					ast.optional
				)
			case 'let':
				return new LetAST(
					ast.bindings.map(([n, v]) => [n, this.lower(v)] as const),
					ast.body === null ? null : this.lower(ast.body)
				)
			case 'access':
				return new AccessAST(this.lower(ast.target), ast.key)
			case 'meta':
				return new MetaAST(ast.metadata, this.lower(ast.expr))
			default:
				return ast
		}
	}

	private lowerField(entry: RecordEntry): RecordEntry {
		if (entry instanceof SpreadAST) {
			return entry.expr instanceof UnquoteAST
				? new SpreadAST(this.compute(entry.expr.expr))
				: entry
		}
		return [entry[0], this.lower(entry[1])] as const
	}

	private lowerList(items: ReadonlyArray<AST>): AST[] {
		return items.flatMap(item => {
			if (item.kind === 'spread' && item.expr.kind === 'unquote') {
				return inlineSpread(this.compute(item.expr.expr))
			}
			return [this.lower(item)]
		})
	}

	/** `~expr`: the operand itself is asked for, so an argument is forced. */
	private compute(ast: AST): AST {
		return this.passedAlong.has(ast) ? this.force(ast) : this.reduce(ast)
	}

	/** Reduce without leaving any rungs, forcing only what requires a value. */
	private reduce(ast: AST): AST {
		if (this.passedAlong.has(ast)) return ast
		switch (ast.kind) {
			case 'lit':
			case 'host':
				return ast
			case 'unquote':
				return this.compute(ast.expr)
			case 'vec':
				return new VecAST(
					ast.elements.flatMap(el =>
						el.kind === 'spread'
							? inlineSpread(this.reduce(el.expr))
							: [this.reduce(el)]
					)
				)
			case 'record':
				return new RecordAST(
					ast.fields.map(entry =>
						entry instanceof SpreadAST
							? new SpreadAST(this.force(entry.expr))
							: ([entry[0], this.reduce(entry[1])] as const)
					),
					ast.optional
				)
			case 'call': {
				const body = this.reduceHead(ast)
				return body === null ? this.force(ast) : this.reduce(body)
			}
			default:
				return this.force(ast)
		}
	}

	private force(ast: AST): AST {
		return toAst(evaluate(ast, this.env).value, this.env)
	}
}

function isMatch(ast: CallAST): boolean {
	return ast.head.kind === 'sym' && ast.head.name === '?'
}

function inlineSpread(ast: AST): AST[] {
	return ast.kind === 'vec' ? [...ast.elements] : [new SpreadAST(ast)]
}

function mapValues(
	map: ReadonlyMap<string, AST> | undefined,
	fn: (v: AST) => AST
): ReadonlyMap<string, AST> | undefined {
	if (map === undefined) return undefined
	return new Map([...map].map(([k, v]) => [k, fn(v)] as const))
}

interface Scope {
	readonly captured: Env
	readonly caller: Env
	/** Free names of the arguments, which binders in the body must not capture. */
	readonly argFrees: ReadonlySet<string>
}

/**
 * Replace parameters throughout a closure body, keeping names meaningful
 * once the body is moved to the call site:
 *
 * - A free name in the body that the caller has shadowed embeds the value
 *   it meant at the definition, since printing it by name would change it.
 * - A binder in the body that would capture an argument's free name is
 *   renamed.
 */
function substitute(ast: AST, subst: Subst, scope: Scope): AST {
	const sub = (a: AST): AST => substitute(a, subst, scope)
	switch (ast.kind) {
		case 'sym': {
			const replacement = subst.get(ast.name)
			if (replacement === null) return ast
			if (replacement !== undefined) return replacement
			return resolveFreeName(ast, scope)
		}
		case 'lit':
		case 'host':
		case 'path':
			return ast
		case 'unquote':
			return new UnquoteAST(sub(ast.expr))
		case 'spread':
			return new SpreadAST(sub(ast.expr))
		case 'call':
			return new CallAST(
				sub(ast.head),
				ast.args.map(sub),
				mapValues(ast.kwargs, sub)
			)
		case 'vec':
			return new VecAST(ast.elements.map(sub))
		case 'record':
			return new RecordAST(
				ast.fields.map(entry =>
					entry instanceof SpreadAST
						? new SpreadAST(sub(entry.expr))
						: ([entry[0], sub(entry[1])] as const)
				),
				ast.optional
			)
		case 'access':
			return new AccessAST(sub(ast.target), ast.key)
		case 'meta':
			return new MetaAST(sub(ast.metadata) as RecordAST, sub(ast.expr))
		case 'let': {
			const { inner, rename } = enterScope(
				ast.bindings.map(([n]) => n),
				subst,
				scope
			)
			return new LetAST(
				ast.bindings.map(
					([n, v]) => [rename(n), substitute(v, inner, scope)] as const
				),
				ast.body === null ? null : substitute(ast.body, inner, scope)
			)
		}
		case 'fn': {
			const { inner, rename } = enterScope(
				[...ast.generics, ...ast.params.map(p => p.name)],
				subst,
				scope
			)
			const params: FnParam[] = ast.params.map(p => ({
				...p,
				name: rename(p.name),
				type: substitute(p.type, inner, scope),
			}))
			return new FnAST(
				ast.generics.map(rename),
				params,
				substitute(ast.returnType, inner, scope),
				ast.body === null ? null : substitute(ast.body, inner, scope)
			)
		}
	}
}

function resolveFreeName(ast: SymAST, scope: Scope): AST {
	const definition = lookupBareName(ast.name, scope.captured)
	if (definition === null) return ast
	if (definition === lookupBareName(ast.name, scope.caller)) return ast
	const { value } = evaluate(definition.ast, definition.env)
	return typeof value === 'number' ||
		typeof value === 'string' ||
		typeof value === 'boolean'
		? new LitAST(value)
		: new HostAST(value)
}

function enterScope(
	names: ReadonlyArray<string>,
	subst: Subst,
	scope: Scope
): { inner: Subst; rename: (name: string) => string } {
	const inner = new Map(subst)
	const renamed = new Map<string, string>()
	for (const name of names) {
		if (scope.argFrees.has(name)) {
			const fresh = freshName(name, scope.argFrees, names)
			renamed.set(name, fresh)
			inner.set(name, new SymAST(fresh))
		} else {
			inner.set(name, null)
		}
	}
	return { inner, rename: name => renamed.get(name) ?? name }
}

function freshName(
	name: string,
	taken: ReadonlySet<string>,
	siblings: ReadonlyArray<string>
): string {
	for (let i = 1; ; i++) {
		const candidate = `${name}_${i}`
		if (!taken.has(candidate) && !siblings.includes(candidate)) return candidate
	}
}
