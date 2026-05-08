/**
 * Evaluator.
 *
 * Walks the AST and produces JS-native values per the host-api.md marshaling
 * table. Failures surface as `()` plus diagnostics — eval never throws.
 *
 * Currently implemented:
 * - literals, bare-name lookup
 * - vec / record / let-block
 * - accessor `.key`
 * - function literal → closure value
 * - call (host-bound JS function or Glisp closure)
 * - path lookup
 * - quote / unquote / splice are transparent (per eval.md)
 *
 * Not yet implemented:
 * - special forms `?` / `|>` / `%` desugaring
 * - kwargs at call sites
 * - cycle detection / memoization
 * - default fallback / type-cast machinery
 * - `expand`
 */

import { desugar } from './desugar.js'
import {
	type AST,
	type BindingTarget,
	type CallAST,
	type Diagnostic,
	type Env,
	type FnAST,
	type Frame,
	type RecordEntry,
	SpreadAST,
	UNIT,
} from './types.js'

// -----------------------------------------------------------------------------
// Result type
// -----------------------------------------------------------------------------

export interface EvalResult {
	readonly value: unknown
	readonly diagnostics: ReadonlyArray<Diagnostic>
}

// -----------------------------------------------------------------------------
// Closure (Glisp function value)
// -----------------------------------------------------------------------------

/**
 * Internal representation of a Glisp function value: a function-literal AST
 * paired with the env in which the literal was created (lexical scope).
 *
 * Per host-api.md the public-facing form is a callable JS function; this
 * class is the implementation detail wrapped for that purpose.
 */
