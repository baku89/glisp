/**
 * Evaluator.
 *
 * Walks the AST and produces JS-native values per the host-api.md marshaling
 * table. Failures surface as `()` plus diagnostics — eval never throws.
 *
 * Not yet implemented:
 * - `expand` / macro evaluation
 * - generic-parameter resolution in `(=> (T) (params): T body)`
 */

import { desugar } from './desugar.js'
import { infer } from './infer.js'
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
 * Glisp function value. Per host-api.md, a Glisp closure surfaced to JS
 * is a callable JS function: invoking it forces evaluation in the
 * closure's captured env and returns the JS value.
 *
 * The implementation is a regular JS function carrying brand-property
 * marker `__glispClosure`, plus the function-literal AST and the env in
 * which the literal was created. `instanceof`-style checks are not
 * usable on a plain function, so dispatch goes through `isGlispClosure`.
 */
export interface GlispClosure {
	(...args: unknown[]): unknown
	readonly __glispClosure: true
	readonly ast: FnAST
	readonly capturedEnv: Env
}

export function makeClosure(ast: FnAST, capturedEnv: Env): GlispClosure {
	const closure = function (
		this: GlispClosure | undefined,
		...args: unknown[]
	): unknown {
		return invokeClosureFromJS(closure, args)
	} as unknown as GlispClosure
	Object.defineProperty(closure, '__glispClosure', { value: true })
	Object.defineProperty(closure, 'ast', { value: ast })
	Object.defineProperty(closure, 'capturedEnv', { value: capturedEnv })
	return closure
}

export function isGlispClosure(v: unknown): v is GlispClosure {
	return (
		typeof v === 'function' &&
		(v as { __glispClosure?: true }).__glispClosure === true
	)
}

/**
 * Invoke a Glisp closure from JS. JS-side args are reified to ASTs
 * (literal-wrapped) before being bound to parameters, so the closure
 * sees them through the same lazy-binding path as a normal Glisp call.
 */
function invokeClosureFromJS(c: GlispClosure, args: unknown[]): unknown {
	const argAsts = args.map(a => toAst(a, c.capturedEnv))
	const r = applyClosure(c, argAsts, undefined, c.capturedEnv, c.ast, [])
	return r.value
}

// -----------------------------------------------------------------------------
// Type value (callable cast with marker properties)
// -----------------------------------------------------------------------------

/**
 * Structural shape of a TypeValue — recorded so type-compatibility checks
 * can compare two types' insides rather than just their printed names.
 *
 * `kind: 'primitive'` is the default for opaque base types built via
 * `makeType` (number, string, top, etc.); compatibility there is by
 * `===` identity. The other kinds expose the constituent types so a
 * checker can recurse: `function` has `paramTypes` / `returnType`,
 * `enum` has its value set, `refine` keeps a pointer to the base.
 */
export type TypeShape =
	| { readonly kind: 'primitive' }
	| {
			readonly kind: 'function'
			readonly paramTypes: ReadonlyArray<TypeValue>
			readonly returnType: TypeValue
			readonly variadicTail?: TypeValue
	  }
	| { readonly kind: 'enum'; readonly values: ReadonlySet<unknown> }
	| { readonly kind: 'refine'; readonly base: TypeValue }
	| { readonly kind: 'io'; readonly payload: TypeValue }

export interface TypeValue {
	readonly __glispType: true
	readonly typeName: string
	readonly fits: (v: unknown) => boolean
	readonly default: unknown
	readonly shape: TypeShape
	/**
	 * Optional type-constructor hook. When set, `(T arg ...)` is dispatched
	 * here with the args evaluated as types, and the result is the
	 * parameterized TypeValue. Most types do not have this; for them, a
	 * `(T v)` call is rejected with a hint to use `(@ T v)`.
	 */
	readonly apply?: (
		typeArgs: ReadonlyArray<TypeValue>
	) => TypeValue | { error: string }
}

/**
 * Build a type value: a plain branded object carrying the type's name,
 * `fits` predicate, default, and structural shape.
 *
 * Type values are **not** callable — `(T v)` is rejected by the
 * evaluator with a hint to use `(@ T v)` instead. The cast machinery
 * still exists internally (typed slots, default fallback for missing
 * args) but goes through `coerceTo`, not through invocation.
 */
export function makeType(
	name: string,
	fits: (v: unknown) => boolean,
	defaultValue: unknown,
	shape: TypeShape = { kind: 'primitive' }
): TypeValue {
	return {
		__glispType: true,
		typeName: name,
		fits,
		default: defaultValue,
		shape,
	}
}

export function isTypeValue(v: unknown): v is TypeValue {
	return v != null && (v as { __glispType?: true }).__glispType === true
}

/**
 * Coerce `v` through type `t`: return `v` itself if `t.fits(v)`,
 * otherwise the type's default. Pure — never emits diagnostics. The
 * caller is responsible for surfacing a type mismatch when relevant
 * (see `evalCoerce` and `callTypedHostFn`).
 */
export function coerceTo(t: TypeValue, v: unknown): unknown {
	return t.fits(v) ? v : t.default
}

/**
 * Build a function-shaped TypeValue carrying its declared parameter and
 * return types. The runtime `fits` predicate accepts any callable (a
 * function-shaped TypeValue does not constrain runtime arity); structural
 * compatibility against another function type goes through `typeFits`,
 * which compares the recorded shapes.
 */
export function makeFunctionType(
	paramTypes: ReadonlyArray<TypeValue>,
	returnType: TypeValue,
	options?: {
		paramNames?: ReadonlyArray<string>
		variadicTail?: TypeValue
	}
): TypeValue {
	const params = paramTypes.map((t, i) => {
		const name = options?.paramNames?.[i] ?? `_${i}`
		return `${name}: ${t.typeName}`
	})
	if (options?.variadicTail !== undefined) {
		params.push(`...rest: ${options.variadicTail.typeName}`)
	}
	const name = `(=> (${params.join(' ')}): ${returnType.typeName})`
	const shape: TypeShape = options?.variadicTail !== undefined
		? {
				kind: 'function',
				paramTypes,
				returnType,
				variadicTail: options.variadicTail,
			}
		: { kind: 'function', paramTypes, returnType }
	return makeType(name, v => typeof v === 'function', UNIT, shape)
}

