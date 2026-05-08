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
	path,
	quote,
	unquote,
	splice,
	meta,
}
