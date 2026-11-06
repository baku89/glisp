/**
 * Tokenizer for Glisp source.
 *
 * Output is a flat sequence of tokens. Whitespace and comments are skipped
 * (no trivia preservation yet — that's a follow-up CST pass).
 *
 * Token kinds match the source text wherever a single literal form can stand
 * in (e.g. '(', ':', '=>', '...', '_'). Kinds that don't have a single fixed
 * form (numbers, strings, identifiers, paths) use descriptive names.
 *
 * Spec: docs/spec/syntax.md
 */

import { UNIT, type Unit } from './types.js'

// -----------------------------------------------------------------------------
// Token shape
// -----------------------------------------------------------------------------

/**
 * Every kind of token the lexer emits. Punctuation kinds equal their
 * source form (e.g. `'('`, `':'`, `'=>'`); the rest are descriptive
 * names for variable-shape tokens (`'number'`, `'identifier'`, ...).
 * The trailing `'eof'` token is always present so consumers can peek
 * past the end without bounds-checking.
 */
export type TokenKind =
	| '('
	| ')'
	| '['
	| ']'
	| '{'
	| '}'
	| ':'
	| '='
	| '=>'
	| '^'
	| '?'
	| '~'
	| '@'
	| '#_'
	| '#'        // before `(`, `[` or `{`: a function of `%`
	| '...'      // spread
	| '...~'     // unquote-splice
	| '.'        // accessor
	| '()'       // unit literal
	| '_'        // top
	| '!'        // bottom
	| 'number'
	| 'string'
	| 'boolean'
	| 'identifier'
	| 'pathSegments' // ./..., ../..., etc. — value carries parsed segments
	| 'eof'

/**
 * A single lexed token: its `kind`, the verbatim source slice
 * (`text`), the half-open source offsets (`[start, end)`), and a
 * decoded `value` for kinds that carry one (numbers, strings,
 * booleans, unit, paths).
 */