/**
 * Structural compatibility check: does a value of type `actual` fit a
 * slot declared as `expected`?
 *
 * - `expected` being `_` (top) accepts anything.
 * - Same TypeValue identity is compatible.
 * - Two function types are compatible iff their param/return shapes
 *   recursively are. Param matching is invariant for now — proper
 *   contravariance can come with type inference of higher-order calls.
 * - Otherwise, fall back to typeName equality (covers names that
 *   resolve to identical primitives across env rebuilds).
 */
export function typeFits(actual: TypeValue, expected: TypeValue): boolean {
	if (actual === expected) return true
	if (expected.typeName === '_') return true
	if (actual.typeName === '!') return true // bottom fits anything

	if (
		actual.shape.kind === 'function' &&
		expected.shape.kind === 'function'
	) {
		const a = actual.shape
		const e = expected.shape
		// Either side variadic relaxes the arity check.
		if (
			a.variadicTail === undefined &&
			e.variadicTail === undefined &&
			a.paramTypes.length !== e.paramTypes.length
		) {
			return false
		}
		const len = Math.max(a.paramTypes.length, e.paramTypes.length)
		for (let i = 0; i < len; i++) {
			const ap = a.paramTypes[i] ?? a.variadicTail
			const ep = e.paramTypes[i] ?? e.variadicTail
			if (ap === undefined || ep === undefined) return false
			if (!typeFits(ap, ep)) return false
		}
		return typeFits(a.returnType, e.returnType)
	}

	// Parametric IO: covariant in the payload. `(IO !)` fits `(IO _)`,
	// `(IO number)` fits `(IO _)`, but `(IO number)` does not fit
	// `(IO string)`.
	if (actual.shape.kind === 'io' && expected.shape.kind === 'io') {
		return typeFits(actual.shape.payload, expected.shape.payload)
	}

	return actual.typeName === expected.typeName
}

// -----------------------------------------------------------------------------
// Typed host function — JS function with declared parameter and return types
// -----------------------------------------------------------------------------

export interface TypedHostFn {
	(...args: unknown[]): unknown
	readonly __glispTypedFn: true
	readonly paramTypes: ReadonlyArray<TypeValue>
	readonly returnType: TypeValue
	/**
	 * Optional parameter names. When set, callers may pass keyword
	 * arguments at the call site. When unset (the default), kwargs at
	 * the call site emit a diagnostic — there's no way to route them.
	 */
	readonly paramNames?: ReadonlyArray<string>
	/**
	 * Optional element type for an open trailing variadic. When set, any
	 * positional arguments past `paramTypes.length` are cast through this
	 * type and forwarded as additional positional args.
	 */
	readonly variadicTail?: TypeValue
}

/**
 * Wrap a plain JS function with declared parameter and return types so the
 * evaluator can cast each argument before the call (and fill missing ones
 * with the parameter type's default). This is what gives `(+ "str")` the
 * expected `0` rather than `"strundefined"` — `"str"` doesn't fit `number`,
 * so the cast falls back to the default `0`, and the missing second argument
 * is filled the same way.
 *
 * Pass `paramNames` to enable kwargs at call sites — names are matched
 * positionally against `paramTypes`.
 *
 * Pass `variadicTail` to make the last position open-ended (extra args are
 * cast through the tail type and forwarded). Callers receive every cast
 * arg — the wrapped JS function is responsible for any folding logic.
 *
 * Spec: docs/spec/types.md — default fallback timing
 */
export function makeTypedFn(
	paramTypes: ReadonlyArray<TypeValue>,
	returnType: TypeValue,
	fn: (...args: unknown[]) => unknown,
	paramNames?: ReadonlyArray<string>,
	variadicTail?: TypeValue
): TypedHostFn {
	const wrapped = (...args: unknown[]): unknown => {
		const cast: unknown[] = []
		for (let i = 0; i < paramTypes.length; i++) {
			const t = paramTypes[i]!
			const provided = i < args.length ? args[i] : t.default
			cast.push(coerceTo(t, provided))
		}
		if (variadicTail !== undefined) {
			for (let i = paramTypes.length; i < args.length; i++) {
				cast.push(coerceTo(variadicTail, args[i]))
			}
		}
		const result = fn(...cast)
		// Coerce the return value as well — guarantees the declared return type.
		return coerceTo(returnType, result)
	}
	Object.defineProperty(wrapped, '__glispTypedFn', { value: true })
	Object.defineProperty(wrapped, 'paramTypes', { value: paramTypes })
	Object.defineProperty(wrapped, 'returnType', { value: returnType })
	if (paramNames !== undefined) {
		Object.defineProperty(wrapped, 'paramNames', { value: paramNames })
	}
	if (variadicTail !== undefined) {
		Object.defineProperty(wrapped, 'variadicTail', { value: variadicTail })
	}
	return wrapped as TypedHostFn
}

export function isTypedHostFn(v: unknown): v is TypedHostFn {
	return (
		typeof v === 'function' &&
		(v as { __glispTypedFn?: true }).__glispTypedFn === true
	)
}

// -----------------------------------------------------------------------------
// Overload — multi-variant dispatch
// -----------------------------------------------------------------------------

/**
 * A multi-variant function value: a sequence of variants (typed host fns
 * or Glisp closures) where the first one whose declared parameter types
 * match the call's arg types is chosen.
 *
 * Created by the `overload` special form. `eval` dispatches by walking
 * the call's args through `infer` + `typeFits` against each variant's
 * declared param types in order; the first match wins.
 */
