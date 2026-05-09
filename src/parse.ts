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
	meta,
	path,
	quote,
	splice,
	spread,
	sym,
	unquote,
	vec,
} from './build.js'
import { lex, type Token, type TokenKind } from './lex.js'
import {
	type AST,
	type FnParam,
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
	const parser = new Parser(lex(src), src)
	const ast = parser.expression()
	parser.expectEof()
	return ast
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
			case '`':
				this.advance()
				return this.stamp(start, quote(this.atom()))
			case '~':
				this.advance()
				return this.stamp(start, unquote(this.atom()))
			case '...':
				this.advance()
				return this.stamp(start, spread(this.atom()))
			case '...~':
				this.advance()
				return this.stamp(start, splice(this.atom()))
			case '^':
				return this.stamp(start, this.metaForm())
			default:
				throw this.error(t, `unexpected ${t.kind}`)
		}
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

		const head = this.expression()
		const args: AST[] = []
		const kwargs: Record<string, AST> = {}
		let sawKwarg = false

		while (this.peek().kind !== ')') {
			if (this.peek().kind === 'eof') {
				throw this.error(this.peek(), 'unterminated `(`')
			}
			// kwarg: identifier `=` expression
			if (
				this.peek().kind === 'identifier' &&
				this.peek(1).kind === '='
			) {
				const nameTok = this.advance()
				this.advance() // '='
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

		this.expect('(')
		const params = this.parseParams()
		this.expect(':')
		const returnType = this.expression()

		let body: AST | null = null
		if (this.peek().kind !== ')') {
			body = this.expression()
		}
		this.expect(')')
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
			if (this.peek().kind !== 'identifier') {
				throw this.error(this.peek(), 'expected parameter name')
			}
			const name = this.advance().value as string
			let optional = false
			if (this.peek().kind === '?') {
				this.advance()
				optional = true
			}
			this.expect(':')
			const type = this.expression()
			params.push({ name, type, optional, variadic })
		}
		this.advance() // ')'
		return params
	}

	// --- [...] — vector ------------------------------------------------------

	private vectorForm(): AST {
		this.advance() // '['
		const elements: AST[] = []
		while (this.peek().kind !== ']') {
			if (this.peek().kind === 'eof') {
				throw this.error(this.peek(), 'unterminated `[`')
			}
			elements.push(this.expression())
		}
		this.advance() // ']'
		return vec(...elements)
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
		if (this.peek().kind === '...') return true

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
			body = this.expression()
		}
		this.advance() // '}'
		return letBlock(bindings, body)
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
		return meta(content, expr)
	}
}
