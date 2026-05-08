/**
 * AST builders for the host API.
 *
 * Each function returns a fresh AST node. Construction has no env-resolution
 * step; what comes out is a raw syntactic tree, equivalent to what a parser
 * would produce (minus trivia).
 *
 * Spec: docs/spec/host-api.md — Builders
 */

import { print } from './print.js'
import type {
	AccessAST,
	AST,
	CallAST,
	FnAST,
	FnParam,
	LetAST,
	LitAST,
	MetaAST,
	PathAST,
	QuoteAST,
	RecordAST,
	SpliceAST,
	SymAST,
	UnquoteAST,
	Unit,
	VecAST,
} from './types.js'

// -----------------------------------------------------------------------------
// .meta() method support
// -----------------------------------------------------------------------------

/**
 * Values accepted as metadata field values: AST, or a JS primitive that is
 * auto-lifted to a `LitAST`.
 */
type MetaFieldValue = AST | number | string | boolean | Unit

type MetaContent = Readonly<Record<string, MetaFieldValue>>

/**
 * AST handle augmented with a `.meta(content)` method for fluent metadata
 * attachment: `lit(100).meta({ label: 'Width', default: 100 })` builds the
 * same AST as `meta(record({...}), lit(100))`.
 *
 * The method is added as a **non-enumerable** property so it doesn't appear
 * in `toEqual` comparisons, JSON.stringify, or object spreads — only the
 * data shape matters for equality.
 */
export type Withable<T extends AST> = T & {
	meta(content: MetaContent): MetaAST
}

function isAST(v: unknown): v is AST {
	return typeof v === 'object' && v !== null && 'kind' in v
}

function liftField(v: MetaFieldValue): AST {
	return isAST(v) ? v : lit(v)
}

/**
 * Attach a non-enumerable `.meta()` method to an AST and return it typed as
 * `Withable<T>`. Internal helper for builder return values.
 */
function attach<T extends AST>(ast: T): Withable<T> {
	Object.defineProperty(ast, 'meta', {
		value(content: MetaContent): MetaAST {
			const fields: Record<string, AST> = {}
			for (const [k, v] of Object.entries(content)) {
				fields[k] = liftField(v)
			}
			return attach({
				kind: 'meta',
				metadata: record(fields),
				expr: ast,
			})
		},
		enumerable: false,
		writable: false,
		configurable: false,
	})
	return ast as Withable<T>
}

// -----------------------------------------------------------------------------
// AST builders
// -----------------------------------------------------------------------------

/** Literal AST. Distinguishes between number / string / boolean / unit by JS type. */
export function lit(value: number | string | boolean | Unit): Withable<LitAST> {
	return attach({ kind: 'lit', value })
}

/** Symbol (bare identifier) AST. Use this for identifiers; `lit` is for values. */
export function sym(name: string): Withable<SymAST> {
	return attach({ kind: 'sym', name })
}

/** Application: `(head a b ...)`. */
export function call(
	head: AST,
	...args: ReadonlyArray<AST>
): Withable<CallAST> {
	return attach({ kind: 'call', head, args })
}

/**
 * Application with keyword arguments: `(head a b k1=v1 k2=v2)`.
 * Plain positional + keyword combination; keyword arg values are AST nodes.
 */
export function callKw(
	head: AST,
	args: ReadonlyArray<AST>,
	kwargs: Readonly<Record<string, AST>>
): Withable<CallAST> {
	return attach({
		kind: 'call',
		head,
		args,
		kwargs: new Map(Object.entries(kwargs)),
	})
}

/** Accessor sugar: `target.key`. Equivalent in meaning to `Call(target, [Lit(key)])`. */
export function access(target: AST, key: string | number): Withable<AccessAST> {
	return attach({ kind: 'access', target, key })
}

/** Vector literal: `[e0 e1 ...]`. */
export function vec(...elements: ReadonlyArray<AST>): Withable<VecAST> {
	return attach({ kind: 'vec', elements })
}

/**
 * Record literal: `{k1: v1 k2: v2 ...}`.
 * Field iteration order matches the order of keys in the input object.
 */
export function record(
	fields: Readonly<Record<string, AST>>
): Withable<RecordAST> {
	return attach({
		kind: 'record',
		fields: new Map(Object.entries(fields)),
	})
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
): Withable<PathAST> {
	return attach({ kind: 'path', segments })
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
): Withable<LetAST> {
	return attach({ kind: 'let', bindings, body })
}

/**
 * Function literal AST.
 *
 *   fn(
 *     [{ name: 'x', type: sym('number') }, { name: 'y', type: sym('number') }],
 *     sym('number'),
 *     call(sym('+'), sym('x'), sym('y'))
 *   )
 *   // → (=> (x: number y: number): number (+ x y))
 *
 * For function-type expressions (no body), pass `null` for `body`.
 * For generics, pass a list of type-variable names in `options.generics`.
 *
 * The chain form `g.fn({...}).returns(R)` documented in host-api.md is the
 * value builder (constructs a type value); the AST builder here is the lower-
 * level shape-construction utility.
 */
export function fn(
	params: ReadonlyArray<FnParam>,
	returnType: AST,
	body: AST | null = null,
	options?: { readonly generics?: ReadonlyArray<string> }
): Withable<FnAST> {
	return attach({
		kind: 'fn',
		generics: options?.generics ?? [],
		params,
		returnType,
		body,
	})
}

/** Quasiquote: `` `expr ``. */
export function quote(expr: AST): Withable<QuoteAST> {
	return attach({ kind: 'quote', expr })
}

/** Unquote: `~expr`. */
export function unquote(expr: AST): Withable<UnquoteAST> {
	return attach({ kind: 'unquote', expr })
}

/** Unquote-splice / spread: `...~expr` (in quasiquote) or `...xs` (in call/vec/record). */
export function splice(expr: AST): Withable<SpliceAST> {
	return attach({ kind: 'splice', expr })
}

/**
 * Metadata-attached expression: `^{...meta} expr`.
 *
 * Accepts the same `MetaContent` form as the fluent `.meta()` method —
 * an object whose values are AST nodes or plain JS primitives (auto-lifted
 * to literals). The fluent form `expr.meta({...})` is usually nicer; this
 * function exists for cases where the wrapping order is more natural.
 */
export function meta(content: MetaContent, expr: AST): Withable<MetaAST> {
	const fields: Record<string, AST> = {}
	for (const [k, v] of Object.entries(content)) {
		fields[k] = liftField(v)
	}
	return attach({
		kind: 'meta',
		metadata: record(fields),
		expr,
	})
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
	splice,
	meta,
	print,
}