export class OverloadValue {
	constructor(
		public readonly variants: ReadonlyArray<TypedHostFn | GlispClosure>
	) {}
}

export function isOverload(v: unknown): v is OverloadValue {
	return v instanceof OverloadValue
}

// -----------------------------------------------------------------------------
// IO action — deferred effect
// -----------------------------------------------------------------------------

/**
 * A computed effect awaiting execution. Created by special forms like
 * `def` that mutate the env (or other side effects); a host runs them by
 * calling `.run()`. The REPL forces top-level IO actions automatically;
 * elsewhere they sit inert as `(IO ())`-typed values.
 *
 * `run` returns the diagnostics produced by the effect itself (e.g. a
 * name collision when binding) so the host can surface them.
 */
export class IO {
	constructor(
		public readonly description: string,
		public readonly run: () => ReadonlyArray<Diagnostic>
	) {}
}

export function isIO(v: unknown): v is IO {
	return v instanceof IO
}

// Static type inference lives in infer.ts. Internally exposed via the
// `lookupBareName` helper below so infer can walk the same env chain.
export { lookupBareName }

// -----------------------------------------------------------------------------
// Type-value head: parametric apply, or reject with `@` hint
// -----------------------------------------------------------------------------

function evalTypeApply(
	head: TypeValue,
	positional: ReadonlyArray<AST>,
	kwargs: ReadonlyMap<string, AST> | undefined,
	env: Env,
	site: AST,
	diagnostics: Diagnostic[]
): EvalResult {
	if (head.apply === undefined) {
		diagnostics.push(
			diag(
				site,
				env,
				`${head.typeName} is a type — use (@ ${head.typeName} v) for coercion`
			)
		)
		return { value: UNIT, diagnostics }
	}
	const typeArgs: TypeValue[] = []
	for (const argAst of positional) {
		const r = evaluate(argAst, env)
		push(diagnostics, r.diagnostics)
		if (!isTypeValue(r.value)) {
			diagnostics.push(
				diag(
					argAst,
					env,
					`type constructor ${head.typeName} expects type arguments`
				)
			)
			return { value: UNIT, diagnostics }
		}
		typeArgs.push(r.value)
	}
	if (kwargs && kwargs.size > 0) {
		diagnostics.push(
			diag(
				site,
				env,
				`type constructor ${head.typeName} does not accept keyword arguments`
			)
		)
	}
	const result = head.apply(typeArgs)
	if ('error' in result) {
		diagnostics.push(diag(site, env, result.error))
		return { value: UNIT, diagnostics }
	}
	return { value: result, diagnostics }
}

// -----------------------------------------------------------------------------
// Typed host fn dispatch (static check + cast)
// -----------------------------------------------------------------------------

