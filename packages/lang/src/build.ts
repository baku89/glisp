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

import { print } from './print.js'
import {
	AccessAST,
	type AST,
	CallAST,
	FnAST,
	type FnParam,
	HostAST,
	LetAST,
	LitAST,
	type MetaContent,
	MetaAST,
	PathAST,
	HIDDEN,
	NAME,
	PIN,
	RecordAST,
	type RecordEntry,
	SpreadAST,
	SymAST,
	UnquoteAST,
	type Unit,
	VecAST,
} from './types.js'

// -----------------------------------------------------------------------------
// AST builders
// -----------------------------------------------------------------------------

/** Literal AST. Distinguishes between number / string / boolean / unit by JS type. */
export function lit(value: number | string | boolean | Unit): LitAST {
	return new LitAST(value)
}

/**
 * Host-value AST. Wraps a host-side value (TypeValue, TypedHostFn,
 * GlispClosure, IO, opaque object) so the env can hand it back
 * unchanged when evaluated. Distinct from `lit` because the source
 * language has no way to express these values literally.
 */
export function host(value: unknown): HostAST {
	return new HostAST(value)
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
 * Application with keyword arguments: `(head a b k1: v1 k2: v2)`.
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
 * Record literal: `{k1: v1 k2: v2 ...rec ...}`.
 *
 * Two input forms:
 *
 * - **Object literal** `{x: lit(1), y: lit(2)}` — keys collapse per JS rules
 *   (no duplicates / no spreads expressible).
 * - **Array of entries** `[['x', lit(1)], spread(sym('rec')), ['y', lit(2)]]` —
 *   preserves duplicates and lets `SpreadAST` entries appear inline. Evaluation
 *   applies last-wins (after expanding spreads) and emits a diagnostic for
 *   duplicates.
 */
export function record(
	fields:
		| Readonly<Record<string, AST>>
		| ReadonlyArray<RecordEntry>
): RecordAST {
	const arr: ReadonlyArray<RecordEntry> = Array.isArray(fields)
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
 * Function literal / function-type AST.
 *
 * Always returns a plain `FnAST` (with `body = null` — i.e. a function-type
 * expression). Chain `.withBody(expr)` and/or `.withGenerics(...)` on the
 * result to add a body and generic parameters; both produce a new FnAST.
 *
 *   fn({a: g.number, b: g.number}, g.number)
 *   // → (=> (a: number b: number): number)   — function type value
 *
 *   fn({a: g.number, b: g.number}, g.number).withBody(call(sym('+'), sym('a'), sym('b')))
 *   // → (=> (a: number b: number): number (+ a b))   — function literal AST
 *
 *   fn({xs: g.vector(g.sym('T'))}, g.sym('T'))
 *     .withGenerics('T')
 *     .withBody(...)
 *
 * `params` accepts either the array form (with optional/variadic flags) or
 * an object literal `{name: type, ...}` for the common all-required case.
 */
export function fn(
	params:
		| ReadonlyArray<FnParam>
		| Readonly<Record<string, AST>>,
	returnType: AST
): FnAST {
	const paramArray: ReadonlyArray<FnParam> = Array.isArray(params)
		? params
		: Object.entries(params).map(([name, type]) => ({ name, type }))
	return new FnAST([], paramArray, returnType, null)
}

/**
 * Path AST. Pass segments in order, where `'..'` means parent, and a leading `'/'` the root of the program.
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

/** `~expr`: work out `expr` within one expansion step. */
export function unquote(expr: AST): UnquoteAST {
	return new UnquoteAST(expr)
}

/**
 * Spread: `...expr`. Inlines the operand into the surrounding call / vec /
 * record. `spread(unquote(x))` prints as `...~x`.
 */
export function spread(expr: AST): SpreadAST {
	return new SpreadAST(expr)
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

/** `expr` with a mark of metadata, which has no value but itself. */
function marked(expr: AST, key: string): MetaAST {
	if (expr.kind !== 'meta') return new MetaAST(new RecordAST([[key, lit(true)]]), expr)
	if (expr.metadata.get(key) !== undefined) return expr
	const { fields, optional } = expr.metadata
	return new MetaAST(new RecordAST([...fields, [key, lit(true)]], optional), expr.expr)
}

/** `ast` without that mark, keeping any other metadata. */
function unmarked(ast: AST, key: string): AST {
	if (ast.kind !== 'meta' || ast.metadata.get(key) === undefined) return ast
	const { fields, optional } = ast.metadata
	const others = fields.filter(field => 'kind' in field || field[0] !== key)
	return others.length === 0
		? ast.expr
		: new MetaAST(new RecordAST(others, optional), ast.expr)
}

/** `@expr`: metadata that says to leave this where it is. */
export const pin = (expr: AST): MetaAST => marked(expr, PIN)
export const isPinned = (ast: AST): boolean =>
	ast.kind === 'meta' && ast.metadata.get(PIN) !== undefined
/** `ast` without its `@`, keeping any other metadata. */
export const unpin = (ast: AST): AST => unmarked(ast, PIN)

/**
 * `name = expr`: the name `expr` has where it stands, as metadata that changes no value. A name it
 * had already goes. See syntax.md (Names).
 */
export function named(name: string, expr: AST): MetaAST {
	const bare = unnamed(expr)
	if (bare.kind !== 'meta') return new MetaAST(new RecordAST([[NAME, lit(name)]]), bare)
	const { fields, optional } = bare.metadata
	return new MetaAST(new RecordAST([[NAME, lit(name)], ...fields], optional), bare.expr)
}
const unnamedMemo: WeakMap<AST, AST> = new WeakMap()

/** `ast` without its name, keeping any other metadata: the same node each time, for it to be compared. */
export function unnamed(ast: AST): AST {
	if (ast.kind !== 'meta' || ast.metadata.get(NAME) === undefined) return ast
	let bare = unnamedMemo.get(ast)
	if (bare === undefined) unnamedMemo.set(ast, (bare = unmarked(ast, NAME)))
	return bare
}

/** `#_expr`: metadata that says this is not output, for a host to go by. */
export const hide = (expr: AST): MetaAST => marked(expr, HIDDEN)
export const isHidden = (ast: AST): boolean =>
	ast.kind === 'meta' && ast.metadata.get(HIDDEN) !== undefined
/** `ast` without its `#_`, keeping any other metadata. */
export const unhide = (ast: AST): AST => unmarked(ast, HIDDEN)

// -----------------------------------------------------------------------------
// Value builders — Glisp type values
//
// These produce ASTs that, when evaluated against the standard prelude,
// resolve to the corresponding Glisp type values. Until the evaluator is in
// place they're handled as plain AST handles; the host API contract is
// preserved (per docs/spec/host-api.md).
// -----------------------------------------------------------------------------

/** The `number` type. */
export const numberType: SymAST = sym('number')
/** The `string` type. */
export const stringType: SymAST = sym('string')
/** The `boolean` type. */
export const booleanType: SymAST = sym('boolean')
/** The `unit` type. */
export const unitType: SymAST = sym('unit')
/** The `_` (top) type. */
export const topType: SymAST = sym('_')
/** The `!` (bottom) type. */
export const bottomType: SymAST = sym('!')
/** The `ast` type — type of quoted forms / macro inputs and outputs. */
export const astType: SymAST = sym('ast')

/**
 * `[...T]` — vector type with element type `T`. Renders as `[...T]` in source.
 */
export function vectorType(T: AST): VecAST {
	return vec(spread(T))
}

/**
 * `(| v1 v2 ...)`: the type of just the literal values given, each of which is a
 * type of that value alone.
 */
export function oneOfType(
	...values: ReadonlyArray<number | string | boolean>
): CallAST {
	return call(sym('|'), ...values.map(v => lit(v)))
}

// -----------------------------------------------------------------------------
// `g` namespace
// -----------------------------------------------------------------------------

/**
 * The `g` namespace bundles all builders. Equivalent to importing each function
 * by name; some hosts prefer the namespaced form (`g.lit(...)`) per the spec.
 */
export const g = {
	// AST builders
	lit,
	host,
	sym,
	call,
	callKw,
	access,
	vec,
	record,
	let: letBlock,
	fn,
	path,
	unquote,
	spread,
	meta,
	print,
	// Value builders (type values)
	number: numberType,
	string: stringType,
	boolean: booleanType,
	unit: unitType,
	top: topType,
	bottom: bottomType,
	ast: astType,
	vector: vectorType,
	oneOf: oneOfType,
}
