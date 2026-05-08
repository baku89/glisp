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

import {
	type AST,
	type BindingTarget,
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
// Memoization context
// -----------------------------------------------------------------------------

type MemoState =
	| { readonly kind: 'in-progress' }
	| { readonly kind: 'computed'; readonly result: EvalResult }

/**
 * Per-evaluation context shared across all recursive `evaluate` calls.
 * Holds the memo cache for cycle detection and result reuse.
 *
 * The outer map is a `WeakMap` keyed by the AST instance — when an AST
 * subtree becomes unreachable elsewhere, its memo entries can be garbage
 * collected automatically. The inner map is a regular `Map` because `Env`
 * may be `null` (the root sentinel), which `WeakMap` cannot key.
 */
export interface EvalContext {
	readonly memo: WeakMap<AST, Map<Env, MemoState>>
}

function newContext(): EvalContext {
	return { memo: new WeakMap() }
}

function lookupMemo(ctx: EvalContext, ast: AST, env: Env): MemoState | undefined {
	return ctx.memo.get(ast)?.get(env)
}

function storeMemo(
	ctx: EvalContext,
	ast: AST,
	env: Env,
	state: MemoState
): void {
	let inner = ctx.memo.get(ast)
	if (inner === undefined) {
		inner = new Map()
		ctx.memo.set(ast, inner)
	}
	inner.set(env, state)
}

/** Evaluate `ast` against `env`. Never throws. */
export function evaluate(ast: AST, env: Env, ctx?: EvalContext): EvalResult {
	const c = ctx ?? newContext()
	const cached = lookupMemo(c, ast, env)
	if (cached !== undefined) {
		if (cached.kind === 'in-progress') {
			return fail(ast, env, 'cycle detected')
		}
		return cached.result
	}
	storeMemo(c, ast, env, { kind: 'in-progress' })
	const result = evaluateInner(ast, env, c)
	storeMemo(c, ast, env, { kind: 'computed', result })
	return result
}

function evaluateInner(ast: AST, env: Env, ctx: EvalContext): EvalResult {
	switch (ast.kind) {
		case 'lit':
			return ok(ast.value)

		case 'sym': {
			const target = lookupBareName(ast.name, env)
			if (target === null) {
				return fail(ast, env, `unresolvable name: ${ast.name}`)
			}
			return evaluate(target.ast, target.env, ctx)
		}

		case 'vec': {
			const { values, diagnostics } = evalListElements(
				ast.elements,
				env,
				ctx
			)
			return { value: values, diagnostics }
		}

		case 'record': {
			const result: Record<string, unknown> = {}
			const diagnostics: Diagnostic[] = []
			for (const entry of ast.fields) {
				if (entry instanceof SpreadAST) {
					const r = evaluate(entry.expr, env, ctx)
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
					const r = evaluate(value, env, ctx)
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
			return evaluate(ast.body, frame, ctx)
		}

		case 'access': {
			const targetResult = evaluate(ast.target, env, ctx)
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
			return evalCall(ast, env, ctx)

		case 'path':
			return evalPath(ast.segments, env, ast, ctx)

		// macro-related annotations are transparent during eval
		case 'quote':
		case 'unquote':
		case 'splice':
			return evaluate(ast.expr, env, ctx)

		case 'spread':
			// A bare spread used outside a list-building context has no value.
			return fail(ast, env, 'spread used outside a list-building context')

		case 'meta':
			// Metadata is a parallel layer; eval just evaluates the underlying expr.
			return evaluate(ast.expr, env, ctx)
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
	env: Env,
	ctx: EvalContext
): { values: unknown[]; diagnostics: Diagnostic[] } {
	const values: unknown[] = []
	const diagnostics: Diagnostic[] = []
	for (const elem of elements) {
		if (elem instanceof SpreadAST) {
			const r = evaluate(elem.expr, env, ctx)
			push(diagnostics, r.diagnostics)
			if (Array.isArray(r.value)) {
				for (const v of r.value as unknown[]) values.push(v)
			} else {
				diagnostics.push(
					diag(elem, env, 'spread operand must be a vector')
				)
			}
		} else {
			const r = evaluate(elem, env, ctx)
			values.push(r.value)
			push(diagnostics, r.diagnostics)
		}
	}
	return { values, diagnostics }
}

// -----------------------------------------------------------------------------
// call
// -----------------------------------------------------------------------------

function evalCall(
	ast: AST & {
		head: AST
		args: ReadonlyArray<AST>
	},
	env: Env,
	ctx: EvalContext
): EvalResult {
	const headResult = evaluate(ast.head, env, ctx)
	const diagnostics = [...headResult.diagnostics]
	const headValue = headResult.value

	// Glisp closure → eval body in body-frame, params bound to argument ASTs
	// (lazy semantics — argument expressions are forced when the parameter
	// is referenced).
	if (headValue instanceof GlispClosure) {
		const closure = headValue
		const fnAst = closure.ast
		if (fnAst.body === null) {
			diagnostics.push(
				diag(ast, env, 'cannot call a function-type expression (no body)')
			)
			return { value: UNIT, diagnostics }
		}
		const map = new Map<string, BindingTarget>()
		for (let i = 0; i < fnAst.params.length; i++) {
			const param = fnAst.params[i]!
			const argAst = ast.args[i]
			if (argAst === undefined) {
				diagnostics.push(diag(ast, env, `missing argument: ${param.name}`))
				continue
			}
			map.set(param.name, { ast: argAst, env })
		}
		const bodyFrame: Frame = {
			ast: fnAst,
			parent: closure.capturedEnv,
			bindings: map,
		}
		const r = evaluate(fnAst.body, bodyFrame, ctx)
		return { value: r.value, diagnostics: [...diagnostics, ...r.diagnostics] }
	}

	// Host-bound JS function — eval all args strictly, call.
	if (typeof headValue === 'function') {
		const evaluated = evalListElements(ast.args, env, ctx)
		push(diagnostics, evaluated.diagnostics)
		try {
			const result = (headValue as (...args: unknown[]) => unknown)(
				...evaluated.values
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

// -----------------------------------------------------------------------------
// path
// -----------------------------------------------------------------------------

function evalPath(
	segments: ReadonlyArray<'..' | string | number>,
	env: Env,
	source: AST,
	ctx: EvalContext
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
	return evaluate(astHere, frame, ctx)
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