function callTypedHostFn(
	fn: TypedHostFn,
	positional: ReadonlyArray<AST>,
	kwargs: ReadonlyMap<string, AST> | undefined,
	env: Env,
	site: AST,
	priorDiagnostics: ReadonlyArray<Diagnostic>
): EvalResult {
	const diagnostics = [...priorDiagnostics]
	const argValues: unknown[] = []

	// Resolve effective positional list by routing kwargs into named slots.
	// A typed host fn with no `paramNames` cannot accept kwargs.
	const effectivePositional: Array<AST | undefined> = positional.slice()
	if (kwargs && kwargs.size > 0) {
		if (fn.paramNames === undefined) {
			diagnostics.push(
				diag(
					site,
					env,
					'cannot pass keyword arguments to this host function (no parameter names)'
				)
			)
		} else {
			const names = fn.paramNames
			for (const [name, ast] of kwargs) {
				const idx = names.indexOf(name)
				if (idx === -1) {
					diagnostics.push(
						diag(site, env, `unknown keyword argument: ${name}`)
					)
					continue
				}
				if (effectivePositional[idx] !== undefined) {
					diagnostics.push(
						diag(site, env, `double binding of parameter ${name}`)
					)
				}
				effectivePositional[idx] = ast
			}
		}
	}

	const totalSlots =
		fn.variadicTail !== undefined
			? Math.max(fn.paramTypes.length, effectivePositional.length)
			: fn.paramTypes.length

	for (let i = 0; i < totalSlots; i++) {
		const paramType =
			i < fn.paramTypes.length ? fn.paramTypes[i]! : fn.variadicTail!
		const argAst = effectivePositional[i]

		// Missing required argument → diagnostic + paramType.default
		if (argAst === undefined) {
			diagnostics.push(
				diag(
					site,
					env,
					`missing argument for parameter ${i + 1} (expected ${paramType.typeName})`
				)
			)
			argValues.push(paramType.default)
			continue
		}

		// Static type check — a confirmed mismatch lets us skip evaluation
		// of the argument entirely and substitute the default. `typeFits`
		// handles top, function-structural compat, and primitive identity
		// uniformly.
		const inferred = infer(argAst, env)
		if (inferred !== null && !typeFits(inferred, paramType)) {
			diagnostics.push(
				diag(
					argAst,
					env,
					`type mismatch: expected ${paramType.typeName}, got ${inferred.typeName}`
				)
			)
			argValues.push(paramType.default)
			continue
		}

		// Type compatible (or unknown) — evaluate, then runtime-cast.
		const r = evaluate(argAst, env)
		push(diagnostics, r.diagnostics)
		const v = r.value
		if (v !== UNIT && !paramType.fits(v)) {
			diagnostics.push(
				diag(
					argAst,
					env,
					`type mismatch at runtime: expected ${paramType.typeName}, got ${describeType(v)}`
				)
			)
		}
		argValues.push(coerceTo(paramType, v))
	}

	if (
		fn.variadicTail === undefined &&
		positional.length > fn.paramTypes.length
	) {
		diagnostics.push(
			diag(
				site,
				env,
				`too many positional arguments: expected ${fn.paramTypes.length}, got ${positional.length}`
			)
		)
	}

	try {
		const result = fn(...argValues)
		return { value: result, diagnostics }
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e)
		diagnostics.push(diag(site, env, `host function threw: ${message}`))
		return { value: UNIT, diagnostics }
	}
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

		case 'host':
			return ok(ast.value)

		case 'sym': {
			const target = lookupBareName(ast.name, env)
			if (target === null) {
				return fail(ast, env, `unresolvable name: ${ast.name}`)
			}
			const r = evaluate(target.ast, target.env)
			// If the binding has a declared type (e.g. closure parameter
			// with `x: number`), cast the resolved value through that
			// type — `fits` → return as-is, otherwise fall back to the
			// type's default with a runtime diagnostic.
			if (target.type !== undefined && isTypeValue(target.type)) {
				const t = target.type
				if (r.value !== UNIT && !t.fits(r.value)) {
					const diagnostics = [
						...r.diagnostics,
						diag(
							ast,
							env,
							`type mismatch at runtime: expected ${t.typeName}, got ${describeType(r.value)}`
						),
					]
					return { value: t.default, diagnostics }
				}
				return { value: coerceTo(t, r.value), diagnostics: r.diagnostics }
			}
			return r
		}

		case 'vec': {
			// Push a transparent frame so paths inside elements (`./0`,
			// `./1`, …) can navigate to siblings via the AST chain.
			const inside = pushAncestor(ast, env)
			const { values, diagnostics } = evalListElements(
				ast.elements,
				inside
			)
			return { value: values, diagnostics }
		}

		case 'record': {
			const inside = pushAncestor(ast, env)
			const result: Record<string, unknown> = {}
			const diagnostics: Diagnostic[] = []
			for (const entry of ast.fields) {
				if (entry instanceof SpreadAST) {
					const r = evaluate(entry.expr, inside)
					push(diagnostics, r.diagnostics)
					if (isPlainRecord(r.value)) {
						Object.assign(result, r.value)
					} else {
						diagnostics.push(
							diag(entry, inside, 'record spread operand must be a record')
						)
					}
				} else {
					const [name, value] = entry
					const r = evaluate(value, inside)
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
			return ok(makeClosure(ast, env))

		case 'call':
			return evalCall(ast, env)

		case 'path':
			return evalPath(ast.segments, env, ast)

		// macro-related annotations are transparent during eval, but the
		// quote AST still pushes an ancestor frame so path navigation
		// inside it walks `..` correctly across the boundary.
		case 'quote':
		case 'unquote':
		case 'splice':
			return evaluate(ast.expr, pushAncestor(ast, env))

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

/**
 * Push a transparent ancestor frame onto `env` whose `ast` is `node`.
 * No bindings — bare-name lookup walks straight through it. Used so
 * paths inside calls / vecs / records / quotes can navigate
 * `./childIndex` and `..` correctly per docs/spec/eval.md.
 */
function pushAncestor(node: AST, env: Env): Env {
	return { ast: node, parent: env }
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
	// Push a transparent ancestor frame so paths inside the call's head
	// or args can navigate using `./N` (head=0, args=1..) and `..` to
	// the surrounding scope. The frame is bindings-less, so bare-name
	// lookup walks straight through it.
	const inside = pushAncestor(ast, env)

	// Special forms — dispatched by head's symbol name.
	if (ast.head.kind === 'sym') {
		switch (ast.head.name) {
			case '?':
				return evalMatch(ast, inside)
			case '|>':
				return evalPipe(ast, inside)
			case '@':
				return evalCoerce(ast, inside)
			case 'def':
				return evalDef(ast, inside)
			case 'undef':
				return evalUndef(ast, inside)
			case 'overload':
				return evalOverload(ast, inside)
		}
	}

	const headResult = evaluate(ast.head, inside)
	const diagnostics = [...headResult.diagnostics]
	const headValue = headResult.value

	// Expand spread elements in positional args (yields a flat AST list).
	const expanded = expandPositionalArgs(ast.args, inside)
	push(diagnostics, expanded.diagnostics)
	const positional = expanded.asts
	const kwargs = ast.kwargs

	// Glisp closure → push body frame, bind params lazily.
	if (isGlispClosure(headValue)) {
		return applyClosure(
			headValue,
			positional,
			kwargs,
			inside,
			ast,
			diagnostics
		)
	}

	// Overload → pick the first variant whose declared param types fit
	// the inferred arg types, then dispatch to it.
	if (isOverload(headValue)) {
		return dispatchOverload(
			headValue,
			positional,
			kwargs,
			inside,
			ast,
			diagnostics
		)
	}

	// Type values: check before record fall-through (a TypeValue is a
	// branded plain object). Parametric types dispatch through `apply`;
	// non-parametric ones reject with a hint to use `@`.
	if (isTypeValue(headValue)) {
		return evalTypeApply(headValue, positional, kwargs, inside, ast, diagnostics)
	}

	// Vector → element access by integer index.
	if (Array.isArray(headValue)) {
		if (positional.length !== 1) {
			diagnostics.push(diag(ast, inside, 'vector access expects one index'))
			return { value: UNIT, diagnostics }
		}
		const idxR = evaluate(positional[0]!, inside)
		push(diagnostics, idxR.diagnostics)
		const idx = idxR.value
		if (typeof idx !== 'number') {
			diagnostics.push(diag(ast, inside, 'vector index must be a number'))
			return { value: UNIT, diagnostics }
		}
		const got = headValue[idx]
		if (got === undefined) {
			diagnostics.push(
				diag(ast, inside, `vector index out of bounds: ${idx}`)
			)
			return { value: UNIT, diagnostics }
		}
		return { value: got, diagnostics }
	}

	// Record → field access by string key.
	if (isPlainRecord(headValue)) {
		if (positional.length !== 1) {
			diagnostics.push(diag(ast, inside, 'record access expects one key'))
			return { value: UNIT, diagnostics }
		}
		const keyR = evaluate(positional[0]!, inside)
		push(diagnostics, keyR.diagnostics)
		const key = keyR.value
		if (typeof key !== 'string') {
			diagnostics.push(diag(ast, inside, 'record key must be a string'))
			return { value: UNIT, diagnostics }
		}
		const got = (headValue as Record<string, unknown>)[key]
		if (got === undefined) {
			diagnostics.push(diag(ast, inside, `record field not found: ${key}`))
			return { value: UNIT, diagnostics }
		}
		return { value: got, diagnostics }
	}

	// Typed host function — per-arg static type check + cast.
	if (isTypedHostFn(headValue)) {
		return callTypedHostFn(
			headValue,
			positional,
			kwargs,
			inside,
			ast,
			diagnostics
		)
	}

	// Untyped host function — eval all positional args strictly.
	if (typeof headValue === 'function') {
		const argValues: unknown[] = []
		for (const argAst of positional) {
			const r = evaluate(argAst, inside)
			argValues.push(r.value)
			push(diagnostics, r.diagnostics)
		}
		if (kwargs && kwargs.size > 0) {
			diagnostics.push(
				diag(ast, inside, 'cannot pass keyword arguments to a host function')
			)
		}
		try {
			const result = (headValue as (...args: unknown[]) => unknown)(
				...argValues
			)
			return { value: result, diagnostics }
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e)
			diagnostics.push(diag(ast, inside, `host function threw: ${message}`))
			return { value: UNIT, diagnostics }
		}
	}

	diagnostics.push(
		diag(ast, inside, `cannot call ${describeType(headValue)}`)
	)
	return { value: UNIT, diagnostics }
}

/**
 * Build the env in which a closure's parameter / return type expressions
 * are evaluated. Equal to `closure.capturedEnv` for non-generic functions;
 * for generic ones, layered with a frame binding each generic name to the
 * `TypeValue` inferred from the corresponding argument.
 *
 * Inference is shallow: only param.type that is a bare `sym(T)` where T is
 * a generic name participates. The first concrete inference wins; later
 * occurrences must agree (=== identity), otherwise a diagnostic.
 */
function resolveGenerics(
	fnAst: FnAST,
	positional: ReadonlyArray<AST>,
	kwargs: ReadonlyMap<string, AST> | undefined,
	callerEnv: Env,
	capturedEnv: Env,
	site: AST,
	diagnostics: Diagnostic[]
): Env {
	if (fnAst.generics.length === 0) return capturedEnv

	const genericNames = new Set(fnAst.generics)
	const resolved = new Map<string, TypeValue>()
	let posIdx = 0

	const witness = (name: string, t: TypeValue, source: AST): void => {
		const existing = resolved.get(name)
		if (existing === undefined) {
			resolved.set(name, t)
			return
		}
		if (existing !== t) {
			diagnostics.push(
				diag(
					source,
					callerEnv,
					`generic ${name} resolved to ${existing.typeName} earlier but argument here is ${t.typeName}`
				)
			)
		}
	}

	for (const param of fnAst.params) {
		// Only direct `sym(T)` participates — see top comment.
		const isGenericParam =
			param.type.kind === 'sym' && genericNames.has(param.type.name)

		// Pick the arg AST that this param will see, mirroring the bind
		// order in the main loop. Variadic / unmatched-and-no-kwarg params
		// don't witness anything.
		let argAst: AST | undefined
		let argEnv: Env = callerEnv
		if (param.variadic) {
			posIdx = positional.length // consumes rest
			argAst = undefined
		} else if (posIdx < positional.length) {
			argAst = positional[posIdx]
			posIdx++
		} else {
			argAst = kwargs?.get(param.name)
		}

		if (isGenericParam && argAst !== undefined) {
			const inferred = infer(argAst, argEnv)
			if (inferred !== null) {
				witness((param.type as { name: string }).name, inferred, argAst)
			}
		}
	}

	if (resolved.size === 0) return capturedEnv

	const map = new Map<string, BindingTarget>()
	const frame: Frame = { ast: fnAst, parent: capturedEnv, bindings: map }
	for (const [name, t] of resolved) {
		map.set(name, { ast: new LitASTClass(t as never), env: frame })
	}
	return frame
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

	// Resolve generic parameters from arg types via shallow unification:
	// param.type that is a bare sym matching a generic name is bound to
	// `infer(argAst, callerEnv)`. Repeated occurrences must agree; a
	// conflict raises a diagnostic and the first binding wins.
	//
	// Anything more elaborate (nested type constructors, return-position
	// constraints, default fallback when inference fails) is intentionally
	// out of scope for this pass — generics here are a "shape match the
	// obvious thing" mechanism, not a full HM-style solver.
	const typeEvalEnv = resolveGenerics(
		fnAst,
		positional,
		kwargs,
		callerEnv,
		closure.capturedEnv,
		site,
		diagnostics
	)

	const map = new Map<string, BindingTarget>()
	let posIdx = 0

	// Pre-evaluate each parameter's declared type in the type-eval env
	// (closure's captured env, optionally extended with resolved generics).
	// When the expression evaluates to a `TypeValue`, it drives both
	// static checking at the call site and lazy cast-on-force at the use
	// site. Otherwise the slot is untyped — a type expression that fails
	// to resolve degrades silently rather than noising up the call's
	// diagnostics, since the user already sees an error wherever the
	// type itself is referenced.
	const paramTypes: Array<TypeValue | null> = []
	for (const param of fnAst.params) {
		const tr = evaluate(param.type, typeEvalEnv)
		// `_` (top) is a no-op cast — skip it to keep error messages and the
		// memo-cache key shape clean.
		if (isTypeValue(tr.value) && tr.value.typeName !== '_') {
			push(diagnostics, tr.diagnostics)
			paramTypes.push(tr.value)
		} else {
			paramTypes.push(null)
		}
	}

	const bindParam = (
		name: string,
		argAst: AST,
		argEnv: Env,
		paramType: TypeValue | null
	): void => {
		if (paramType === null) {
			map.set(name, { ast: argAst, env: argEnv })
			return
		}
		// Static type check — a confirmed mismatch lets us skip evaluation
		// of the argument entirely and substitute the type's default.
		const inferred = infer(argAst, argEnv)
		if (inferred !== null && !typeFits(inferred, paramType)) {
			diagnostics.push(
				diag(
					argAst,
					argEnv,
					`type mismatch: expected ${paramType.typeName}, got ${inferred.typeName}`
				)
			)
			map.set(name, {
				ast: new LitASTClass(paramType.default as never),
				env: null,
			})
			return
		}
		// Compatible (or unknown) → bind lazily, cast at force time.
		map.set(name, { ast: argAst, env: argEnv, type: paramType })
	}

	for (let i = 0; i < fnAst.params.length; i++) {
		const param = fnAst.params[i]!
		const paramType = paramTypes[i]!

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
			// Variadic param's declared type is the element type; the
			// binding itself is a vector of those. Skip lazy-cast for now
			// (would require per-element rewriting) — bind untyped.
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
			bindParam(param.name, positional[posIdx]!, callerEnv, paramType)
			posIdx++
			continue
		}

		const kwargAst = kwargs?.get(param.name)
		if (kwargAst !== undefined) {
			bindParam(param.name, kwargAst, callerEnv, paramType)
			continue
		}

		if (param.optional) {
			// Optional missing → bind to the param type's default (silent
			// fallback). With no declared type, fall back to UNIT.
			const defaultValue = paramType !== null ? paramType.default : UNIT
			map.set(param.name, {
				ast: new LitASTClass(defaultValue as never),
				env: null,
			})
			continue
		}

		diagnostics.push(
			diag(
				site,
				callerEnv,
				paramType !== null
					? `missing required parameter ${param.name} (expected ${paramType.typeName})`
					: `missing required parameter: ${param.name}`
			)
		)
		const defaultValue = paramType !== null ? paramType.default : UNIT
		map.set(param.name, {
			ast: new LitASTClass(defaultValue as never),
			env: null,
		})
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
		parent: typeEvalEnv,
		bindings: map,
	}
	const r = evaluate(fnAst.body, bodyFrame)
	push(diagnostics, r.diagnostics)

	// Cast the return value through the declared return type — symmetric
	// with parameter binding. `_` is the top type, treated as a no-op.
	// As with parameter types, an unresolvable return type expression
	// degrades silently to "no return cast."
	const rtResult = evaluate(fnAst.returnType, typeEvalEnv)
	if (isTypeValue(rtResult.value) && rtResult.value.typeName !== '_') {
		push(diagnostics, rtResult.diagnostics)
		const rt = rtResult.value
		if (r.value !== UNIT && !rt.fits(r.value)) {
			diagnostics.push(
				diag(
					fnAst.body,
					callerEnv,
					`return type mismatch: expected ${rt.typeName}, got ${describeType(r.value)}`
				)
			)
			return { value: rt.default, diagnostics }
		}
		return { value: coerceTo(rt, r.value), diagnostics }
	}
	return { value: r.value, diagnostics }
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
	// If the pattern is a type value, use its `fits` predicate (non-fallback
	// type test) — this is the spec's "pattern is a type → cast succeeds"
	// branch without actually consuming the cast's default fallback.
	if (isTypeValue(pattern)) {
		return pattern.fits(value)
	}
	// Otherwise: structural equality.
	return value === pattern
}

/**
 * `(@ T v)` — explicit coercion. `T` must evaluate to a type value;
 * `v` is then run through `T.fits`. On success the original `v` flows
 * through; on failure the call returns `T.default` and emits a
 * diagnostic. `()` always coerces silently to the type's default
 * (matches the typed-slot convention in `types.md`).
 *
 * Replaces the now-removed `(T v)` cast form. Pattern matching via `?`
 * remains the way to test a type without consuming the default.
 */
function evalCoerce(ast: CallAST, env: Env): EvalResult {
	if (ast.args.length !== 2) {
		return fail(
			ast,
			env,
			'@ expects exactly 2 arguments: type and value'
		)
	}
	const tResult = evaluate(ast.args[0]!, env)
	const diagnostics = [...tResult.diagnostics]
	const t = tResult.value
	if (!isTypeValue(t)) {
		diagnostics.push(
			diag(
				ast.args[0]!,
				env,
				`@: first argument must be a type, got ${describeType(t)}`
			)
		)
		return { value: UNIT, diagnostics }
	}
	const vResult = evaluate(ast.args[1]!, env)
	push(diagnostics, vResult.diagnostics)
	const v = vResult.value
	if (v === UNIT) {
		return { value: t.default, diagnostics }
	}
	if (!t.fits(v)) {
		diagnostics.push(
			diag(
				ast.args[1]!,
				env,
				`${t.typeName} doesn't accept ${describeType(v)} value`
			)
		)
		return { value: t.default, diagnostics }
	}
	return { value: v, diagnostics }
}

/**
 * `(overload e1 e2 ...)` — bundles multiple function variants into a
 * single dispatcher value. Each `eK` must evaluate to a typed host fn
 * or a Glisp closure. The `OverloadValue` returned here gets handled
 * specially in `evalCall`, which selects the first variant whose
 * declared param types match the call's arg types.
 *
 * Variants are tried in order, so order them most-specific first.
 */
function evalOverload(ast: CallAST, env: Env): EvalResult {
	if (ast.args.length === 0) {
		return fail(ast, env, 'overload requires at least one variant')
	}
	const variants: Array<TypedHostFn | GlispClosure> = []
	const diagnostics: Diagnostic[] = []
	for (const argAst of ast.args) {
		const r = evaluate(argAst, env)
		push(diagnostics, r.diagnostics)
		const v = r.value
		if (isTypedHostFn(v) || isGlispClosure(v)) {
			variants.push(v)
		} else {
			diagnostics.push(
				diag(
					argAst,
					env,
					'overload variant must be a function (typed host fn or closure)'
				)
			)
		}
	}
	return { value: new OverloadValue(variants), diagnostics }
}

/**
 * Pick the first variant whose declared parameter types fit the
 * (statically inferred) types of the call's arguments. Falls back to
 * a diagnostic + `()` when no variant matches.
 */
function dispatchOverload(
	o: OverloadValue,
	positional: ReadonlyArray<AST>,
	kwargs: ReadonlyMap<string, AST> | undefined,
	env: Env,
	site: AST,
	priorDiagnostics: ReadonlyArray<Diagnostic>
): EvalResult {
	const diagnostics = [...priorDiagnostics]
	const argTypes = positional.map(a => infer(a, env))

	for (const variant of o.variants) {
		if (variantMatches(variant, positional, argTypes, env)) {
			if (isTypedHostFn(variant)) {
				return callTypedHostFn(
					variant,
					positional,
					kwargs,
					env,
					site,
					diagnostics
				)
			}
			return applyClosure(
				variant,
				positional,
				kwargs,
				env,
				site,
				diagnostics
			)
		}
	}

	const sigs = o.variants
		.map(v => describeVariantSignature(v))
		.join(' / ')
	const argSigs = argTypes
		.map(t => (t === null ? '?' : t.typeName))
		.join(' ')
	diagnostics.push(
		diag(
			site,
			env,
			`no overload matches arguments (${argSigs}); variants: ${sigs}`
		)
	)
	return { value: UNIT, diagnostics }
}

function variantMatches(
	variant: TypedHostFn | GlispClosure,
	positional: ReadonlyArray<AST>,
	argTypes: ReadonlyArray<TypeValue | null>,
	env: Env
): boolean {
	if (isTypedHostFn(variant)) {
		const variadic = variant.variadicTail !== undefined
		if (!variadic && positional.length !== variant.paramTypes.length) {
			return false
		}
		if (variadic && positional.length < variant.paramTypes.length) {
			return false
		}
		for (let i = 0; i < positional.length; i++) {
			const expected =
				i < variant.paramTypes.length
					? variant.paramTypes[i]!
					: variant.variadicTail!
			const inferred = argTypes[i]
			if (inferred === null || inferred === undefined) continue
			if (!typeFits(inferred, expected)) return false
		}
		return true
	}
	// Closure
	const fnAst = variant.ast
	const variadic = fnAst.params.some(p => p.variadic)
	if (
		!variadic &&
		positional.length !== fnAst.params.filter(p => !p.optional).length &&
		positional.length !== fnAst.params.length
	) {
		// Allow either "exact param count" or "all required". Optional
		// parameters can be skipped.
		const required = fnAst.params.filter(p => !p.optional).length
		if (positional.length < required || positional.length > fnAst.params.length) {
			return false
		}
	}
	for (let i = 0; i < positional.length; i++) {
		const param = fnAst.params[i] ?? fnAst.params[fnAst.params.length - 1]
		if (param === undefined) continue
		const t = evaluate(param.type, variant.capturedEnv).value
		if (!isTypeValue(t)) continue
		const inferred = argTypes[i]
		if (inferred === null || inferred === undefined) continue
		if (!typeFits(inferred, t)) return false
	}
	void env
	return true
}

function describeVariantSignature(
	variant: TypedHostFn | GlispClosure
): string {
	if (isTypedHostFn(variant)) {
		const params = variant.paramTypes.map((t, i) => {
			const name = variant.paramNames?.[i] ?? `_${i}`
			return `${name}: ${t.typeName}`
		})
		if (variant.variadicTail !== undefined) {
			params.push(`...rest: ${variant.variadicTail.typeName}`)
		}
		return `(=> (${params.join(' ')}): ${variant.returnType.typeName})`
	}
	return variant.ast.print()
}

/**
 * `(def name expr)` — REPL/host primitive that lazily binds `name` to
 * `expr` in the topmost mutable scope of the calling env. Returns an
 * `IO`; the host runs it (in the REPL, top-level IO actions run
 * automatically) which mutates the target frame's bindings.
 *
 * Crucially, `expr` is captured as an AST without being evaluated. The
 * expression only runs when the bound name is later referenced, and
 * memoization ensures it runs at most once.
 */
function evalDef(ast: CallAST, env: Env): EvalResult {
	if (ast.args.length !== 2) {
		return fail(ast, env, 'def expects exactly 2 arguments: name and expression')
	}

	const nameResult = evaluate(ast.args[0]!, env)
	const diagnostics = [...nameResult.diagnostics]
	const name = nameResult.value
	if (typeof name !== 'string') {
		diagnostics.push(
			diag(ast.args[0]!, env, 'def: name must evaluate to a string')
		)
		return { value: UNIT, diagnostics }
	}

	const valueAst = ast.args[1]!
	const target = topmostMutableFrame(env)
	if (target === null) {
		diagnostics.push(diag(ast, env, 'def: no mutable scope to bind into'))
		return { value: UNIT, diagnostics }
	}

	const action = new IO(`def ${JSON.stringify(name)}`, () => {
		const map = target.bindings as Map<string, BindingTarget>
		map.set(name, { ast: valueAst, env: target })
		return []
	})
	return { value: action, diagnostics }
}

/**
 * `(undef name)` — companion to `def`. Returns an `IO` that, when
 * run, deletes the binding `name` from the topmost mutable scope. If the
 * name isn't bound there, the action emits a diagnostic at run time.
 */
function evalUndef(ast: CallAST, env: Env): EvalResult {
	if (ast.args.length !== 1) {
		return fail(ast, env, 'undef expects exactly 1 argument: name')
	}
	const nameResult = evaluate(ast.args[0]!, env)
	const diagnostics = [...nameResult.diagnostics]
	const name = nameResult.value
	if (typeof name !== 'string') {
		diagnostics.push(
			diag(ast.args[0]!, env, 'undef: name must evaluate to a string')
		)
		return { value: UNIT, diagnostics }
	}
	const target = topmostMutableFrame(env)
	if (target === null) {
		diagnostics.push(diag(ast, env, 'undef: no mutable scope to unbind from'))
		return { value: UNIT, diagnostics }
	}
	const action = new IO(`undef ${JSON.stringify(name)}`, () => {
		const map = target.bindings as Map<string, BindingTarget>
		if (!map.has(name)) {
			return [diag(ast, env, `undef: '${name}' is not bound`)]
		}
		map.delete(name)
		return []
	})
	return { value: action, diagnostics }
}

/**
 * Walk up the env chain and return the topmost frame whose `bindings`
 * map is a real (mutable) `Map`. Used by `def` to find the prelude scope
 * — outer frames win over inner ones so a `(def ...)` deep inside a
 * let-block still affects the REPL prelude rather than a transient
 * binding map that's about to go out of scope.
 */
function topmostMutableFrame(env: Env): Frame | null {
	let frame = env
	let chosen: Frame | null = null
	while (frame !== null) {
		if (frame.bindings instanceof Map) chosen = frame
		frame = frame.parent
	}
	return chosen
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

		if (isGlispClosure(fnValue)) {
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
		typeof v !== 'function'
	)
}

function describeType(v: unknown): string {
	if (v === UNIT) return 'unit'
	if (v === null) return 'null'
	if (Array.isArray(v)) return 'vector'
	if (isGlispClosure(v)) return 'closure'
	if (v instanceof IO) return 'IO'
	if (isTypeValue(v)) return `type<${v.typeName}>`
	return typeof v
}

// -----------------------------------------------------------------------------
// toAst — convert a runtime value back to an AST that evaluates to the value.
// -----------------------------------------------------------------------------

import {
	CallAST as CallASTClass,
	HostAST as HostASTClass,
	LitAST as LitASTClass,
	QuoteAST as QuoteASTClass,
	RecordAST as RecordASTClass,
	SymAST as SymASTClass,
	VecAST as VecASTClass,
	ASTNode as ASTNodeClass,
} from './types.js'

/**
 * Convert a runtime value to an AST handle that, when evaluated against
 * the provided env, yields the same value (modulo marshaling).
 *
 * Strategy:
 * - primitives → literal AST
 * - vector / record → recurse over elements / fields
 * - GlispClosure → its captured function-literal AST
 * - AST handle → `` `expr `` (quasiquote wrap)
 * - type value → bare symbol if env binds the name, else falls back to a
 *   sym with the type's stored name
 * - typed host fn → bare symbol if env binds the name, else opaque literal
 * - other JS function → bare symbol if env binds the name, else opaque literal
 *
 * Spec: docs/spec/host-api.md — `g.toAst`
 */
export function toAst(value: unknown, env: Env): AST {
	if (
		typeof value === 'number' ||
		typeof value === 'string' ||
		typeof value === 'boolean' ||
		value === UNIT
	) {
		return new LitASTClass(value as never)
	}
	if (value === null || value === undefined) {
		return new LitASTClass(UNIT)
	}
	if (isGlispClosure(value)) {
		// Prefer a bound name when available — re-evaluating a bare symbol
		// resolves through the binding rather than rebuilding the AST.
		const name = nameForBoundValue(env, value)
		if (name !== null) return new SymASTClass(name)
		return value.ast
	}
	if (value instanceof IO) {
		// IO actions have no source representation; wrap as host so they
		// round-trip identity-wise.
		return new HostASTClass(value)
	}
	if (value instanceof ASTNodeClass) {
		return new QuoteASTClass(value as AST)
	}
	if (Array.isArray(value)) {
		return new VecASTClass(value.map(v => toAst(v, env)))
	}
	if (isTypeValue(value)) {
		const name = nameForBoundValue(env, value)
		if (name !== null) return new SymASTClass(name)
		// Parametric IO with a non-top payload: rebuild as a call to its
		// constructor so the resulting source actually parses (the bare
		// typeName `(IO number)` is not a valid identifier).
		if (
			value.shape.kind === 'io' &&
			value.shape.payload.typeName !== '_'
		) {
			return new CallASTClass(new SymASTClass('IO'), [
				toAst(value.shape.payload, env),
			])
		}
		return new SymASTClass(value.typeName)
	}
	if (typeof value === 'function') {
		// Typed or untyped host fn: prefer a bound name in env.
		const name = nameForBoundValue(env, value)
		if (name !== null) return new SymASTClass(name)
		// Otherwise wrap in a HostAST — preserves identity within a
		// process so the value survives a g.toAst → g.eval round trip,
		// at the cost of source-level round-trip (host values have no
		// source representation).
		return new HostASTClass(value)
	}
	if (typeof value === 'object') {
		const entries: Array<readonly [string, AST]> = []
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			entries.push([k, toAst(v, env)])
		}
		return new RecordASTClass(entries)
	}
	// Fallback — wrap whatever it is verbatim. Identity preserved.
	return new HostASTClass(value)
}

/**
 * Walk the env's frame chain looking for a binding whose evaluated value
 * is identical (`===`) to the given value. Returns the binding name if
 * found. Used by toAst to prefer a bare symbol over a structural rebuild.
 */
function nameForBoundValue(env: Env, value: unknown): string | null {
	let frame = env
	while (frame !== null) {
		if (frame.bindings) {
			for (const [name, target] of frame.bindings) {
				const r = evaluate(target.ast, target.env)
				if (r.value === value) return name
			}
		}
		frame = frame.parent
	}
	return null
}
