/**
 * Glisp session adapter for the browser playground.
 *
 * Wraps the shared `Session` (let-block as session state) plus
 * `parse` / `infer` / `check` / `expand` so the Vue UI can render
 * each REPL line as a structured ReplResult — tokens with theme
 * colors, plus diagnostics.
 *
 * Output rendering goes through `toAst` so each line is idempotent:
 * re-pasting it yields the same value.
 */

import { check as coreCheck } from '@core/check.js'
import {
	evaluate as coreEval,
	IO,
	isGlispClosure,
	isTypedHostFn,
	isTypeValue,
	toAst,
} from '@core/eval.js'
import { expandLadder as coreExpandLadder } from '@core/expand.js'
import { infer as coreInfer } from '@core/infer.js'
import { parse, ParseError } from '@core/parse.js'
import { print } from '@core/print.js'
import { buildPrelude } from '@core/prelude.js'
import { Session as CoreSession } from '@core/session.js'
import {
	type AST,
	type Diagnostic,
	type Env,
	LitAST,
	RecordAST,
	SpreadAST,
	SymAST,
	UNIT,
	VecAST,
} from '@core/types.js'

// -----------------------------------------------------------------------------
// Token model — the unit the UI renders with theme colors
// -----------------------------------------------------------------------------

export type TokenKind =
	| 'number'
	| 'string'
	| 'boolean'
	| 'unit'
	| 'symbol'
	| 'punct'
	| 'closure'
	| 'type'
	| 'hostfn'
	| 'plain'

export interface Token {
	readonly kind: TokenKind
	readonly text: string
}

export interface DiagnosticView {
	readonly level: 'error' | 'warning' | 'info'
	readonly message: string
	readonly excerpt?: {
		readonly source: string
		readonly line: number
		readonly column: number
		readonly span: number
	}
}

export interface ReplResult {
	readonly tokens: ReadonlyArray<Token>
	readonly diagnostics: ReadonlyArray<DiagnosticView>
	/** Free-form description for IO actions (`def`, `undef`). */
	readonly note?: string
}

// -----------------------------------------------------------------------------
// Session
// -----------------------------------------------------------------------------

export interface Session {
	readonly env: () => Env
	/** Names visible at top-level (insertion order). */
	readonly bindings: () => ReadonlyArray<string>
	/** The session as a let-block AST — the source of truth. */
	readonly tree: () => string
	/** Evaluate a source line; auto-runs top-level IO actions. */
	readonly run: (src: string) => ReplResult
	/** Look up the inferred type of an expression. */
	readonly typeOf: (src: string) => ReplResult
	/** Static-check an expression — returns diagnostics only. */
	readonly check: (src: string) => ReplResult
	/** One-step macro expansion (the abstraction ladder). */
	readonly expand: (src: string) => ReplResult
	/** Doc + type + value of a bound name. */
	readonly doc: (name: string) => ReplResult
	/** Reset the session to an empty let-block. */
	readonly reset: () => void
	/** Decide whether `src` looks structurally complete (multi-line input). */
	readonly isComplete: (src: string) => boolean
}

export function createSession(): Session {
	let session = new CoreSession(buildPrelude())

	return {
		env: () => session.env,
		bindings: () => session.bindings(),
		tree: () => print(session.ast()),
		run: src => runLine(src, session),
		typeOf: src => typeOfLine(src, session.env),
		check: src => checkLine(src, session.env),
		expand: src => expandLine(src, session.env),
		doc: name => docLine(name, session.env),
		reset: () => {
			session = new CoreSession(buildPrelude())
		},
		isComplete: src => isInputComplete(src),
	}
}

function docLine(name: string, env: Env): ReplResult {
	let ast: AST
	try {
		ast = parse(name)
	} catch (e) {
		return { tokens: [], diagnostics: [parseErrorToDiagnostic(name, e)] }
	}
	const t = coreInfer(ast, env)
	const r = coreEval(ast, env)
	const docText = lookupDocByName(name, env)
	const tokens: Token[] = [
		{ kind: 'symbol', text: name },
		{ kind: 'punct', text: ' : ' },
		{ kind: 'type', text: t === null ? '?' : t.typeName },
	]
	if (docText !== null) {
		tokens.push({ kind: 'plain', text: '\n  ' })
		tokens.push({ kind: 'plain', text: docText })
	}
	tokens.push({ kind: 'plain', text: '\n  = ' })
	for (const t of tokensForValue(r.value, env)) tokens.push(t)
	return { tokens, diagnostics: [] }
}