export class GlispClosure {
	constructor(
		public readonly ast: FnAST,
		public readonly capturedEnv: Env
	) {}
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// Memoization (global singleton)
// -----------------------------------------------------------------------------

type MemoState =
	| { readonly kind: 'in-progress' }
	| { readonly kind: 'computed'; readonly result: EvalResult }

/**
 * Single, module-level memo cache shared across every `evaluate` call.
 *
 * Rationale: the cache key `(AST instance, Env instance)` is identity-based,
 * so two evaluations sharing the same AST and Env produce the same result —
 * sharing one cache lets repeated work hit. Lifetime is managed by the
 * outer `WeakMap`: when an AST subtree becomes unreachable, its memo entries
 * are GCed automatically. The inner map is a plain `Map` because `Env` may
 * be `null` (the root sentinel), which `WeakMap` cannot key.
 */
const memo: WeakMap<AST, Map<Env, MemoState>> = new WeakMap()

function lookupMemo(ast: AST, env: Env): MemoState | undefined {
	return memo.get(ast)?.get(env)
}

function storeMemo(ast: AST, env: Env, state: MemoState): void {
	let inner = memo.get(ast)
	if (inner === undefined) {
		inner = new Map()
		memo.set(ast, inner)
	}
	inner.set(env, state)
}

/** Evaluate `ast` against `env`. Never throws. */
export function evaluate(ast: AST, env: Env): EvalResult {
	// `%` desugaring runs before any further work. The pass is cached
	// per-AST so repeated evaluations of the same source pay only once.
	const desugared = desugar(ast)
	const cached = lookupMemo(desugared, env)
	if (cached !== undefined) {
		if (cached.kind === 'in-progress') {
			return fail(desugared, env, 'cycle detected')
		}
		return cached.result
	}
	storeMemo(desugared, env, { kind: 'in-progress' })
	const result = evaluateInner(desugared, env)
	storeMemo(desugared, env, { kind: 'computed', result })
	return result
}

function evaluateInner(ast: AST, env: Env): EvalResult {
	switch (ast.kind) {
		case 'lit':
			return ok(ast.value)

		case 'sym': {
			const target = lookupBareName(ast.name, env)
			if (target === null) {
				return fail(ast, env, `unresolvable name: ${ast.name}`)
			}
			return evaluate(target.ast, target.env)
		}

		case 'vec': {
			const { values, diagnostics } = evalListElements(ast.elements, env)
			return { value: values, diagnostics }
		}

		case 'record': {
			const result: Record<string, unknown> = {}
			const diagnostics: Diagnostic[] = []
			for (const entry of ast.fields) {
				if (entry instanceof SpreadAST) {
					const r = evaluate(entry.expr, env)
					push(diagnostics, r.diagnostics)
					if (isPlainRecord(r.value)) {
						Object.assign(result, r.value)
					} else {
						diagnostics.push(
							diag(entry, env, 'record spread operand must be a record')
						)
					}
				} else {
					const [name, value] = entry
					const r = evaluate(value, env)
					result[name] = r.value
					push(diagnostics, r.diagnostics)
				}
			}
			return { value: result, diagnostics }
		}

		case 'let': {
			const frame = pushLetFrame(ast, env)
			if (ast.body === null) {
				return ok(UNIT)
			}
			return evaluate(ast.body, frame)
		}

		case 'access': {
			const targetResult = evaluate(ast.target, env)
			const diagnostics = [...targetResult.diagnostics]
			const value = targetResult.value
			if (Array.isArray(value) && typeof ast.key === 'number') {
				const got = value[ast.key]
				if (got === undefined) {
					diagnostics.push(
						diag(ast, env, `vector index out of bounds: ${ast.key}`)
					)
					return { value: UNIT, diagnostics }
				}
				return { value: got, diagnostics }
			}
			if (isPlainRecord(value) && typeof ast.key === 'string') {
				const got = (value as Record<string, unknown>)[ast.key]
				if (got === undefined) {
					diagnostics.push(
						diag(ast, env, `record field not found: ${ast.key}`)
					)
					return { value: UNIT, diagnostics }
				}
				return { value: got, diagnostics }
			}
			diagnostics.push(
				diag(
					ast,
					env,
					`cannot access ${typeof ast.key === 'number' ? 'index' : 'field'} ${
						JSON.stringify(ast.key)
					} on ${describeType(value)}`
				)
			)
			return { value: UNIT, diagnostics }
		}

		case 'fn':
			return ok(new GlispClosure(ast, env))

		case 'call':
			return evalCall(ast, env)

		case 'path':
			return evalPath(ast.segments, env, ast)

		// macro-related annotations are transparent during eval
		case 'quote':
		case 'unquote':
		case 'splice':
			return evaluate(ast.expr, env)

		case 'spread':
			// A bare spread used outside a list-building context has no value.
			return fail(ast, env, 'spread used outside a list-building context')

		case 'meta':
			// Metadata is a parallel layer; eval just evaluates the underlying expr.
			return evaluate(ast.expr, env)
	}
}

// -----------------------------------------------------------------------------
// Env helpers
// -----------------------------------------------------------------------------

export const emptyEnv: Env = null

export function makeTopLevel(
	bindings: Readonly<Record<string, AST>>
): Env {
	const map = new Map<string, BindingTarget>()
	const frame: Frame = {
		ast: { kind: 'lit', value: UNIT } as AST,
		parent: null,
		bindings: map,
	}
	for (const [name, ast] of Object.entries(bindings)) {
		map.set(name, { ast, env: frame })
	}
	return frame
}

function lookupBareName(name: string, env: Env): BindingTarget | null {
	let frame = env
	while (frame !== null) {
		const target = frame.bindings?.get(name)
		if (target !== undefined) return target
		frame = frame.parent
	}
	return null
}

function pushLetFrame(ast: AST & { bindings: ReadonlyArray<readonly [string, AST]> }, parent: Env): Env {
	const map = new Map<string, BindingTarget>()
	const frame: Frame = {
		ast,
		parent,
		bindings: map,
	}
	for (const [name, valueAST] of ast.bindings) {
		// self-referential: each binding is evaluated in the frame that
		// already contains all its sibling bindings.
		map.set(name, { ast: valueAST, env: frame })
	}
	return frame
}

// -----------------------------------------------------------------------------
// Spread-aware list-element evaluation
// -----------------------------------------------------------------------------

function evalListElements(
	elements: ReadonlyArray<AST>,
	env: Env
): { values: unknown[]; diagnostics: Diagnostic[] } {
	const values: unknown[] = []
	const diagnostics: Diagnostic[] = []
	for (const elem of elements) {
		if (elem instanceof SpreadAST) {
			const r = evaluate(elem.expr, env)
			push(diagnostics, r.diagnostics)
			if (Array.isArray(r.value)) {
				for (const v of r.value as unknown[]) values.push(v)
			} else {
				diagnostics.push(diag(elem, env, 'spread operand must be a vector'))
			}
		} else {
			const r = evaluate(elem, env)
			values.push(r.value)
			push(diagnostics, r.diagnostics)
		}
	}
	return { values, diagnostics }
}

// -----------------------------------------------------------------------------
// call
// -----------------------------------------------------------------------------

function evalCall(ast: CallAST, env: Env): EvalResult {
	// Special forms — dispatched by head's symbol name.
	if (ast.head.kind === 'sym') {
		switch (ast.head.name) {
			case '?':
				return evalMatch(ast, env)
			case '|>':
				return evalPipe(ast, env)
		}
	}

	const headResult = evaluate(ast.head, env)
	const diagnostics = [...headResult.diagnostics]
	const headValue = headResult.value

	// Expand spread elements in positional args (yields a flat AST list).
	const expanded = expandPositionalArgs(ast.args, env)
	push(diagnostics, expanded.diagnostics)
	const positional = expanded.asts
	const kwargs = ast.kwargs

	// Glisp closure → push body frame, bind params lazily.
	if (headValue instanceof GlispClosure) {
		return applyClosure(headValue, positional, kwargs, env, ast, diagnostics)
	}

	// Host-bound JS function — eval all positional args strictly, ignore
	// kwargs (host functions don't carry param-name info).
	if (typeof headValue === 'function') {
		const argValues: unknown[] = []
		for (const argAst of positional) {
			const r = evaluate(argAst, env)
			argValues.push(r.value)
			push(diagnostics, r.diagnostics)
		}
		if (kwargs && kwargs.size > 0) {
			diagnostics.push(
				diag(ast, env, 'cannot pass keyword arguments to a host function')
			)
		}
		try {
			const result = (headValue as (...args: unknown[]) => unknown)(
				...argValues
			)
			return { value: result, diagnostics }
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e)
			diagnostics.push(diag(ast, env, `host function threw: ${message}`))
			return { value: UNIT, diagnostics }
		}
	}

