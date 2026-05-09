/**
 * Core AST and runtime-value types for Glisp.
 *
 * Spec references:
 * - docs/spec/syntax.md
 * - docs/spec/eval.md (AST node kinds)
 * - docs/spec/types.md
 *
 * AST nodes are class instances. The base `print()` returns a verbatim
 * source slice when a `SourceRange` is stamped (set by the parser), and
 * otherwise delegates to each subclass's `printStructural()` for
 * builder-style rendering.
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
 * Source-range stamp used to round-trip a parsed AST verbatim. The parser
 * sets this on every node it produces; builder-constructed nodes leave it
 * unset and fall back to structural rendering. The same `text` reference
 * is shared across all nodes from one `parse()` call.
 */
export interface SourceRange {
	readonly text: string
	readonly start: number
	readonly end: number
}

/**
 * Base class for all AST nodes. Subclasses set `kind` as a literal type so
 * the class hierarchy doubles as a discriminated union when narrowing.
 */
export abstract class ASTNode {
	abstract readonly kind: string
	readonly trivia?: Trivia

	/**
	 * Original source range. Mutable on construction (the parser stamps it
	 * after building the node). Builder-produced nodes leave it undefined
	 * and `print()` falls through to structural rendering.
	 */
	source?: SourceRange

	/**
	 * Attach metadata to this node. Returns a new `MetaAST` wrapping the
	 * current expression with a record of the given fields. Plain JS values
	 * in the content map are auto-lifted to `LitAST`.
	 */
	meta(content: MetaContent): MetaAST {
		const fields: Array<readonly [string, AST]> = []
		for (const [k, v] of Object.entries(content)) {
			fields.push([k, liftMetaField(v)])
		}
		return new MetaAST(new RecordAST(fields), this as unknown as AST)
	}

	/**
	 * Render this AST back to Glisp source. If a source range is stamped,
	 * returns the original text verbatim — preserving comments and the
	 * exact whitespace layout. Otherwise delegates to `printStructural`,
	 * which each subclass overrides for builder-style emission.
	 */
	print(): string {
		if (this.source !== undefined) {
			return this.source.text.slice(this.source.start, this.source.end)
		}
		return this.printStructural()
	}

	/** Builder-style rendering. Used when no source range is attached. */
	abstract printStructural(): string
}

function liftMetaField(v: MetaFieldValue): AST {
	if (v instanceof ASTNode) return v as AST
	return new LitAST(v)
}

export type AST =
	| LitAST
	| HostAST
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
	| SpreadAST
	| SpliceAST
	| MetaAST

export class LitAST extends ASTNode {
	readonly kind = 'lit' as const
	constructor(public readonly value: number | string | boolean | Unit) {
		super()
	}

	override printStructural(): string {
		const v = this.value
		if (v === UNIT) return '()'
		if (typeof v === 'number') return v.toString()
		if (typeof v === 'string') return printStringLiteral(v)
		return v ? 'true' : 'false'
	}
}

/**
 * AST node carrying a host-side value verbatim. Used by the host API to
 * surface values that the source language cannot otherwise express:
 * type values (`number`, `_`, …), typed host fns (`+`, `*`, …),
 * IO actions, and the like. Evaluating a `HostAST` yields its `value`
 * unchanged.
 *
 * `print()` cannot round-trip a host value back to source — instead it
 * shows a sensible label (the type's name for type values, `<host-fn>`
 * for typed host fns, `<host-value>` otherwise). For idempotent display
 * of bound names, callers should prefer `toAst` which looks the value
 * up in `env` and returns the bound symbol when available.
 */
export class HostAST extends ASTNode {
	readonly kind = 'host' as const
	constructor(public readonly value: unknown) {
		super()
	}

	override printStructural(): string {
		const v = this.value as {
			__glispType?: true
			typeName?: string
			__glispTypedFn?: true
			__glispClosure?: true
		} | null
		if (v !== null && typeof v === 'object') {
			if (v.__glispType === true && typeof v.typeName === 'string') {
				return v.typeName
			}
			if (v.__glispTypedFn === true) return '<host-fn>'
			if (v.__glispClosure === true) return '<closure>'
		}
		if (typeof v === 'function') return '<host-fn>'
		return '<host-value>'
	}
}

