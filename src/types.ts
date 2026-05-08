/**
 * Core AST and runtime-value types for Glisp.
 *
 * Spec references:
 * - docs/spec/syntax.md
 * - docs/spec/eval.md (AST node kinds)
 * - docs/spec/types.md
 *
 * AST nodes are class instances. The class system gives us:
 * - prototype-based methods (`.meta()`) without enumerable-property hacks
 * - `instanceof` checks alongside `kind`-based discrimination
 * - clean `toEqual` semantics (vitest only compares own enumerable properties)
 */

import { print as printImpl } from './print.js'

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

/**
 * Inter-position trivia (whitespace, comments) attached to each AST node.
 * Slot count and stickiness rules per node type are documented in eval.md.
 *
 * Builder-constructed ASTs have no trivia; parse-constructed ASTs preserve it.
 */
export type Trivia = ReadonlyArray<string>

/**
 * Values accepted by the `.meta(...)` method: AST nodes, or JS primitives that
 * are auto-lifted to `LitAST`.
 */
export type MetaFieldValue = AST | number | string | boolean | Unit
export type MetaContent = Readonly<Record<string, MetaFieldValue>>

/**
 * Base class for all AST nodes. Subclasses set `kind` as a literal type so
 * the class hierarchy doubles as a discriminated union when narrowing.
 */
export abstract class ASTNode {
	abstract readonly kind: string
	readonly trivia?: Trivia

	/**
	 * Attach metadata to this node. Returns a new `MetaAST` wrapping the
	 * current expression with a record of the given fields. Plain JS values
	 * in the content map are auto-lifted to `LitAST`.
	 *
	 *   lit(100).meta({ label: 'Width', default: 100 })
	 *   // → MetaAST { metadata: {label: "Width" default: 100}, expr: 100 }
	 */
	meta(content: MetaContent): MetaAST {
		const fields: Array<readonly [string, AST]> = []
		for (const [k, v] of Object.entries(content)) {
			fields.push([k, liftMetaField(v)])
		}
		return new MetaAST(new RecordAST(fields), this as unknown as AST)
	}

	/**
	 * Render this AST back to its Glisp source form (no env needed —
	 * `print` is purely structural). For `value → source`, compose
	 * `g.toAst(value, env)` with `.print()`.
	 */
	print(): string {
		return printImpl(this as unknown as AST)
	}
}

function liftMetaField(v: MetaFieldValue): AST {
	if (v instanceof ASTNode) return v as AST
	return new LitAST(v)
}

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

export class LitAST extends ASTNode {
	readonly kind = 'lit' as const
	constructor(public readonly value: number | string | boolean | Unit) {
		super()
	}
}

export class SymAST extends ASTNode {
	readonly kind = 'sym' as const
	constructor(public readonly name: string) {
		super()
	}
}

/**
 * Application AST. `args` is positional; `kwargs` are keyword arguments
 * (any positional parameter may be passed by name — see syntax.md).
 *
 * Spread arguments at the call site are represented as `SpliceAST` inside
 * `args` (e.g. `(f a ...xs b)` becomes args = [a, splice(xs), b]).
 */
export class CallAST extends ASTNode {
	readonly kind = 'call' as const
	constructor(
		public readonly head: AST,
		public readonly args: ReadonlyArray<AST>,
		public readonly kwargs?: ReadonlyMap<string, AST>
	) {
		super()
	}
}

/**
 * Accessor sugar: `target.key`. Has the same evaluation semantics as
 * `Call(target, [Lit(key)])`, but kept as a distinct kind for unparse.
 */
export class AccessAST extends ASTNode {
	readonly kind = 'access' as const
	constructor(
		public readonly target: AST,
		public readonly key: string | number
	) {
		super()
	}
}

export class VecAST extends ASTNode {
	readonly kind = 'vec' as const
	constructor(public readonly elements: ReadonlyArray<AST>) {
		super()
	}
}

