/**
 * AST builders for the host API.
 *
 * Each function returns a fresh AST class instance. Construction has no
 * env-resolution step; what comes out is a raw syntactic tree, equivalent
 * to what a parser would produce (minus trivia).
 *
 * The AST nodes themselves carry a `.meta(content)` method (defined on the
 * `ASTNode` base class), so the fluent form `lit(100).meta({ label: 'Width' })`
 * works on every builder result without per-builder wrapping.
 *
 * Spec: docs/spec/host-api.md — Builders
 */

import {
	AccessAST,
	type AST,
	CallAST,
	FnAST,
	type FnParam,
	LetAST,
	LitAST,
	type MetaContent,
	MetaAST,
	PathAST,
	QuoteAST,
	RecordAST,
	SpliceAST,
	SpreadAST,
	SymAST,
	UnquoteAST,
	type Unit,
	VecAST,
} from './types.js'

/**
 * Render an AST back to source. Equivalent to `ast.print()`; provided as a
 * top-level function for the `g.print` API namespace.
 */
export function print(ast: AST): string {
	return ast.print()
}

// -----------------------------------------------------------------------------
// AST builders
// -----------------------------------------------------------------------------

/** Literal AST. Distinguishes between number / string / boolean / unit by JS type. */
export function lit(value: number | string | boolean | Unit): LitAST {
	return new LitAST(value)
}

/** Symbol (bare identifier) AST. Use this for identifiers; `lit` is for values. */
export function sym(name: string): SymAST {
	return new SymAST(name)
}

/** Application: `(head a b ...)`. */
export function call(head: AST, ...args: ReadonlyArray<AST>): CallAST {
	return new CallAST(head, args)
}

/**
 * Application with keyword arguments: `(head a b k1=v1 k2=v2)`.
 */
export function callKw(
	head: AST,
	args: ReadonlyArray<AST>,
	kwargs: Readonly<Record<string, AST>>
): CallAST {
	return new CallAST(head, args, new Map(Object.entries(kwargs)))
}

/** Accessor sugar: `target.key`. Equivalent in meaning to `Call(target, [Lit(key)])`. */
export function access(target: AST, key: string | number): AccessAST {
	return new AccessAST(target, key)
}

/** Vector literal: `[e0 e1 ...]`. */
export function vec(...elements: ReadonlyArray<AST>): VecAST {
	return new VecAST(elements)
}

/**
 * Record literal: `{k1: v1 k2: v2 ...}`.
 *
 * Two input forms:
 *
 * - **Object literal** `{x: lit(1), y: lit(2)}` — keys collapse per JS rules
 *   (no duplicates can be expressed via this form).
 * - **Array of pairs** `[['x', lit(1)], ['x', lit(2)]]` — preserves duplicates
 *   so the AST can carry the source's literal repetition; evaluation will
 *   apply last-wins and emit a diagnostic.
 */
export function record(
	fields:
		| Readonly<Record<string, AST>>
		| ReadonlyArray<readonly [string, AST]>
): RecordAST {
	const arr: ReadonlyArray<readonly [string, AST]> = Array.isArray(fields)
		? fields
		: Object.entries(fields)
	return new RecordAST(arr)
}

/**
 * Let-block: bindings followed by an optional trailing expression.
 *
 *   letBlock([['a', lit(10)], ['b', lit(20)]], call(sym('+'), sym('a'), sym('b')))
 *   // → {a = 10  b = 20  (+ a b)}
 *
 * Exported as `g.let` (the keyword form is allowed as a property name).
 */
export function letBlock(
	bindings: ReadonlyArray<readonly [string, AST]>,
	body: AST | null = null
): LetAST {
	return new LetAST(bindings, body)
}

/**
 * Function literal AST.
 *
 *   fn(
 *     [
 *       { name: 'x', type: sym('number') },
 *       { name: 'y', type: sym('number') },
 *     ],
 *     sym('number'),
 *     call(sym('+'), sym('x'), sym('y')),
 *   )
 *   // → (=> (x: number y: number): number (+ x y))
 *
 * For function-type expressions (no body), pass `null` for `body`.
 * For generics, pass a list of type-variable names in `options.generics`.
 *
 * `optional`, `variadic` flags live on each `FnParam` entry.
 */
export function fn(
	params: ReadonlyArray<FnParam>,
	returnType: AST,
	body: AST | null = null,
	options?: { readonly generics?: ReadonlyArray<string> }
): FnAST {
	return new FnAST(options?.generics ?? [], params, returnType, body)
}

/**
 * Path AST. Pass segments in order, where `'..'` means parent.
 *
 *   path('foo')          → ./foo
 *   path('..', 'foo')    → ../foo
 *   path('..', '..', 'a')→ ../../a
 *   path()               → ./    (the current node itself)
 */
export function path(
	...segments: ReadonlyArray<'..' | string | number>
): PathAST {
	return new PathAST(segments)
}

/** Quasiquote: `` `expr ``. */
export function quote(expr: AST): QuoteAST {
	return new QuoteAST(expr)
}

/** Unquote: `~expr`. */
export function unquote(expr: AST): UnquoteAST {
	return new UnquoteAST(expr)
}

/**
 * Spread: `...expr`. Inlines the operand into the surrounding call / vec /
 * record / quasiquote. Use this for variadic/spread positions; it remains
 * `...expr` even inside a quasiquote.
 */
export function spread(expr: AST): SpreadAST {
	return new SpreadAST(expr)
}

/**
 * Unquote-splice: `...~expr`. Only meaningful inside a quasiquote. For
 * non-evaluating spread, use `spread()` instead.
 */
export function splice(expr: AST): SpliceAST {
	return new SpliceAST(expr)
}

/**
 * Metadata-attached expression: `^{...meta} expr`.
 *
 * Accepts the same `MetaContent` form as the fluent `.meta()` method —
 * an object whose values are AST nodes or plain JS primitives (auto-lifted
 * to literals). The fluent form `expr.meta({...})` is usually nicer; this
 * function exists for cases where the wrapping order is more natural.
 */
export function meta(content: MetaContent, expr: AST): MetaAST {
	return expr.meta(content)
}

// -----------------------------------------------------------------------------
// `g` namespace
// -----------------------------------------------------------------------------

/**
 * The `g` namespace bundles all builders. Equivalent to importing each function
 * by name; some hosts prefer the namespaced form (`g.lit(...)`) per the spec.
 */
export const g = {
	lit,
	sym,
	call,
	callKw,
	access,
	vec,
	record,
	let: letBlock,
	fn,
	path,
	quote,
	unquote,
	spread,
	splice,
	meta,
	print,
}
