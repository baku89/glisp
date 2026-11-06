/**
 * Parser: token sequence → AST.
 *
 * Recursive-descent. Each constructed AST node is stamped with a
 * `SourceRange` covering its full syntactic extent — enough for verbatim
 * round-trip via `ASTNode.print()`, including comments and whitespace
 * inside the node. Trivia outside the outermost node (leading / trailing
 * whitespace at the program level) is the caller's concern.
 *
 * Spec: docs/spec/syntax.md
 */

import {
	access,
	call,
	callKw,
	fn,
	letBlock,
	lit,
	hide,
	isHidden,
	isPinned,
	meta,
	pin,
	path,
	spread,
	sym,
	unquote,
	vec,
} from './build.js'
import { lex, type Token, type TokenKind } from './lex.js'
import {
	type AST,
	type FnParam,
	MetaAST,
	RecordAST,
	type RecordEntry,
	UNIT,
} from './types.js'

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Parse Glisp source into an `AST`. Each node is stamped with a
 * `SourceRange` so `print(ast)` round-trips back to the original
 * verbatim text (modulo intentional source-canonicalization). Throws
 * `LexError` (during tokenization) or `ParseError` (during structure
 * parsing) on malformed input.
 */
export function parse(src: string): AST {
	const tokens = lex(src)
	checkSeparators(tokens, src)
	const parser = new Parser(tokens, src)
	const ast = parser.expression()
	parser.expectEof()
	return ast
}

const ELEMENT_END: ReadonlySet<TokenKind> = new Set<TokenKind>([
	')', ']', '}', '()', '_', '!',
	'number', 'string', 'boolean', 'identifier', 'pathSegments',
])

const ELEMENT_START: ReadonlySet<TokenKind> = new Set<TokenKind>([
	'(', '[', '{', '()', '_', '!',
	'number', 'string', 'boolean', 'identifier', 'pathSegments',
	'~', '@', '#_', '...', '...~', '^', '=>',
])

/**
 * Adjacent elements must be separated: `[][]`, `(f)(g)`, `f(x)` and
 * `"a""b"` are syntax errors. Runs here rather than in `lex` because
 * the session's `name/seg = expr` sugar lexes `/` next to identifiers.
 */
function checkSeparators(tokens: ReadonlyArray<Token>, src: string): void {
	for (let i = 1; i < tokens.length; i++) {
		const prev = tokens[i - 1]!
		const next = tokens[i]!
		if (
			prev.end === next.start &&
			ELEMENT_END.has(prev.kind) &&
			ELEMENT_START.has(next.kind)
		) {
			throw new ParseError(
				`missing whitespace between \`${prev.text}\` and \`${next.text}\``,
				src,
				next.start
			)
		}
	}
}

/**
 * Thrown by `parse` on a structural error (unexpected token, bad
 * arity, malformed special form, etc.). Carries the full source text
 * and the byte offset of the offending token so a host can render a
 * positional error message.
 */
export class ParseError extends Error {
	constructor(
		message: string,
		public readonly source: string,
		public readonly position: number
	) {
		super(message)
		this.name = 'ParseError'
	}
}

// -----------------------------------------------------------------------------
// Parser
// -----------------------------------------------------------------------------

class Parser {
	private pos = 0

	private inSignature = false

	constructor(
		private readonly tokens: Token[],
		private readonly source: string
	) {}

	// --- token cursor helpers -------------------------------------------------

	private peek(offset = 0): Token {
		return this.tokens[this.pos + offset]!
	}

	private advance(): Token {
		const t = this.tokens[this.pos]!
		this.pos++
		return t
	}

	private expect(kind: TokenKind): Token {
		const t = this.peek()
		if (t.kind !== kind) {
			throw this.error(t, `expected ${kind}, got ${t.kind}`)
		}
		return this.advance()
	}

	private error(t: Token, msg: string): ParseError {
		return new ParseError(msg, this.source, t.start)
	}

	expectEof(): void {
		this.expect('eof')
	}

