/**
 * Core AST and runtime-value types for Glisp.
 *
 * Spec references:
 * - docs/spec/syntax.md
 * - docs/spec/eval.md (AST node kinds)
 * - docs/spec/types.md
 */

// -----------------------------------------------------------------------------
// Unit
// -----------------------------------------------------------------------------

/**
 * The Glisp `unit` value. Distinguished from `null`/`undefined` via a registered
 * Symbol so it survives module boundaries and can never collide with JS-native
 * absence values.
 */
export const UNIT: unique symbol = Symbol.for('glisp.unit') as never
export type Unit = typeof UNIT

// -----------------------------------------------------------------------------
// AST
// -----------------------------------------------------------------------------

export type AST =
	| LitAST
	| SymAST
	| CallAST
	| VecAST
	| RecordAST
	| LetAST
	| FnAST
	| PathAST
	| QuoteAST
	| UnquoteAST
	| SpliceAST
	| MetaAST

/**
 * Inter-position trivia (whitespace, comments) attached to each AST node.
 * Slot count and stickiness rules per node type are documented in eval.md.
 *
 * Builder-constructed ASTs have no trivia; parse-constructed ASTs preserve it.
 */
export type Trivia = ReadonlyArray<string>

export interface ASTBase {
	readonly trivia?: Trivia
}

export interface LitAST extends ASTBase {
	readonly kind: 'lit'
	readonly value: number | string | boolean | Unit
}

export interface SymAST extends ASTBase {
	readonly kind: 'sym'
	readonly name: string
}

/**
 * Application AST. `args` is positional; `kwargs` are keyword arguments
 * (any positional parameter may be passed by name — see syntax.md).
 *
 * Spread arguments at the call site are represented as `SpliceAST` inside
 * `args` (e.g. `(f a ...xs b)` becomes args = [a, splice(xs), b]).
 */
export interface CallAST extends ASTBase {
	readonly kind: 'call'
	readonly head: AST
	readonly args: ReadonlyArray<AST>
	readonly kwargs?: ReadonlyMap<string, AST>
}

/** Vector literal. */
export interface VecAST extends ASTBase {
	readonly kind: 'vec'
	readonly elements: ReadonlyArray<AST>
}

/**
 * Record literal. Keys are ordered (insertion order). The same shape doubles
 * as a record type when its field values are type values
 * (see types.md — Type interpretation at type slots).
 *
 * `optional` records the field names that carried a `?` suffix. Empty / absent
 * when none are optional. (Optional only meaningful in record-type context.)
 */
export interface RecordAST extends ASTBase {
	readonly kind: 'record'
	readonly fields: ReadonlyMap<string, AST>
	readonly optional?: ReadonlySet<string>
}

/** Let-block: bindings followed by an optional trailing expression. */
export interface LetAST extends ASTBase {
	readonly kind: 'let'
	readonly bindings: ReadonlyArray<readonly [string, AST]>
	readonly body: AST | null
}

export interface FnParam {
	readonly name: string
	readonly type: AST
	readonly optional?: boolean
	readonly variadic?: boolean
}

/**
 * Function literal. With `body: null` it expresses a pure function-type
 * (no implementation), used in type positions.
 */
export interface FnAST extends ASTBase {
	readonly kind: 'fn'
	readonly generics: ReadonlyArray<string>
	readonly params: ReadonlyArray<FnParam>
	readonly returnType: AST
	readonly body: AST | null
}

/**
 * Path atom. `dots` is the number of leading `.` characters (>= 1); each dot
 * walks one AST level up. `segments` is the chain after the dots.
 *
 *   ./foo            → dots: 1, segments: ['foo']
 *   ../foo           → dots: 2, segments: ['foo']
 *   ../foo/bar       → dots: 2, segments: ['foo', 'bar']
 *   ../vec/0         → dots: 2, segments: ['vec', 0]
 *   ./               → dots: 1, segments: []                 (the parent itself)
 *   .../foo          → dots: 3, segments: ['foo']            (great-grandparent's foo)
 *   ..../a           → dots: 4, segments: ['a']
 *
 * Distinguishing path from spread (`...`): a path always has `/` (or end-of-
 * token) after the leading dots. `...xs` is spread; `.../xs` is a path.
 */
export interface PathAST extends ASTBase {
	readonly kind: 'path'
	readonly dots: number
	readonly segments: ReadonlyArray<string | number>
}

export interface QuoteAST extends ASTBase {
	readonly kind: 'quote'
	readonly expr: AST
}

export interface UnquoteAST extends ASTBase {
	readonly kind: 'unquote'
	readonly expr: AST
}

/** Unquote-splice (`...~expr`). Doubles as the host-API spread when used at
 * call/vector/record sites — see syntax.md — Spread.
 */
export interface SpliceAST extends ASTBase {
	readonly kind: 'splice'
	readonly expr: AST
}

/** Metadata-attached expression `^{...} expr`. */
export interface MetaAST extends ASTBase {
	readonly kind: 'meta'
	readonly meta: RecordAST
	readonly expr: AST
}

// -----------------------------------------------------------------------------
// Convenience type guards
// -----------------------------------------------------------------------------

export const isLit = (a: AST): a is LitAST => a.kind === 'lit'
export const isSym = (a: AST): a is SymAST => a.kind === 'sym'
export const isCall = (a: AST): a is CallAST => a.kind === 'call'
export const isVec = (a: AST): a is VecAST => a.kind === 'vec'
export const isRecord = (a: AST): a is RecordAST => a.kind === 'record'
export const isLet = (a: AST): a is LetAST => a.kind === 'let'
export const isFn = (a: AST): a is FnAST => a.kind === 'fn'
export const isPath = (a: AST): a is PathAST => a.kind === 'path'
export const isQuote = (a: AST): a is QuoteAST => a.kind === 'quote'
export const isUnquote = (a: AST): a is UnquoteAST => a.kind === 'unquote'
export const isSplice = (a: AST): a is SpliceAST => a.kind === 'splice'
export const isMeta = (a: AST): a is MetaAST => a.kind === 'meta'
