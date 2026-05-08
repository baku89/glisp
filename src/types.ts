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
	| AccessAST
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

/**
 * Accessor sugar: `target.key`. Has the same evaluation semantics as
 * `Call(target, [Lit(key)])` (a one-argument call with a literal key), but
 * is kept as a distinct AST node so `unparse` can reproduce dot notation.
 *
 * - `target`: any expression yielding a record or vector at runtime.
 * - `key`: a literal name (string for record fields) or integer index
 *   (number for vector elements). Dynamic keys must use call form instead.
 */
export interface AccessAST extends ASTBase {
	readonly kind: 'access'
	readonly target: AST
	readonly key: string | number
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
 * Path atom. A path is a sequence of segments separated by `/`. Each segment
 * is `'..'` (go up to parent), a name (descend into a named child), or an
 * integer index (descend into a positional child). The `'.'` segment (stay
 * here) is allowed in syntax but not stored as an AST segment — it is a
 * no-op needed only to disambiguate paths starting with a name.
 *
 *   ./foo            → segments: ['foo']
 *   ../foo           → segments: ['..', 'foo']
 *   ../../foo        → segments: ['..', '..', 'foo']        (parent's parent)
 *   ../foo/bar       → segments: ['..', 'foo', 'bar']
 *   ../vec/0         → segments: ['..', 'vec', 0]
 *   ./               → segments: []                          (the current node itself)
 *   ../              → segments: ['..']                      (the parent itself)
 *
 * Distinguishing path from spread (`...`): a path always begins with `./` or
 * `../` and contains a `/`. `...xs` (no slash) is a spread.
 */
export interface PathAST extends ASTBase {
	readonly kind: 'path'
	readonly segments: ReadonlyArray<'..' | string | number>
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

/**
 * Metadata-attached expression `^{...} expr`.
 *
 * `metadata` (rather than `meta`) is the field name, to avoid clashing with
 * the `.meta(...)` builder method on AST handles.
 */
export interface MetaAST extends ASTBase {
	readonly kind: 'meta'
	readonly metadata: RecordAST
	readonly expr: AST
}

// -----------------------------------------------------------------------------
// Convenience type guards
// -----------------------------------------------------------------------------

export const isLit = (a: AST): a is LitAST => a.kind === 'lit'
export const isSym = (a: AST): a is SymAST => a.kind === 'sym'
export const isCall = (a: AST): a is CallAST => a.kind === 'call'
export const isAccess = (a: AST): a is AccessAST => a.kind === 'access'
export const isVec = (a: AST): a is VecAST => a.kind === 'vec'
export const isRecord = (a: AST): a is RecordAST => a.kind === 'record'
export const isLet = (a: AST): a is LetAST => a.kind === 'let'
export const isFn = (a: AST): a is FnAST => a.kind === 'fn'
export const isPath = (a: AST): a is PathAST => a.kind === 'path'
export const isQuote = (a: AST): a is QuoteAST => a.kind === 'quote'
export const isUnquote = (a: AST): a is UnquoteAST => a.kind === 'unquote'
export const isSplice = (a: AST): a is SpliceAST => a.kind === 'splice'
export const isMeta = (a: AST): a is MetaAST => a.kind === 'meta'

// -----------------------------------------------------------------------------
// Environment (per docs/spec/eval.md — Environment)
// -----------------------------------------------------------------------------

/**
 * An environment is a chain of frames, each describing one level of enclosing
 * scope (and providing the ancestor structure that path navigation walks).
 * `null` is the root sentinel above top-level.
 */
export type Env = Frame | null

/**
 * A single frame in the env chain.
 *
 * - `ast`: the AST node this frame represents (let-block, function literal,
 *   record, vector, application, quasiquoted form, ...).
 * - `parent`: one frame up; `null` only at the root.
 * - `bindings`: present only on scope-introducing frames (top-level, let-block,
 *   function body). Maps each name to its right-hand-side AST plus the env
 *   that AST is to be evaluated in. See eval.md's frame table for details.
 */
export interface Frame {
	readonly ast: AST
	readonly parent: Env
	readonly bindings?: ReadonlyMap<string, BindingTarget>
}

/**
 * A binding's target: the unevaluated AST and the env in which it is to be
 * evaluated. Lazy semantics — actual evaluation only happens when the name is
 * forced.
 */
export interface BindingTarget {
	readonly ast: AST
	readonly env: Env
}

// -----------------------------------------------------------------------------
// Diagnostics (per docs/spec/eval.md — Diagnostics)
// -----------------------------------------------------------------------------

export type DiagnosticLevel = 'error' | 'warning' | 'info'

/**
 * A single diagnostic emitted during evaluation. `source` identifies the
 * evaluation node where the diagnostic originated.
 *
 * Evaluation never throws — diagnostics flow on a parallel channel; values
 * fall back via the `default` mechanism (see types.md).
 */
export interface Diagnostic {
	readonly level: DiagnosticLevel
	readonly message: string
	readonly source: EvaluationNode
}

/**
 * Identifies a specific evaluation: an AST node together with the env in
 * which it is being evaluated. The same AST under different envs is a
 * different evaluation node.
 */
export interface EvaluationNode {
	readonly ast: AST
	readonly env: Env
}

/** Bag of diagnostics propagated alongside a value. */
export type Diagnostics = ReadonlySet<Diagnostic>