function lookupDocByName(name: string, env: Env): string | null {
	let frame = env as Frame | null
	while (frame !== null) {
		const target = frame.bindings?.get(name)
		if (target !== undefined) {
			const ast = target.ast
			if (ast.kind === 'meta') {
				const entry = ast.metadata.get('doc')
				if (
					entry !== undefined &&
					entry.kind === 'lit' &&
					typeof entry.value === 'string'
				) {
					return entry.value
				}
			}
			return null
		}
		frame = frame.parent as Frame | null
	}
	return null
}

// -----------------------------------------------------------------------------
// Input completeness — for multi-line auto-continuation
// -----------------------------------------------------------------------------

function isInputComplete(src: string): boolean {
	if (src.trim() === '') return true
	try {
		parse(src)
		return true
	} catch (e) {
		if (!(e instanceof ParseError)) return true
		const msg = e.message
		return !(
			/unterminated/.test(msg) ||
			/got eof/.test(msg) ||
			/unexpected eof/.test(msg)
		)
	}
}

// -----------------------------------------------------------------------------
// Run / type-of / check / expand — produce a ReplResult
// -----------------------------------------------------------------------------

function runLine(src: string, session: CoreSession): ReplResult {
	let r
	try {
		r = session.evalSrc(src)
	} catch (e) {
		return { tokens: [], diagnostics: [parseErrorToDiagnostic(src, e)] }
	}

	const diagnostics = r.diagnostics.map(d => coreDiagnosticToView(d))

	if (r.value instanceof IO) {
		const effectDiagnostics = r.value.run()
		const tokens: Token[] = [{ kind: 'unit', text: '()' }]
		const note = r.value.description
		return {
			tokens,
			diagnostics: [
				...diagnostics,
				...effectDiagnostics.map(coreDiagnosticToView),
			],
			note,
		}
	}

	return {
		tokens: tokensForValue(r.value, session.env),
		diagnostics,
	}
}

function checkLine(src: string, env: Env): ReplResult {
	let ast: AST
	try {
		ast = parse(src)
	} catch (e) {
		return { tokens: [], diagnostics: [parseErrorToDiagnostic(src, e)] }
	}
	const ds = coreCheck(ast, env)
	if (ds.length === 0) {
		return {
			tokens: [{ kind: 'plain', text: '✓ no static type errors' }],
			diagnostics: [],
		}
	}
	return { tokens: [], diagnostics: ds.map(coreDiagnosticToView) }
}

function expandLine(src: string, env: Env): ReplResult {
	let ast: AST
	try {
		ast = parse(src)
	} catch (e) {
		return { tokens: [], diagnostics: [parseErrorToDiagnostic(src, e)] }
	}
	const ladder = coreExpandLadder(ast, env)
	if (ladder.length === 1) {
		return {
			tokens: [
				{
					kind: 'plain',
					text: '(no expansion — already a fixed point)',
				},
			],
			diagnostics: [],
		}
	}
	const out: Token[] = []
	for (let i = 0; i < ladder.length; i++) {
		if (i > 0) out.push({ kind: 'plain', text: '\n  → ' })
		else out.push({ kind: 'plain', text: '· ' })
		tokensForAst(ladder[i]!, out)
	}
	return { tokens: out, diagnostics: [] }
}

function typeOfLine(src: string, env: Env): ReplResult {
	let ast: AST
	try {
		ast = parse(src)
	} catch (e) {
		return { tokens: [], diagnostics: [parseErrorToDiagnostic(src, e)] }
	}
	const t = coreInfer(ast, env)
	if (t === null) {
		return {
			tokens: [{ kind: 'plain', text: '? (type unknown)' }],
			diagnostics: [],
		}
	}
	return {
		tokens: [
			{ kind: 'punct', text: ': ' },
			{ kind: 'type', text: t.typeName },
		],
		diagnostics: [],
	}
}

// -----------------------------------------------------------------------------
// Tokenization for output rendering
// -----------------------------------------------------------------------------

function tokensForValue(v: unknown, env: Env): Token[] {
	if (v instanceof IO) {
		return [{ kind: 'type', text: `<IO ${v.description}>` }]
	}
	if (
		typeof v === 'function' &&
		!isTypedHostFn(v) &&
		!isTypeValue(v) &&
		!isGlispClosure(v)
	) {
		const ast = toAst(v, env)
		if (ast.kind === 'sym') {
			return [{ kind: 'symbol', text: (ast as SymAST).name }]
		}
		return [{ kind: 'hostfn', text: '<host-fn>' }]
	}
	const out: Token[] = []
	tokensForAst(toAst(v, env), out)
	return out
}

