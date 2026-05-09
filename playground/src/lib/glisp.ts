/**
 * Glisp session adapter for the browser playground.
 *
 * Wraps `parse` / `evaluate` / `infer` / `toAst` from `@core/*` and
 * surfaces a structured result the Vue UI can render with theme colors.
 *
 * Result rendering goes through `toAst` so each output line is
 * idempotent: re-pasting it into the REPL yields the same value.
 */

import {
	evaluate as coreEval,
	IOAction,
	isGlispClosure,
	isTypedHostFn,
	isTypeValue,
	toAst,
} from '@core/eval.js'
import { infer as coreInfer } from '@core/infer.js'
import { lex } from '@core/lex.js'
import { parse, ParseError } from '@core/parse.js'
import { buildPrelude } from '@core/prelude.js'
import {
	type AST,
	type Diagnostic,
	type Env,
	type Frame,
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
	/** Names visible at top-level (sorted) — used for completion/UI lists. */
	readonly bindings: () => ReadonlyArray<string>
	/** Evaluate a source line; auto-runs top-level IO actions. */
	readonly run: (src: string) => ReplResult
	/** Look up the inferred type of an expression. */
	readonly typeOf: (src: string) => ReplResult
	/** Reset the session env to a fresh prelude. */
	readonly reset: () => void
	/** Decide whether `src` looks structurally complete (for multi-line input). */
	readonly isComplete: (src: string) => boolean
}

export function createSession(): Session {
	let env: Env = buildPrelude()

	return {
		env: () => env,
		bindings: () => collectNames(env),
		run: src => runLine(src, env, runIO),
		typeOf: src => typeOfLine(src, env),
		reset: () => {
			env = buildPrelude()
		},
		isComplete: src => isInputComplete(src),
	}
}

function runIO(action: IOAction): ReadonlyArray<Diagnostic> {
	return action.run()
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
// REPL-only sugar: top-level `name = expr` → (def "name" expr)
// -----------------------------------------------------------------------------

function expandTopLevelSugar(src: string): string {
	let tokens
	try {
		tokens = lex(src)
	} catch {
		return src
	}
	const first = tokens[0]
	const second = tokens[1]
	if (
		first === undefined ||
		second === undefined ||
		first.kind !== 'identifier' ||
		second.kind !== '='
	) {
		return src
	}
	const name = first.value as string
	const rest = src.slice(second.end).trim()
	if (rest === '') return src
	return `(def ${JSON.stringify(name)} ${rest})`
}

// -----------------------------------------------------------------------------
// Run / type-of — produce a ReplResult
// -----------------------------------------------------------------------------

function runLine(
	src: string,
	env: Env,
	run: (a: IOAction) => ReadonlyArray<Diagnostic>
): ReplResult {
	const expanded = expandTopLevelSugar(src)
	let ast: AST
	try {
		ast = parse(expanded)
	} catch (e) {
		return { tokens: [], diagnostics: [parseErrorToDiagnostic(src, e)] }
	}

	const r = coreEval(ast, env)
	const diagnostics = r.diagnostics.map(d => coreDiagnosticToView(d))

	if (r.value instanceof IOAction) {
		const effectDiagnostics = run(r.value)
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
		tokens: tokensForValue(r.value, env),
		diagnostics,
	}
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
	if (v instanceof IOAction) {
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

// -----------------------------------------------------------------------------
// Misc helpers
// -----------------------------------------------------------------------------

function collectNames(env: Env): string[] {
	const names = new Set<string>()
	let frame: Frame | null = env as Frame | null
	while (frame !== null) {
		if (frame.bindings) {
			for (const k of frame.bindings.keys()) names.add(k)
		}
		frame = frame.parent as Frame | null
	}
	return [...names].sort()
}
