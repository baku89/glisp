/**
 * AST builders for the host API.
 *
 * Each function returns a fresh AST node. Construction has no env-resolution
 * step; what comes out is a raw syntactic tree, equivalent to what a parser
 * would produce (minus trivia).
 *
 * Spec: docs/spec/host-api.md — Builders
 */

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
// AST builders
// -----------------------------------------------------------------------------

/** Literal AST. Distinguishes between number / string / boolean / unit by JS type. */
export function lit(value: number | string | boolean | Unit): LitAST {
	return { kind: 'lit', value }
}

/** Symbol (bare identifier) AST. Use this for identifiers; `lit` is for values. */
export function sym(name: string): SymAST {
	return { kind: 'sym', name }
}

/** Application: `(head a b ...)`. */
export function call(head: AST, ...args: ReadonlyArray<AST>): CallAST {
	return { kind: 'call', head, args }
}

/**
 * Application with keyword arguments: `(head a b k1=v1 k2=v2)`.
 * Plain positional + keyword combination; keyword arg values are AST nodes.
 */
export function callKw(
	head: AST,
	args: ReadonlyArray<AST>,
	kwargs: Readonly<Record<string, AST>>
): CallAST {
	return {
		kind: 'call',
		head,
		args,
		kwargs: new Map(Object.entries(kwargs)),
	}
}

/** Accessor sugar: `target.key`. Equivalent in meaning to `Call(target, [Lit(key)])`. */
export function access(target: AST, key: string | number): AccessAST {
	return { kind: 'access', target, key }
}

/** Vector literal: `[e0 e1 ...]`. */
export function vec(...elements: ReadonlyArray<AST>): VecAST {
	return { kind: 'vec', elements }
}

/**
 * Record literal: `{k1: v1 k2: v2 ...}`.
 * Field iteration order matches the order of keys in the input object.
 */
export function record(fields: Readonly<Record<string, AST>>): RecordAST {
	return { kind: 'record', fields: new Map(Object.entries(fields)) }
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
	return { kind: 'path', segments }
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
	return { kind: 'let', bindings, body }
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
): FnAST {
	return {
		kind: 'fn',
		generics: options?.generics ?? [],
		params,
		returnType,
		body,
	}
}

/** Quasiquote: `` `expr ``. */
export function quote(expr: AST): QuoteAST {
	return { kind: 'quote', expr }
}

/** Unquote: `~expr`. */
export function unquote(expr: AST): UnquoteAST {
	return { kind: 'unquote', expr }
}

/** Unquote-splice / spread: `...~expr` (in quasiquote) or `...xs` (in call/vec/record). */
export function splice(expr: AST): SpliceAST {
	return { kind: 'splice', expr }
}

/**
 * Metadata-attached expression: `^{...meta} expr`.
 * `metaRecord` is itself a record AST whose fields hold the metadata pairs.
 */
export function meta(metaRecord: RecordAST, expr: AST): MetaAST {
	return { kind: 'meta', meta: metaRecord, expr }
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
}