	diagnostics.push(diag(ast, env, `cannot call ${describeType(headValue)}`))
	return { value: UNIT, diagnostics }
}

/**
 * Expand `...spread` entries in a call's positional arguments to a flat
 * AST list. A spread whose operand is a `VecAST` is inlined directly (lazy);
 * otherwise the operand is evaluated and primitive elements are wrapped as
 * literals (best-effort reify).
 */
function expandPositionalArgs(
	args: ReadonlyArray<AST>,
	env: Env
): { asts: AST[]; diagnostics: Diagnostic[] } {
	const asts: AST[] = []
	const diagnostics: Diagnostic[] = []
	for (const arg of args) {
		if (!(arg instanceof SpreadAST)) {
			asts.push(arg)
			continue
		}
		// Direct vec literal — inline elements without forcing.
		if (arg.expr.kind === 'vec') {
			for (const e of arg.expr.elements) asts.push(e)
			continue
		}
		// Otherwise eval and wrap primitives.
		const r = evaluate(arg.expr, env)
		push(diagnostics, r.diagnostics)
		if (!Array.isArray(r.value)) {
			diagnostics.push(diag(arg, env, 'spread operand must be a vector'))
			continue
		}
		for (const v of r.value as unknown[]) {
			asts.push(reifyPrimitive(v))
		}
	}
	return { asts, diagnostics }
}

function reifyPrimitive(v: unknown): AST {
	if (
		typeof v === 'number' ||
		typeof v === 'string' ||
		typeof v === 'boolean' ||
		v === UNIT
	) {
		return { kind: 'lit', value: v as never } as never
	}
	// non-primitive values can't be losslessly wrapped as a single literal
	// without a fuller toAst implementation. For now, fall back to a sentinel
	// that will produce a diagnostic if forced.
	return { kind: 'sym', name: '#non-reifiable-value#' } as never
}

/**
 * Bind positional args + kwargs to a closure's parameters and evaluate
 * the body. Honors variadic / optional flags per syntax.md.
 */
