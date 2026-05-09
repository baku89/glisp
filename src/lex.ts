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
	| '`'
	| '~'
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

export function lex(src: string): Token[] {
	const tokens: Token[] = []
	let pos = 0

	while (pos < src.length) {
		const ch = src[pos]!

		// whitespace
		if (isWhitespace(ch)) {
			pos++
			continue
		}

		// comment: ; ... to end of line
		if (ch === ';') {
			while (pos < src.length && src[pos] !== '\n') pos++
			continue
		}

		// `()` is the unit literal — emitted as a single token
		if (ch === '(' && src[pos + 1] === ')') {
			tokens.push({ kind: '()', text: '()', start: pos, end: pos + 2, value: UNIT })
			pos += 2
			continue
		}

		// single-character punctuation
		const single = singleCharToken(ch, pos)
		if (single !== null) {
			tokens.push(single)
			pos++
			continue
		}

		// `=` family: =>, ==, =
		if (ch === '=') {
			if (src[pos + 1] === '>') {
				tokens.push({ kind: '=>', text: '=>', start: pos, end: pos + 2 })
				pos += 2
			} else if (src[pos + 1] === '=') {
				// equality operator as identifier
				tokens.push({
					kind: 'identifier',
					text: '==',
					start: pos,
					end: pos + 2,
					value: '==',
				})
				pos += 2
			} else {
				tokens.push({ kind: '=', text: '=', start: pos, end: pos + 1 })
				pos++
			}
			continue
		}

		// `.` family: accessor / path / spread / splice
		if (ch === '.') {
			const tok = readDotForms(src, pos)
			tokens.push(tok)
			pos = tok.end
			continue
		}

		// Bare `/` is the division operator (a single-character identifier).
		// Path tokens like `./foo` and `../bar` are captured by the dot-family
		// branch above before reaching here.
		if (ch === '/') {
			tokens.push({
				kind: 'identifier',
				text: '/',
				start: pos,
				end: pos + 1,
				value: '/',
			})
			pos++
			continue
		}

		// string literal
		if (ch === '"') {
			const tok = readString(src, pos)
			tokens.push(tok)
			pos = tok.end
			continue
		}

		// number literal
		if (isNumberStart(src, pos)) {
			const tok = readNumber(src, pos)
			tokens.push(tok)
			pos = tok.end
			continue
		}

		// identifier (or reserved bare token)
		if (isIdentifierStart(ch)) {
			const tok = readIdentifierOrReserved(src, pos)
			tokens.push(tok)
			pos = tok.end
			continue
		}

		throw lexError(src, pos, `Unexpected character: ${JSON.stringify(ch)}`)
	}

	tokens.push({ kind: 'eof', text: '', start: pos, end: pos })
	return tokens
}

// -----------------------------------------------------------------------------
// Character classes
// -----------------------------------------------------------------------------

function isWhitespace(ch: string): boolean {
	return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r'
}

const IDENT_CHARS = '+-*<>&|%_!$'
function isIdentifierChar(ch: string): boolean {
	if (ch >= 'a' && ch <= 'z') return true
	if (ch >= 'A' && ch <= 'Z') return true
	if (ch >= '0' && ch <= '9') return true
	return IDENT_CHARS.indexOf(ch) >= 0
}

function isIdentifierStart(ch: string): boolean {
	if (ch >= '0' && ch <= '9') return false
	return isIdentifierChar(ch)
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
		case '`':
			return { kind: '`', text: '`', start: pos, end: pos + 1 }
		case '~':
			return { kind: '~', text: '~', start: pos, end: pos + 1 }
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
	dots: number
): Token {
	const segments: ('..' | string | number)[] = []
	for (let k = 1; k < dots; k++) segments.push('..')

	let pos = dotsEnd  // pointing at '/'
	while (src[pos] === '/') {
		pos++  // skip '/'

		if (pos >= src.length || !isPathSegmentStart(src[pos]!)) break

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
		while (pos < src.length && isIdentifierChar(src[pos]!)) pos++
		segments.push(src.slice(idStart, pos))
	}

	return {
		kind: 'pathSegments',
		text: src.slice(start, pos),
		start,
		end: pos,
		value: segments,
	}
}

function isPathSegmentStart(ch: string): boolean {
	if (ch === '.') return true
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
	let pos = start
	while (pos < src.length && isIdentifierChar(src[pos]!)) pos++

	// `>=`, `<=`, `!=` extension (the `=` after a comparator is part of one
	// identifier even though `=` is not in the identifier character set).
	const last = src[pos - 1]
	if ((last === '<' || last === '>' || last === '!') && src[pos] === '=') {
		pos++
	}

	const text = src.slice(start, pos)

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

	return { kind: 'identifier', text, start, end: pos, value: text }
}

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

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