export interface Token {
	readonly kind: TokenKind
	readonly text: string  // verbatim source slice
	readonly start: number // source offset (inclusive)
	readonly end: number   // source offset (exclusive)
	readonly value?: number | string | boolean | Unit | ReadonlyArray<'..' | string | number>
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Tokenize Glisp source into a flat token sequence. Whitespace and
 * `;`-style comments are skipped. The returned array always ends with
 * an `{ kind: 'eof' }` token. Throws `LexError` on the first
 * unrecoverable character (bad escape, unterminated string, etc.).
 */
export function lex(src: string): Token[] {
	const tokens: Token[] = []
	for (let token = nextToken(src, 0); ; token = nextToken(src, token.end)) {
		tokens.push(token)
		if (token.kind === 'eof') return tokens
	}
}

/** The offset of what comes first from `start` that is neither whitespace nor a comment. */
export function skipTrivia(src: string, start: number): number {
	let pos = start
	while (pos < src.length) {
		const ch = src[pos]!
		if (isWhitespace(ch)) pos++
		else if (ch === ';') while (pos < src.length && src[pos] !== '\n') pos++
		else break
	}
	return pos
}

/** The token that comes first from `start`, for what reads it a piece at a time. */
export function nextToken(src: string, start: number): Token {
	const pos = skipTrivia(src, start)
	if (pos >= src.length) return { kind: 'eof', text: '', start: pos, end: pos }
	const ch = src[pos]!

	// `()` is the unit literal — emitted as a single token
	if (ch === '(' && src[pos + 1] === ')') {
		return { kind: '()', text: '()', start: pos, end: pos + 2, value: UNIT }
	}

	// single-character punctuation
	// `#` before a bracket makes a function of `%`, and `#` alone is kept for what may come.
	const next = src[pos + 1]
	const single =
		ch === '#' && next === '_'
			? ({ kind: '#_', text: '#_', start: pos, end: pos + 2 } as const)
			: ch === '#' && (next === '(' || next === '[' || next === '{')
				? ({ kind: '#', text: '#', start: pos, end: pos + 1 } as const)
				: singleCharToken(ch, pos)
	if (single !== null) return single

	// `=` family: =>, ==, =
	if (ch === '=') {
		if (src[pos + 1] === '>') return { kind: '=>', text: '=>', start: pos, end: pos + 2 }
		// equality operator as identifier
		if (src[pos + 1] === '=') {
			return { kind: 'identifier', text: '==', start: pos, end: pos + 2, value: '==' }
		}
		return { kind: '=', text: '=', start: pos, end: pos + 1 }
	}

	// `.` family: accessor / path / spread / splice
	if (ch === '.') return readDotForms(src, pos)

	// `/` right before a name or an index begins a path from the root.
	if (ch === '/' && startsSegmentFromRoot(charAt(src, pos + 1))) {
		return readPathFromDots(src, pos, pos, 1, ['/'])
	}

	// Bare `/` is the division operator (a single-character identifier).
	// Path tokens like `./foo` and `../bar` are captured by the dot-family
	// branch above before reaching here.
	if (ch === '/') return { kind: 'identifier', text: '/', start: pos, end: pos + 1, value: '/' }

	if (ch === '"') return readString(src, pos)

	if (isNumberStart(src, pos)) return readNumber(src, pos)

	// identifier (or reserved bare token), which `\` may start
	const char = charAt(src, pos)
	if (char === '\\' || isIdentifierStart(char)) return readIdentifierOrReserved(src, pos)

	throw lexError(src, pos, `Unexpected character: ${JSON.stringify(char)}`)
}

// -----------------------------------------------------------------------------
// Character classes
// -----------------------------------------------------------------------------

function isWhitespace(ch: string): boolean {
	return (
		ch === ' ' ||
		ch === '\t' ||
		ch === '\n' ||
		ch === '\r' ||
		(ch > '\x7f' && /\p{Zs}/u.test(ch))
	)
}

const IDENT_CHARS = '+-*<>&|%_!$'

/**
 * Beyond ASCII, an identifier may hold letters, marks, numbers, and symbols:
 * `π`, `ℝ`, `∞`, `°`, `半径`. Punctuation is left out, so `「` and `（` stay
 * errors rather than quietly becoming names. The joiner keeps emoji whole.
 */
const NON_ASCII_IDENT_CHAR = /^[\p{L}\p{M}\p{N}\p{S}\p{Pc}\u200d]$/u
const NON_ASCII_IDENT_START = /^[\p{L}\p{No}\p{Nl}\p{S}\p{Pc}]$/u

/** The whole character at `pos`, which may be two UTF-16 units. */
function charAt(src: string, pos: number): string {
	return pos < src.length ? String.fromCodePoint(src.codePointAt(pos)!) : ''
}

function isIdentifierChar(ch: string): boolean {
	if (ch > '\x7f') return NON_ASCII_IDENT_CHAR.test(ch)
	if (ch >= 'a' && ch <= 'z') return true
	if (ch >= 'A' && ch <= 'Z') return true
	if (ch >= '0' && ch <= '9') return true
	return ch !== '' && IDENT_CHARS.indexOf(ch) >= 0
}

function isIdentifierStart(ch: string): boolean {
	if (ch > '\x7f') return NON_ASCII_IDENT_START.test(ch)
	if (ch >= '0' && ch <= '9') return false
	return isIdentifierChar(ch)
}

/** What a `\\` cannot put in a name, as it could not be seen there. */
const CONTROL = /^\p{Cc}$/u

/**
 * The offset just past the identifier characters starting at `pos`. `\\` puts the character after
 * it in, whatever it is, as `layer\\ 1`.
 */
function identifierEnd(src: string, start: number): number {
	let pos = start
	while (pos < src.length) {
		if (src[pos] === '\\') {
			const escaped = charAt(src, pos + 1)
			if (escaped === '' || CONTROL.test(escaped)) {
				throw lexError(src, pos, 'a `\\` in a name is followed by what it puts in it')
			}
			pos += 1 + escaped.length
			continue
		}
		const char = charAt(src, pos)
		if (!isIdentifierChar(char)) break
		pos += char.length
	}
	return pos
}

/** A name as it is written, without the `\\` before what they put in it. */
function unescapedName(text: string): string {
	return text.replace(/\\(.)/gsu, '$1').normalize('NFC')
}

/**
 * `name` written so that it reads back as that name: as it is, if it can be, and otherwise with
 * `\\` before each character that would end it or start something else, as `layer\\ 1`, `\\1st`
 * and `\\true`.
 */
export function writtenName(name: string): string {
	if (readsAsName(name, name)) return name
	let out = ''
	let first = true
	for (const char of name) {
		out += (first ? isIdentifierStart(char) : isIdentifierChar(char)) ? char : `\\${char}`
		first = false
	}
	if (!readsAsName(out, name) && !out.startsWith('\\')) out = `\\${out}`
	return out
}

function readsAsName(text: string, name: string): boolean {
	try {
		const token = nextToken(text, 0)
		return token.kind === 'identifier' && token.value === name && token.end === text.length
	} catch {
		return false
	}
}

function isDigit(ch: string | undefined): boolean {
	return ch !== undefined && ch >= '0' && ch <= '9'
}

function isNumberStart(src: string, pos: number): boolean {
	const ch = src[pos]
	if (isDigit(ch)) return true
	if (ch === '-' && isDigit(src[pos + 1])) return true
	return false
}

// -----------------------------------------------------------------------------
// Single-character tokens
// -----------------------------------------------------------------------------

function singleCharToken(ch: string, pos: number): Token | null {
	switch (ch) {
		case '(':
			return { kind: '(', text: '(', start: pos, end: pos + 1 }
		case ')':
			return { kind: ')', text: ')', start: pos, end: pos + 1 }
		case '[':
			return { kind: '[', text: '[', start: pos, end: pos + 1 }
		case ']':
			return { kind: ']', text: ']', start: pos, end: pos + 1 }
		case '{':
			return { kind: '{', text: '{', start: pos, end: pos + 1 }
		case '}':
			return { kind: '}', text: '}', start: pos, end: pos + 1 }
		case ':':
			return { kind: ':', text: ':', start: pos, end: pos + 1 }
		case '^':
			return { kind: '^', text: '^', start: pos, end: pos + 1 }
		case '?':
			return { kind: '?', text: '?', start: pos, end: pos + 1 }
		case '~':
			return { kind: '~', text: '~', start: pos, end: pos + 1 }
		case '@':
			return { kind: '@', text: '@', start: pos, end: pos + 1 }
		default:
			return null
	}
}

// -----------------------------------------------------------------------------
// Dot family — accessor / path / spread / splice
// -----------------------------------------------------------------------------

function readDotForms(src: string, start: number): Token {
	let i = start
	while (src[i] === '.') i++
	const dots = i - start
	const next = src[i]

	// `...~` = splice
	if (dots >= 3 && next === '~') {
		return {
			kind: '...~',
			text: src.slice(start, i + 1),
			start,
			end: i + 1,
		}
	}

	// path — followed by `/`
	if (next === '/') {
		return readPathFromDots(src, start, i, dots)
	}

	// 1 dot, no slash → accessor
	if (dots === 1) {
		return { kind: '.', text: '.', start, end: i }
	}

	// 2 dots alone (or trailing nothing) → path that names the parent itself
	if (dots === 2) {
		return {
			kind: 'pathSegments',
			text: src.slice(start, i),
			start,
			end: i,
			value: ['..'],
		}
	}

	// dots >= 3, no slash, not splice → spread
	return { kind: '...', text: src.slice(start, i), start, end: i }
}

function readPathFromDots(
	src: string,
	start: number,
	dotsEnd: number,
	dots: number,
	from: readonly string[] = []
): Token {
	const segments: ('..' | string | number)[] = [...from]
	for (let k = 1; k < dots; k++) segments.push('..')

	let pos = dotsEnd  // pointing at '/'
	while (src[pos] === '/') {
		pos++  // skip '/'

		if (pos >= src.length || !isPathSegmentStart(charAt(src, pos))) break

		if (src[pos] === '.' && src[pos + 1] === '.') {
			segments.push('..')
			pos += 2
			continue
		}

		if (isDigit(src[pos])) {
			const numStart = pos
			while (isDigit(src[pos])) pos++
			segments.push(parseInt(src.slice(numStart, pos), 10))
			continue
		}

		const idStart = pos
		pos = identifierEnd(src, pos)
		const name = unescapedName(src.slice(idStart, pos))
		// A segment is told from a name by these, and so a path cannot go to a name that is one.
		if (name.endsWith(':') || name === '..' || name === '/') {
			throw lexError(src, idStart, `a path cannot go to the name ${JSON.stringify(name)}`)
		}
		// `key:` is what fills a slot, a record's field or a call's argument, and not a name.
		if (src[pos] === ':') {
			pos++
			segments.push(`${name}:`)
		} else {
			segments.push(name)
		}
	}

	return {
		kind: 'pathSegments',
		text: src.slice(start, pos),
		start,
		end: pos,
		value: segments,
	}
}

function startsSegmentFromRoot(ch: string): boolean {
	return ch !== '.' && isPathSegmentStart(ch)
}

function isPathSegmentStart(ch: string): boolean {
	if (ch === '.' || ch === '\\') return true
	if (isDigit(ch)) return true
	return isIdentifierStart(ch)
}

// -----------------------------------------------------------------------------
// String literal
// -----------------------------------------------------------------------------

function readString(src: string, start: number): Token {
	let pos = start + 1  // skip opening "
	let out = ''
	while (pos < src.length) {
		const ch = src[pos]!
		if (ch === '"') {
			return {
				kind: 'string',
				text: src.slice(start, pos + 1),
				start,
				end: pos + 1,
				value: out,
			}
		}
		if (ch === '\\') {
			const esc = src[pos + 1]
			switch (esc) {
				case 'n':
					out += '\n'
					pos += 2
					break
				case 'r':
					out += '\r'
					pos += 2
					break
				case 't':
					out += '\t'
					pos += 2
					break
				case '"':
					out += '"'
					pos += 2
					break
				case '\\':
					out += '\\'
					pos += 2
					break
				case 'u': {
					const hex = src.slice(pos + 2, pos + 6)
					if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
						throw lexError(src, pos, 'invalid \\u escape')
					}
					out += String.fromCodePoint(parseInt(hex, 16))
					pos += 6
					break
				}
				default:
					throw lexError(src, pos, `unknown escape: \\${esc}`)
			}
			continue
		}
		out += ch
		pos++
	}
	throw lexError(src, start, 'unterminated string literal')
}