	/**
	 * Stamp an AST node with the source range from `start` through the end of
	 * the last consumed token. Returns the same node for chaining.
	 *
	 * The `source` property is defined as non-enumerable so structural deep
	 * equality (e.g. vitest's `toEqual`) treats parsed and builder-constructed
	 * ASTs as equal — the source range is round-trip metadata, not part of
	 * AST identity.
	 */
	private stamp<T extends AST>(start: number, ast: T): T {
		const end = this.tokens[this.pos - 1]!.end
		Object.defineProperty(ast, 'source', {
			value: { text: this.source, start, end },
			enumerable: false,
			writable: true,
			configurable: true,
		})
		return ast
	}

	// --- expressions ----------------------------------------------------------

	/** Parse one expression, then collect any trailing `.key` accessors. */
	expression(): AST {
		const start = this.peek().start
		let head = this.atom()
		while (this.peek().kind === '.') {
			this.advance()
			const next = this.peek()
			if (next.kind === 'identifier') {
				this.advance()
				head = this.stamp(start, access(head, next.value as string))
			} else if (next.kind === 'number') {
				this.advance()
				head = this.stamp(start, access(head, next.value as number))
			} else {
				throw this.error(next, 'expected identifier or integer after `.`')
			}
		}
		return head
	}

	private atom(): AST {
		const t = this.peek()
		const start = t.start

		switch (t.kind) {
			case 'number':
				this.advance()
				return this.stamp(start, lit(t.value as number))
			case 'string':
				this.advance()
				return this.stamp(start, lit(t.value as string))
			case 'boolean':
				this.advance()
				return this.stamp(start, lit(t.value as boolean))
			case '()':
				this.advance()
				return this.stamp(start, lit(UNIT))
			case '_':
				this.advance()
				return this.stamp(start, sym('_'))
			case '!':
				this.advance()
				return this.stamp(start, sym('!'))
			case 'identifier':
				this.advance()
				return this.stamp(start, sym(t.value as string))
			case '?':
				// Bare `?` is the match special form head.
				this.advance()
				return this.stamp(start, sym('?'))
			case 'pathSegments':
				if (this.inSignature) {
					throw this.error(t, 'a path cannot appear in a function signature')
				}
				this.advance()
				return this.stamp(
					start,
					path(...(t.value as ReadonlyArray<'..' | string | number>))
				)
			case '(':
				return this.stamp(start, this.parenForm())
			case '[':
				return this.stamp(start, this.vectorForm())
			case '{':
				return this.stamp(start, this.braceForm())
			case '~':
				this.advance()
				return this.stamp(start, unquote(this.atom()))
			case '@': {
				const at = this.advance()
				const expr = this.atom()
				if (isPinned(expr)) throw this.error(at, 'already locked')
				return this.stamp(start, pin(expr))
			}
			case '#_': {
				const at = this.advance()
				const expr = this.atom()
				if (isHidden(expr)) throw this.error(at, 'already hidden')
				return this.stamp(start, hide(expr))
			}
			case '...':
				this.advance()
				return this.stamp(start, spread(this.atom()))
			case '...~':
				this.advance()
				return this.stamp(start, spread(unquote(this.atom())))
			case '^':
				return this.stamp(start, this.metaForm())
			default:
				throw this.error(t, `unexpected ${t.kind}`)
		}
	}

	private colonHead(): AST {
		const start = this.peek().start
		this.advance()
		return this.stamp(start, sym(':'))
	}

	// --- (...) — call or function literal ------------------------------------

	private parenForm(): AST {
		this.advance() // '('
		if (this.peek().kind === '=>') {
			this.advance()
			return this.fnTail()
		}

		if (this.peek().kind === ')') {
			throw this.error(this.peek(), 'empty application — use `()` for unit')
		}

		// `(: v T)` — a `:` in head position is the coercion special form.
		const head = this.peek().kind === ':' ? this.colonHead() : this.expression()
		const args: AST[] = []
		const kwargs: Record<string, AST> = {}
		let sawKwarg = false

		while (this.peek().kind !== ')') {
			if (this.peek().kind === 'eof') {
				throw this.error(this.peek(), 'unterminated `(`')
			}
			// kwarg: identifier `:` expression, as a record's field is written
			if (this.peek().kind === 'identifier' && this.peek(1).kind === '=') {
				throw this.error(
					this.peek(1),
					`a keyword argument is written \`${this.peek().text}: ...\``
				)
			}
			if (
				this.peek().kind === 'identifier' &&
				this.peek(1).kind === ':'
			) {
				const nameTok = this.advance()
				this.advance() // ':'
				kwargs[nameTok.value as string] = this.expression()
				sawKwarg = true
				continue
			}
			if (sawKwarg) {
				throw this.error(
					this.peek(),
					'positional argument after keyword argument'
				)
			}
			args.push(this.expression())
		}
		this.advance() // ')'

		return Object.keys(kwargs).length > 0
			? callKw(head, args, kwargs)
			: call(head, ...args)
	}