function applyClosure(
	closure: GlispClosure,
	positional: ReadonlyArray<AST>,
	kwargs: ReadonlyMap<string, AST> | undefined,
	callerEnv: Env,
	site: AST,
	priorDiagnostics: ReadonlyArray<Diagnostic>
): EvalResult {
	const fnAst = closure.ast
	const diagnostics = [...priorDiagnostics]

	if (fnAst.body === null) {
		diagnostics.push(
			diag(site, callerEnv, 'cannot call a function-type expression (no body)')
		)
		return { value: UNIT, diagnostics }
	}

	const map = new Map<string, BindingTarget>()
	let posIdx = 0

	for (const param of fnAst.params) {
		if (param.variadic) {
			const kwargAst = kwargs?.get(param.name)
			if (kwargAst !== undefined && posIdx < positional.length) {
				diagnostics.push(
					diag(
						site,
						callerEnv,
						`double binding of variadic parameter ${param.name}`
					)
				)
			}
			let restAst: AST
			if (kwargAst !== undefined) {
				restAst = kwargAst
				posIdx = positional.length
			} else {
				restAst = {
					kind: 'vec',
					elements: positional.slice(posIdx),
				} as never
				posIdx = positional.length
			}
			map.set(param.name, { ast: restAst, env: callerEnv })
			continue
		}

		// non-variadic
		if (posIdx < positional.length) {
			if (kwargs?.has(param.name)) {
				diagnostics.push(
					diag(site, callerEnv, `double binding of parameter ${param.name}`)
				)
			}
			map.set(param.name, { ast: positional[posIdx]!, env: callerEnv })
			posIdx++
			continue
		}

		const kwargAst = kwargs?.get(param.name)
		if (kwargAst !== undefined) {
			map.set(param.name, { ast: kwargAst, env: callerEnv })
			continue
		}

		if (param.optional) {
			// silent default fallback (placeholder: bind to UNIT until
			// the type-cast / metadata-default machinery lands)
			map.set(param.name, { ast: { kind: 'lit', value: UNIT } as never, env: null })
			continue
		}

		diagnostics.push(
			diag(site, callerEnv, `missing required parameter: ${param.name}`)
		)
		map.set(param.name, { ast: { kind: 'lit', value: UNIT } as never, env: null })
	}

	if (posIdx < positional.length) {
		diagnostics.push(diag(site, callerEnv, 'too many positional arguments'))
	}

	if (kwargs) {
		const paramNames = new Set(fnAst.params.map(p => p.name))
		for (const k of kwargs.keys()) {
			if (!paramNames.has(k)) {
				diagnostics.push(
					diag(site, callerEnv, `unknown keyword argument: ${k}`)
				)
			}
		}
	}

	const bodyFrame: Frame = {
		ast: fnAst,
		parent: closure.capturedEnv,
		bindings: map,
	}
	const r = evaluate(fnAst.body, bodyFrame)
	return { value: r.value, diagnostics: [...diagnostics, ...r.diagnostics] }
}

// -----------------------------------------------------------------------------
// Special forms: ? (match), |> (pipe)
// -----------------------------------------------------------------------------

function evalMatch(ast: CallAST, env: Env): EvalResult {
	// (? value pat1 res1 pat2 res2 ...)
	if (ast.args.length === 0) {
		return fail(ast, env, '? requires a value')
	}
	if (ast.args.length % 2 !== 1) {
		return fail(ast, env, '? requires odd number of args (value + clause pairs)')
	}

	const valueResult = evaluate(ast.args[0]!, env)
	const value = valueResult.value
	const diagnostics = [...valueResult.diagnostics]

	for (let i = 1; i < ast.args.length; i += 2) {
		const patAst = ast.args[i]!
		const resAst = ast.args[i + 1]!

		// `_` in pattern position = catch-all (top type).
		if (patAst.kind === 'sym' && patAst.name === '_') {
			const r = evaluate(resAst, env)
			return { value: r.value, diagnostics: [...diagnostics, ...r.diagnostics] }
		}

		const patResult = evaluate(patAst, env)
		push(diagnostics, patResult.diagnostics)
		if (matchValue(value, patResult.value)) {
			const r = evaluate(resAst, env)
			return { value: r.value, diagnostics: [...diagnostics, ...r.diagnostics] }
		}
	}
	// no clause matched → unit (per spec)
	return { value: UNIT, diagnostics }
}

function matchValue(value: unknown, pattern: unknown): boolean {
	// Type-cast based matching is not yet implemented; fall back to equality.
	return value === pattern
}