/**
 * Record literal. Fields are stored as an array of `[name, value]` pairs in
 * source order, so duplicate keys are preserved at the AST level. Evaluation
 * reduces them with last-wins semantics and emits a diagnostic
 * (see syntax.md — Duplicate names).
 *
 * The same shape doubles as a record type when its field values are type
 * values (see types.md — Type interpretation at type slots).
 */
export class RecordAST extends ASTNode {
	readonly kind = 'record' as const
	constructor(
		public readonly fields: ReadonlyArray<readonly [string, AST]>,
		public readonly optional?: ReadonlySet<string>
	) {
		super()
	}

	/**
	 * Look up a field by name, applying last-wins semantics for duplicates.
	 * Returns `undefined` if the key is absent.
	 */
	get(key: string): AST | undefined {
		for (let i = this.fields.length - 1; i >= 0; i--) {
			const entry = this.fields[i]
			if (entry !== undefined && entry[0] === key) return entry[1]
		}
		return undefined
	}
}

export class LetAST extends ASTNode {
	readonly kind = 'let' as const
	constructor(
		public readonly bindings: ReadonlyArray<readonly [string, AST]>,
		public readonly body: AST | null
	) {
		super()
	}
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
export class FnAST extends ASTNode {
	readonly kind = 'fn' as const
	constructor(
		public readonly generics: ReadonlyArray<string>,
		public readonly params: ReadonlyArray<FnParam>,
		public readonly returnType: AST,
		public readonly body: AST | null
	) {
		super()
	}
}

/**
 * Path atom. A path is a sequence of segments separated by `/`. Each segment
 * is `'..'` (go up to parent), a name (descend into a named child), or an
 * integer index (descend into a positional child).
 *
 *   ./foo            → segments: ['foo']
 *   ../foo           → segments: ['..', 'foo']
 *   ../../foo        → segments: ['..', '..', 'foo']
 *   ../foo/bar       → segments: ['..', 'foo', 'bar']
 *   ./               → segments: []
 *
 * Distinguishing path from spread (`...`): a path always begins with `./` or
 * `../` and contains a `/`. `...xs` (no slash) is a spread.
 */
export class PathAST extends ASTNode {
	readonly kind = 'path' as const
	constructor(
		public readonly segments: ReadonlyArray<'..' | string | number>
	) {
		super()
	}
}

export class QuoteAST extends ASTNode {
	readonly kind = 'quote' as const
	constructor(public readonly expr: AST) {
		super()
	}
}

export class UnquoteAST extends ASTNode {
	readonly kind = 'unquote' as const
	constructor(public readonly expr: AST) {
		super()
	}
}

export class SpliceAST extends ASTNode {
	readonly kind = 'splice' as const
	constructor(public readonly expr: AST) {
		super()
	}
}

/**
 * Metadata-attached expression `^{...} expr`.
 * Field is `metadata` (not `meta`) to avoid clashing with the `.meta()` method.
 */
export class MetaAST extends ASTNode {
	readonly kind = 'meta' as const
	constructor(
		public readonly metadata: RecordAST,
		public readonly expr: AST
	) {
		super()
	}
}

// -----------------------------------------------------------------------------
// Convenience type guards (still useful for narrowing in switch/case)
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
 */
export interface Frame {
	readonly ast: AST
	readonly parent: Env
	readonly bindings?: ReadonlyMap<string, BindingTarget>
}

export interface BindingTarget {
	readonly ast: AST
	readonly env: Env
}

// -----------------------------------------------------------------------------
// Diagnostics (per docs/spec/eval.md — Diagnostics)
// -----------------------------------------------------------------------------

export type DiagnosticLevel = 'error' | 'warning' | 'info'

export interface Diagnostic {
	readonly level: DiagnosticLevel
	readonly message: string
	readonly source: EvaluationNode
}

export interface EvaluationNode {
	readonly ast: AST
	readonly env: Env
}

export type Diagnostics = ReadonlySet<Diagnostic>