	// `(=> ...)` body — already past `(` and `=>`.
	private fnTail(): AST {
		// Optional generic list `(T U ...)` — bare identifiers, followed by
		// another `(` (the value-parameter list).
		let generics: string[] = []
		if (this.peek().kind === '(') {
			const save = this.pos
			const list = this.tryParseBareNameList()
			if (list !== null && this.peek().kind === '(') {
				generics = list
			} else {
				this.pos = save
			}
		}

		const start = this.peek()
		this.expect('(')
		const params = this.parseParams()
		this.expect(':')
		const returnType = this.signatureType()

		let body: AST | null = null
		if (this.peek().kind !== ')') {
			body = this.expression()
		}
		this.expect(')')
		if (body !== null && params.some(p => p.name === '')) {
			throw this.error(
				start,
				'a function with a body must name every parameter'
			)
		}
		let result = fn(params, returnType)
		if (generics.length > 0) result = result.withGenerics(...generics)
		if (body !== null) result = result.withBody(body)
		return result
	}

	private tryParseBareNameList(): string[] | null {
		const save = this.pos
		this.advance() // '('
		const names: string[] = []
		while (
			this.peek().kind === 'identifier' &&
			this.peek(1).kind !== ':'
		) {
			names.push(this.advance().value as string)
		}
		if (this.peek().kind !== ')') {
			this.pos = save
			return null
		}
		this.advance() // ')'
		return names
	}

	private parseParams(): FnParam[] {
		const params: FnParam[] = []
		while (this.peek().kind !== ')') {
			let variadic = false
			if (this.peek().kind === '...') {
				this.advance()
				variadic = true
			}
			if (!this.atNamedParam()) {
				// Function types may omit names: `(=> (number number): number)`.
				params.push({ name: '', type: this.signatureType(), variadic })
				continue
			}
			const name = this.advance().value as string
			let optional = false
			if (this.peek().kind === '?') {
				this.advance()
				optional = true
			}
			this.expect(':')
			const type = this.signatureType()
			params.push({ name, type, optional, variadic })
		}
		this.advance() // ')'
		return params
	}

	private signatureType(): AST {
		const outer = this.inSignature
		this.inSignature = true
		const type = this.expression()
		this.inSignature = outer
		return type
	}

	private atNamedParam(): boolean {
		if (this.peek().kind !== 'identifier') return false
		const next = this.peek(1).kind
		return next === ':' || next === '?'
	}

	// --- [...] — vector ------------------------------------------------------

	private vectorForm(): AST {
		this.advance() // '['
		const elements: AST[] = []
		const bindings: [string, AST][] = []
		while (this.peek().kind !== ']') {
			if (this.peek().kind === 'eof') {
				throw this.error(this.peek(), 'unterminated `[`')
			}
			// `name = expr` says what the name is and that it goes here, as `{name = expr [name]}`.
			if (this.peek().kind === 'identifier' && this.peek(1).kind === '=') {
				const at = this.peek().start
				const name = this.advance().value as string
				elements.push(this.stamp(at, sym(name)))
				this.advance() // '='
				bindings.push([name, this.expression()])
				continue
			}
			elements.push(this.expression())
		}
		this.advance() // ']'
		// What was written is the block's. The vector inside it is not what was written.
		return bindings.length === 0 ? vec(...elements) : letBlock(bindings, vec(...elements))
	}