export class SymAST extends ASTNode {
	readonly kind = 'sym' as const
	constructor(public readonly name: string) {
		super()
	}

	override printStructural(): string {
		return this.name
	}
}

/**
 * Application AST. `args` is positional; `kwargs` are keyword arguments
 * (any positional parameter may be passed by name — see syntax.md).
 *
 * Spread arguments at the call site are represented as `SpreadAST` inside
 * `args` (e.g. `(f a ...xs b)` becomes args = [a, spread(xs), b]).
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

	override printStructural(): string {
		const positional = [this.head, ...this.args].map(a => a.print())
		const kw: string[] = []
		if (this.kwargs) {
			for (const [k, v] of this.kwargs) {
				kw.push(`${k}=${v.print()}`)
			}
		}
		return `(${[...positional, ...kw].join(' ')})`
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

	override printStructural(): string {
		return `${this.target.print()}.${this.key}`
	}
}

export class VecAST extends ASTNode {
	readonly kind = 'vec' as const
	constructor(public readonly elements: ReadonlyArray<AST>) {
		super()
	}

	override printStructural(): string {
		return `[${this.elements.map(e => e.print()).join(' ')}]`
	}
}

/**
 * One entry inside a record literal. Either a `[name, value]` pair (a normal
 * field), or a `SpreadAST` (a `...rec` element that merges another record's
 * fields at this position).
 */
export type RecordEntry = readonly [string, AST] | SpreadAST

/**
 * Record literal. Fields are stored as an ordered array of entries — pair
 * fields and spread elements coexist in source order. Duplicate keys (after
 * spreads have been expanded by eval) reduce with last-wins semantics and
 * emit a diagnostic (see syntax.md — Duplicate names).
 */
export class RecordAST extends ASTNode {
	readonly kind = 'record' as const
	constructor(
		public readonly fields: ReadonlyArray<RecordEntry>,
		public readonly optional?: ReadonlySet<string>
	) {
		super()
	}

	/**
	 * Look up a *statically declared* field by name, applying last-wins for
	 * duplicate pairs. Spread entries are ignored — they require runtime
	 * evaluation to resolve. Returns `undefined` if the key is absent at the
	 * literal level.
	 */
	get(key: string): AST | undefined {
		for (let i = this.fields.length - 1; i >= 0; i--) {
			const entry = this.fields[i]
			if (entry === undefined) continue
			if (entry instanceof SpreadAST) continue
			if (entry[0] === key) return entry[1]
		}
		return undefined
	}

	override printStructural(): string {
		const entries: string[] = []
		for (const entry of this.fields) {
			if (entry instanceof SpreadAST) {
				entries.push(entry.print())
			} else {
				const [k, v] = entry
				const optMark = this.optional?.has(k) ? '?' : ''
				entries.push(`${k}${optMark}: ${v.print()}`)
			}
		}
		return `{${entries.join(' ')}}`
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

	override printStructural(): string {
		const parts: string[] = []
		for (const [name, expr] of this.bindings) {
			parts.push(`${name} = ${expr.print()}`)
		}
		if (this.body !== null) {
			parts.push(this.body.print())
		}
		return `{${parts.join(' ')}}`
	}
}

export interface FnParam {
	readonly name: string
	readonly type: AST
	readonly optional?: boolean
	readonly variadic?: boolean
}

function printFnParam(p: FnParam): string {
	let name = p.name
	if (p.optional) name += '?'
	if (p.variadic) name = '...' + name
	return `${name}: ${p.type.print()}`
}

/**
 * Function literal. With `body: null` it expresses a pure function-type
 * (no implementation), used in type positions.
 *
 * Chain methods `.withGenerics(...)` and `.withBody(expr)` produce a new
 * FnAST; the original is unchanged. The method names use `with*` to avoid
 * clashing with the same-name fields.
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

	/** Return a new FnAST with the given generic-parameter names. */
	withGenerics(...names: string[]): FnAST {
		return new FnAST(names, this.params, this.returnType, this.body)
	}