function evalPipe(ast: CallAST, env: Env): EvalResult {
	// (|> input step1 step2 ...)
	if (ast.args.length === 0) {
		return fail(ast, env, '|> requires at least an input')
	}
	const inputResult = evaluate(ast.args[0]!, env)
	let value = inputResult.value
	const diagnostics = [...inputResult.diagnostics]

	for (let i = 1; i < ast.args.length; i++) {
		const stepAst = ast.args[i]!
		const stepResult = evaluate(stepAst, env)
		push(diagnostics, stepResult.diagnostics)
		const fnValue = stepResult.value

		if (fnValue instanceof GlispClosure) {
			const argAst = reifyPrimitive(value)
			const r = applyClosure(fnValue, [argAst], undefined, env, stepAst, [])
			push(diagnostics, r.diagnostics)
			value = r.value
		} else if (typeof fnValue === 'function') {
			try {
				value = (fnValue as (v: unknown) => unknown)(value)
			} catch (e) {
				const message = e instanceof Error ? e.message : String(e)
				diagnostics.push(diag(stepAst, env, `pipe step threw: ${message}`))
				value = UNIT
			}
		} else {
			diagnostics.push(
				diag(
					stepAst,
					env,
					`pipe step is not a function: ${describeType(fnValue)}`
				)
			)
			value = UNIT
		}
	}
	return { value, diagnostics }
}

// -----------------------------------------------------------------------------
// path
// -----------------------------------------------------------------------------

function evalPath(
	segments: ReadonlyArray<'..' | string | number>,
	env: Env,
	source: AST
): EvalResult {
	// Path navigation per eval.md — Path lookup. Each '..' segment pops a
	// frame; name/integer segments descend into the current frame's AST node.
	let frame: Env = env
	let astHere: AST | null = frame?.ast ?? null

	for (const seg of segments) {
		if (seg === '..') {
			if (frame === null) {
				return fail(source, env, 'path goes above top-level')
			}
			frame = frame.parent
			astHere = frame?.ast ?? null
			continue
		}
		// descending — currently only supports record / vec / let-block
		// directly visible in the current AST node. A full implementation
		// would also traverse path-transparent forms (record / vec /
		// application children).
		if (astHere === null) {
			return fail(source, env, 'path descended below the root')
		}
		const child = childAt(astHere, seg)
		if (child === null) {
			return fail(source, env, `path segment not found: ${seg}`)
		}
		astHere = child
	}

	if (astHere === null) {
		return ok(UNIT)
	}
	return evaluate(astHere, frame)
}

function childAt(node: AST, seg: string | number): AST | null {
	if (node.kind === 'record' && typeof seg === 'string') {
		const fields = node.fields
		// last-wins lookup, ignoring SpreadAST entries (they need eval)
		for (let i = fields.length - 1; i >= 0; i--) {
			const e = fields[i]
			if (e === undefined) continue
			if (e instanceof SpreadAST) continue
			if (e[0] === seg) return e[1]
		}
		return null
	}
	if (node.kind === 'vec' && typeof seg === 'number') {
		return node.elements[seg] ?? null
	}
	if (node.kind === 'let' && typeof seg === 'string') {
		const bindings = node.bindings
		for (let i = bindings.length - 1; i >= 0; i--) {
			const b = bindings[i]
			if (b !== undefined && b[0] === seg) return b[1]
		}
		return null
	}
	if (node.kind === 'call' && typeof seg === 'number') {
		// 0 = head, 1.. = args
		if (seg === 0) return node.head
		return node.args[seg - 1] ?? null
	}
	return null
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function ok(value: unknown): EvalResult {
	return { value, diagnostics: [] }
}

function fail(ast: AST, env: Env, message: string): EvalResult {
	return { value: UNIT, diagnostics: [diag(ast, env, message)] }
}

function diag(ast: AST, env: Env, message: string): Diagnostic {
	return { level: 'error', message, source: { ast, env } }
}

function push<T>(target: T[], items: ReadonlyArray<T>): void {
	for (const x of items) target.push(x)
}

function isPlainRecord(v: unknown): v is Record<string, unknown> {
	return (
		typeof v === 'object' &&
		v !== null &&
		!Array.isArray(v) &&
		!(v instanceof GlispClosure) &&
		typeof v !== 'function'
	)
}

function describeType(v: unknown): string {
	if (v === UNIT) return 'unit'
	if (v === null) return 'null'
	if (Array.isArray(v)) return 'vector'
	if (v instanceof GlispClosure) return 'closure'
	return typeof v
}