function tokensForAst(ast: AST, out: Token[]): void {
	switch (ast.kind) {
		case 'lit': {
			const v = (ast as LitAST).value
			if (v === UNIT) {
				out.push({ kind: 'unit', text: '()' })
			} else if (typeof v === 'string') {
				out.push({ kind: 'string', text: JSON.stringify(v) })
			} else if (typeof v === 'number') {
				out.push({ kind: 'number', text: String(v) })
			} else if (typeof v === 'boolean') {
				out.push({ kind: 'boolean', text: String(v) })
			} else {
				out.push({ kind: 'plain', text: ast.print() })
			}
			break
		}
		case 'sym':
			out.push({ kind: 'symbol', text: (ast as SymAST).name })
			break
		case 'vec': {
			out.push({ kind: 'punct', text: '[' })
			const elems = (ast as VecAST).elements
			for (let i = 0; i < elems.length; i++) {
				if (i > 0) out.push({ kind: 'plain', text: ' ' })
				tokensForAst(elems[i]!, out)
			}
			out.push({ kind: 'punct', text: ']' })
			break
		}
		case 'record': {
			const r = ast as RecordAST
			out.push({ kind: 'punct', text: '{' })
			for (let i = 0; i < r.fields.length; i++) {
				if (i > 0) out.push({ kind: 'plain', text: ' ' })
				const entry = r.fields[i]!
				if (entry instanceof SpreadAST) {
					out.push({ kind: 'punct', text: '...' })
					tokensForAst(entry.expr, out)
				} else {
					const [k, val] = entry
					out.push({ kind: 'symbol', text: k })
					out.push({ kind: 'punct', text: ': ' })
					tokensForAst(val, out)
				}
			}
			out.push({ kind: 'punct', text: '}' })
			break
		}
		case 'fn':
			out.push({ kind: 'closure', text: ast.print() })
			break
		case 'quote':
			out.push({ kind: 'punct', text: '`' })
			tokensForAst(ast.expr, out)
			break
		case 'unquote':
			out.push({ kind: 'punct', text: '~' })
			tokensForAst(ast.expr, out)
			break
		case 'spread':
			out.push({ kind: 'punct', text: '...' })
			tokensForAst(ast.expr, out)
			break
		case 'splice':
			out.push({ kind: 'punct', text: '...~' })
			tokensForAst(ast.expr, out)
			break
		default:
			out.push({ kind: 'plain', text: ast.print() })
	}
}

// -----------------------------------------------------------------------------
// Diagnostic rendering
// -----------------------------------------------------------------------------

function coreDiagnosticToView(d: Diagnostic): DiagnosticView {
	const range = d.source.ast.source
	if (range !== undefined) {
		const info = lineColAt(range.text, range.start)
		const newlineIdx = range.text.indexOf('\n', range.start)
		const lineEnd = newlineIdx === -1 ? range.text.length : newlineIdx
		const span = Math.max(1, Math.min(range.end, lineEnd) - range.start)
		return {
			level: d.level,
			message: d.message,
			excerpt: {
				source: info.content,
				line: info.line,
				column: info.col,
				span,
			},
		}
	}
	return { level: d.level, message: d.message }
}

function parseErrorToDiagnostic(
	source: string,
	e: ParseError | unknown
): DiagnosticView {
	if (!(e instanceof ParseError)) {
		return {
			level: 'error',
			message: e instanceof Error ? e.message : String(e),
		}
	}
	const info = lineColAt(source, e.position)
	return {
		level: 'error',
		message: 'syntax error: ' + e.message,
		excerpt: {
			source: info.content,
			line: info.line,
			column: info.col,
			span: 1,
		},
	}
}

function lineColAt(
	text: string,
	pos: number
): { line: number; col: number; content: string } {
	let lineStart = 0
	let line = 0
	for (let i = 0; i < pos; i++) {
		if (text[i] === '\n') {
			line++
			lineStart = i + 1
		}
	}
	let lineEnd = text.indexOf('\n', lineStart)
	if (lineEnd === -1) lineEnd = text.length
	return {
		line,
		col: pos - lineStart,
		content: text.slice(lineStart, lineEnd),
	}
}