	/** Return a new FnAST with the given body expression (turns a function
	 * type into a function literal). */
	withBody(expr: AST): FnAST {
		return new FnAST(this.generics, this.params, this.returnType, expr)
	}

	override printStructural(): string {
		const segments: string[] = ['=>']
		if (this.generics.length > 0) {
			segments.push(`(${this.generics.join(' ')})`)
		}
		const params = this.params.map(printFnParam).join(' ')
		segments.push(`(${params}): ${this.returnType.print()}`)
		if (this.body !== null) {
			segments.push(this.body.print())
		}
		return `(${segments.join(' ')})`
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

	override printStructural(): string {
		if (this.segments.length === 0) return './'
		const head = this.segments[0] === '..' ? '../' : './'
		const rest =
			this.segments[0] === '..' ? this.segments.slice(1) : this.segments
		return head + rest.map(String).join('/')
	}
}

export class QuoteAST extends ASTNode {
	readonly kind = 'quote' as const
	constructor(public readonly expr: AST) {
		super()
	}

	override printStructural(): string {
		return '`' + this.expr.print()
	}
}

export class UnquoteAST extends ASTNode {
	readonly kind = 'unquote' as const
	constructor(public readonly expr: AST) {
		super()
	}

	override printStructural(): string {
		return '~' + this.expr.print()
	}
}

/**
 * Spread: `...expr`. Inlines the operand's elements into the surrounding
 * call / vector / record / quasiquote. Stays as `...expr` regardless of
 * whether it appears inside a quasiquote — for the quasiquote-specific
 * "evaluate and splice" form, use `SpliceAST` (`...~expr`).
 */
export class SpreadAST extends ASTNode {
	readonly kind = 'spread' as const
	constructor(public readonly expr: AST) {
		super()
	}

	override printStructural(): string {
		return '...' + this.expr.print()
	}
}

/**
 * Unquote-splice: `...~expr`. Only meaningful inside a quasiquote — evaluates
 * `expr` (popping the quote level) and splices the resulting elements into
 * the surrounding form.
 */
export class SpliceAST extends ASTNode {
	readonly kind = 'splice' as const
	constructor(public readonly expr: AST) {
		super()
	}

	override printStructural(): string {
		return '...~' + this.expr.print()
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

	override printStructural(): string {
		return `^${this.metadata.print()} ${this.expr.print()}`
	}
}

// -----------------------------------------------------------------------------
// String-literal printer (Glisp escape rules per syntax.md)
// -----------------------------------------------------------------------------

function printStringLiteral(s: string): string {
	let out = '"'
	for (const ch of s) {
		switch (ch) {
			case '\n':
				out += '\\n'
				break
			case '\r':
				out += '\\r'
				break
			case '\t':
				out += '\\t'
				break
			case '"':
				out += '\\"'
				break
			case '\\':
				out += '\\\\'
				break
			default: {
				const code = ch.codePointAt(0)
				if (code !== undefined && code < 0x20) {
					out += '\\u' + code.toString(16).padStart(4, '0')
				} else {
					out += ch
				}
				break
			}
		}
	}
	return out + '"'
}

// -----------------------------------------------------------------------------
// Convenience type guards (still useful for narrowing in switch/case)
// -----------------------------------------------------------------------------

export const isLit = (a: AST): a is LitAST => a.kind === 'lit'
export const isHost = (a: AST): a is HostAST => a.kind === 'host'
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
export const isSpread = (a: AST): a is SpreadAST => a.kind === 'spread'
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
	/**
	 * Optional declared type for this binding — typically a function
	 * parameter's declared type, eagerly evaluated when the closure was
	 * applied. When set, the evaluator casts the resolved value through
	 * this type at force time, driving the spec's "default fallback at
	 * typed slots" behavior for closures.
	 *
	 * The shape is `TypeValue` (defined in eval.ts) but it lives here as
	 * `unknown` to avoid a circular import — the evaluator's `isTypeValue`
	 * brand check narrows it back at use sites.
	 */
	readonly type?: unknown
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