	// --- {...} — record / let-block ------------------------------------------

	private braceForm(): AST {
		this.advance() // '{'

		if (this.peek().kind === '}') {
			this.advance()
			return new RecordAST([])
		}

		return this.lookaheadIsRecord() ? this.recordTail() : this.letTail()
	}

	private lookaheadIsRecord(): boolean {
		// Spread entry → definitely a record
		if (this.peek().kind === '...' || this.peek().kind === '...~') return true

		// `name :` (with optional `?`) → record
		// `name =` → let-block
		// anything else → let-block (trailing expr at most)
		if (this.peek().kind !== 'identifier') return false
		let i = this.pos + 1
		if (this.tokens[i]?.kind === '?') i++
		if (this.tokens[i]?.kind === ':') return true
		return false
	}

	private recordTail(): AST {
		const entries: RecordEntry[] = []
		const optional = new Set<string>()
		while (this.peek().kind !== '}') {
			if (this.peek().kind === 'eof') {
				throw this.error(this.peek(), 'unterminated `{`')
			}

			if (this.peek().kind === '...') {
				this.advance()
				entries.push(spread(this.atom()))
				continue
			}

			if (this.peek().kind === '...~') {
				this.advance()
				entries.push(spread(unquote(this.atom())))
				continue
			}

			if (this.peek().kind !== 'identifier') {
				throw this.error(this.peek(), 'expected field name')
			}
			const name = this.advance().value as string
			if (this.peek().kind === '?') {
				this.advance()
				optional.add(name)
			}
			this.expect(':')
			entries.push([name, this.expression()])
		}
		this.advance() // '}'
		return new RecordAST(entries, optional.size > 0 ? optional : undefined)
	}

	private letTail(): AST {
		const bindings: [string, AST][] = []
		let body: AST | null = null

		while (this.peek().kind !== '}') {
			if (this.peek().kind === 'eof') {
				throw this.error(this.peek(), 'unterminated `{`')
			}
			if (
				this.peek().kind === 'identifier' &&
				this.peek(1).kind === '='
			) {
				const name = this.advance().value as string
				this.advance() // '='
				bindings.push([name, this.expression()])
				continue
			}
			if (body !== null) {
				throw this.error(
					this.peek(),
					'a let-block may have at most one trailing expression'
				)
			}
			const opensVector = this.peek().kind === '['
			body = this.expression()
			// A vector's names are bound with the rest of the block: order means nothing, here or there.
			if (opensVector && body.kind === 'let') {
				const inner = body
				if (!inner.bindings.some(([name]) => bindings.some(([bound]) => bound === name))) {
					bindings.push(...inner.bindings.map(([name, value]): [string, AST] => [name, value]))
					body = inner.body
				}
			}
		}
		this.advance() // '}'
		// `{()}` is how an empty let-block is written: it has no body, as `{a = 1}` has none.
		const isEmpty =
			bindings.length === 0 && body?.kind === 'lit' && body.value === UNIT
		return isEmpty ? letBlock(bindings) : letBlock(bindings, body)
	}

	// --- ^{...} expr — metadata ----------------------------------------------

	private metaForm(): AST {
		this.advance() // '^'
		this.expect('{')
		const content: Record<string, AST> = {}
		while (this.peek().kind !== '}') {
			if (this.peek().kind !== 'identifier') {
				throw this.error(this.peek(), 'expected metadata field name')
			}
			const name = this.advance().value as string
			this.expect(':')
			content[name] = this.expression()
		}
		this.advance() // '}'
		// Metadata cannot stack — `^{...} ^{...} expr` is a syntax error.
		// Combine fields into a single `^{...}` instead.
		if (this.peek().kind === '^') {
			throw this.error(
				this.peek(),
				'metadata cannot wrap another metadata; combine fields into a single ^{...}'
			)
		}
		const expr = this.expression()
		// `@` and `#_` are metadata too, so they join these fields.
		if (expr.kind !== 'meta') return meta(content, expr)
		const { fields } = meta(content, expr.expr).metadata
		return new MetaAST(
			new RecordAST([...fields, ...expr.metadata.fields]),
			expr.expr
		)
	}
}