// -----------------------------------------------------------------------------
// Number literal
// -----------------------------------------------------------------------------

function readNumber(src: string, start: number): Token {
	let pos = start
	if (src[pos] === '-') pos++
	while (isDigit(src[pos])) pos++
	if (src[pos] === '.' && isDigit(src[pos + 1])) {
		pos++
		while (isDigit(src[pos])) pos++
	}
	if (src[pos] === 'e' || src[pos] === 'E') {
		pos++
		if (src[pos] === '+' || src[pos] === '-') pos++
		if (!isDigit(src[pos])) {
			throw lexError(src, pos, 'expected digit after exponent')
		}
		while (isDigit(src[pos])) pos++
	}
	const text = src.slice(start, pos)
	return {
		kind: 'number',
		text,
		start,
		end: pos,
		value: Number(text),
	}
}

// -----------------------------------------------------------------------------
// Identifier / reserved bare tokens
// -----------------------------------------------------------------------------

function readIdentifierOrReserved(src: string, start: number): Token {
	let pos = identifierEnd(src, start)

	// `>=`, `<=`, `!=` extension (the `=` after a comparator is part of one
	// identifier even though `=` is not in the identifier character set).
	const last = src[pos - 1]
	if ((last === '<' || last === '>' || last === '!') && src[pos - 2] !== '\\' && src[pos] === '=') {
		pos++
	}

	const text = src.slice(start, pos)

	// Written with `\\`, it is a name whatever it says, but for what stands for something else.
	if (text.includes('\\')) {
		const value = unescapedName(text)
		if (value === '_' || value === '!' || value === '%') {
			throw lexError(src, start, `\`${value}\` cannot be a name`)
		}
		return { kind: 'identifier', text, start, end: pos, value }
	}

	switch (text) {
		case '_':
			return { kind: '_', text, start, end: pos }
		case '!':
			return { kind: '!', text, start, end: pos }
		case 'true':
			return { kind: 'boolean', text, start, end: pos, value: true }
		case 'false':
			return { kind: 'boolean', text, start, end: pos, value: false }
	}

	// Normalized, so the same name typed two ways is the same name.
	return { kind: 'identifier', text, start, end: pos, value: text.normalize('NFC') }
}

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

/**
 * Thrown by `lex` on an unrecoverable input (an unexpected character,
 * a bad string escape, an unterminated string, etc.). Carries the
 * full source text and the byte offset where lexing gave up so a
 * host can render a positional error message.
 */
export class LexError extends Error {
	constructor(
		message: string,
		public readonly source: string,
		public readonly position: number
	) {
		super(message)
		this.name = 'LexError'
	}
}

function lexError(src: string, pos: number, msg: string): LexError {
	return new LexError(`${msg} (at offset ${pos})`, src, pos)
}
