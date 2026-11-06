/**
 * What each stretch of a line of Glisp is, for showing it. It is read by the language's own
 * lexer, so that what is shown as a name is what is read as one, and the rest of the
 * grammar is only as much as can be told going along a line, without a parser that would
 * give up on what is still being typed.
 */

import { LexError, nextToken, skipTrivia, type Token } from '@glisp/lang'

/** What a line goes on from, which is what the lines before it leave. */
export interface LineState {
	/** In a string that has not closed. */
	readonly inString: boolean
	/** What comes next is what a call calls. */
	readonly inHead: boolean
	/** The name just read is what a call calls, and a `.` goes on with it. */
	readonly inCallee: boolean
	/** What comes next is written after a `:`, as a type. */
	readonly inType: boolean
	/** Past a `=>`, and not yet at a `:`, where a list is of parameters and calls nothing. */
	readonly inSignature: boolean
	/**
	 * What is open, innermost last: `(` a call, `f` a function, `p` a list of its parameters, and
	 * `[` and `{`. A `:` right in a call gives a keyword its value, and a `:` elsewhere a type.
	 */
	readonly open: string
}

export const LINE_START: LineState = {
	inString: false,
	inHead: false,
	inCallee: false,
	inType: false,
	inSignature: false,
	open: '',
}

/** A stretch of a line, from `start` until where the next begins. */
export interface LineToken {
	readonly start: number
	readonly scope: string
}

const KEYWORDS = new Set(['|>', '%', '&'])
const TYPES = new Set(['number', 'string', 'boolean', 'unit', 'vector', 'enum', 'IO'])

/** A name that is given something right after it: `a = 1`, `x: 1`, `(f x: 1)`, `y?: 1`. */
const BOUND = /^\s*\??\s*(?::|=(?![=>]))/

const ESCAPE = /\\(?:[nrt"\\]|u[0-9a-fA-F]{4})/y

/** Where a string read on from `start` closes, past the `"`, if it does on this line. */
function readString(line: string, start: number, tokens: LineToken[]): number | null {
	let pos = start
	const inString = () => {
		if (tokens.at(-1)?.scope !== 'string') tokens.push({ start: pos, scope: 'string' })
	}
	while (pos < line.length) {
		const ch = line[pos]
		if (ch === '"') {
			inString()
			return pos + 1
		}
		if (ch !== '\\') {
			inString()
			pos++
			continue
		}
		ESCAPE.lastIndex = pos
		const escape = ESCAPE.exec(line)
		tokens.push({ start: pos, scope: escape === null ? 'invalid' : 'string.escape' })
		pos += escape?.[0].length ?? Math.min(2, line.length - pos)
	}
	return null
}

function scopeOfName(token: Token, line: string, state: LineState): string {
	if (state.inType) return 'type'
	if (BOUND.test(line.slice(token.end))) return 'variable'
	if (KEYWORDS.has(token.text)) return 'keyword'
	if (state.inHead) return 'function'
	return TYPES.has(token.text) ? 'type' : 'identifier'
}

function scopeOf(token: Token, line: string, state: LineState): string {
	switch (token.kind) {
		case 'identifier':
			return scopeOfName(token, line, state)
		case 'number':
			return 'number'
		case 'boolean':
		case '()':
			return 'constant.language'
		case '_':
		case '!':
			return 'type'
		case 'pathSegments':
			return 'variable.predefined'
		case '(':
		case ')':
		case '[':
		case ']':
		case '{':
		case '}':
		case '.':
			return 'delimiter'
		default:
			return 'keyword'
	}
}

function stateAfter(token: Token, state: LineState): LineState {
	const next = { ...state, inHead: false, inCallee: false, inType: false }
	const inner = state.open.at(-1)
	switch (token.kind) {
		case '(': {
			const list = state.inSignature && inner === 'f'
			return { ...next, inHead: !state.inSignature, open: state.open + (list ? 'p' : '(') }
		}
		case '[':
		case '{':
			return { ...next, open: state.open + token.kind }
		case ')':
		case ']':
		case '}':
			return { ...next, open: state.open.slice(0, -1) }
		case '.':
			return { ...next, inHead: state.inCallee }
		case '=>':
			return { ...next, inSignature: true, open: inner === '(' ? `${state.open.slice(0, -1)}f` : state.open }
		case ':':
			// Directly after `(`, it is what is called, on a value and a type.
			if (state.inHead) return next
			// What a keyword is given is a value, as anything else given to a call is.
			if (inner === '(' && !state.inSignature) return next
			return { ...next, inType: true, inSignature: false }
		case 'identifier':
			return { ...next, inCallee: state.inHead && !KEYWORDS.has(token.text) }
		default:
			return next
	}
}

/** What `line` comes to, going on from `state`, and what it leaves for the next. */
export function tokenizeLine(
	line: string,
	state: LineState
): { tokens: LineToken[]; state: LineState } {
	const tokens: LineToken[] = []
	let now = state
	let pos = 0

	if (now.inString) {
		const end = readString(line, 0, tokens)
		if (end === null) return { tokens, state: now }
		now = { ...now, inString: false }
		pos = end
	}

	while (pos < line.length) {
		const start = skipTrivia(line, pos)
		const comment = line.indexOf(';', pos)
		if (comment !== -1 && comment < start) {
			if (comment > pos) tokens.push({ start: pos, scope: '' })
			tokens.push({ start: comment, scope: 'comment' })
			return { tokens, state: now }
		}
		if (start > pos) tokens.push({ start: pos, scope: '' })
		if (start >= line.length) break

		if (line[start] === '"') {
			tokens.push({ start, scope: 'string' })
			const end = readString(line, start + 1, tokens)
			now = stateAfter({ kind: 'string', text: '', start, end: end ?? line.length }, now)
			if (end === null) return { tokens, state: { ...now, inString: true } }
			pos = end
			continue
		}

		try {
			const token = nextToken(line, start)
			tokens.push({ start, scope: scopeOf(token, line, now) })
			now = stateAfter(token, now)
			pos = token.end
		} catch (error) {
			if (!(error instanceof LexError)) throw error
			// What cannot be read shows as far as it was got through, and reading goes on.
			tokens.push({ start, scope: 'invalid' })
			pos = Math.max(error.position, start + 1)
		}
	}
	return { tokens, state: now }
}
