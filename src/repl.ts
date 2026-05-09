/**
 * Interactive REPL for trying out the language.
 *
 * Run with `npm run repl`.
 *
 * Each line is parsed and evaluated against a starter env containing
 * arithmetic, comparison, and a few utility functions bound from JS.
 *
 * Multi-line input: end a line with a trailing backslash `\` to continue.
 *
 * Special commands:
 *   :env    — list bindings in the current env
 *   :ast    — print the AST of the previous input
 *   :reset  — restore the starter env
 *   :help   — show this help
 *   :quit   — exit (or Ctrl-D)
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { stdin as input, stdout as output } from 'node:process'
import { createInterface } from 'node:readline/promises'

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'

import pc from 'picocolors'

import { check } from './check.js'
import {
	evaluate,
	IOAction,
	isGlispClosure,
	isTypedHostFn,
	isTypeValue,
	toAst,
} from './eval.js'
import { expandLadder } from './expand.js'
import { infer } from './infer.js'
import { lex } from './lex.js'
import { parse, ParseError } from './parse.js'
import { buildPrelude } from './prelude.js'
import { print } from './print.js'
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
} from './types.js'

// -----------------------------------------------------------------------------
// Theme
// -----------------------------------------------------------------------------

const PROMPT = pc.cyan(pc.bold('glisp> '))
const CONT_PROMPT = pc.dim('     | ')

const theme = {
	prompt: PROMPT,
	cont: CONT_PROMPT,
	number: pc.yellow,
	string: pc.green,
	boolean: pc.magenta,
	keyword: pc.blue,
	punct: pc.dim,
	type: pc.cyan,
	closure: pc.cyan,
	hostfn: pc.dim,
	unit: pc.dim,
	error: pc.red,
	warning: pc.yellow,
	info: pc.cyan,
	syntaxError: pc.red,
	caret: pc.red,
	hint: pc.dim,
	header: pc.bold,
}

function welcome(): string {
	return [
		'',
		theme.header(pc.cyan('  Glisp REPL  ')) +
			theme.hint('— type an expression, or :help for commands.'),
		'',
	].join('\n')
}

// -----------------------------------------------------------------------------
// Value formatting
// -----------------------------------------------------------------------------

/**
 * Render a value as Glisp source whose evaluation reproduces the value —
 * the same idempotence `g.toAst` provides. Re-pasting any output line
 * back into the REPL yields an equal value.
 *
 * - `+`, `number`, `_` print as the bare symbol if the env binds them.
 * - Closures print as their function-literal source.
 * - `IOAction` is the only intentional exception — it represents an
 *   already-performed effect with no expression that re-creates it, so
 *   it shows as `<IO description>` in dim styling.
 *
 * Coloring works on the AST shape: literal kinds get type-specific
 * colors, brackets are punct, symbols are keyword.
 */
function formatValue(v: unknown, env: Env): string {
	if (v instanceof IOAction) return theme.type(`<IO ${v.description}>`)
	// Untyped host fn that toAst can't roundtrip: try to find a name
	// from env, otherwise fall back to a generic marker.
	if (
		typeof v === 'function' &&
		!isTypedHostFn(v) &&
		!isTypeValue(v) &&
		!isGlispClosure(v)
	) {
		const ast = toAst(v, env)
		if (ast.kind === 'sym') return theme.keyword(ast.name)
		return theme.hostfn('<host-fn>')
	}
	return formatAst(toAst(v, env))
}

/**
 * Color-aware AST printer. Mirrors `ast.print()` but applies theme
 * colors token by token. Nested ASTs recurse so coloring is consistent
 * across composite forms.
 */
function formatAst(ast: AST): string {
	switch (ast.kind) {
		case 'lit': {
			const v = (ast as LitAST).value
			if (v === UNIT) return theme.unit('()')
			if (typeof v === 'string') return theme.string(JSON.stringify(v))
			if (typeof v === 'number') return theme.number(String(v))
			if (typeof v === 'boolean') return theme.boolean(String(v))
			return ast.print()
		}
		case 'sym':
			return theme.keyword((ast as SymAST).name)
		case 'vec': {
			const elems = (ast as VecAST).elements.map(formatAst).join(' ')
			return theme.punct('[') + elems + theme.punct(']')
		}
		case 'record': {
			const r = ast as RecordAST
			const parts = r.fields.map(entry => {
				if (entry instanceof SpreadAST) {
					return theme.punct('...') + formatAst(entry.expr)
				}
				const [k, val] = entry
				return (
					theme.keyword(k) + theme.punct(':') + ' ' + formatAst(val)
				)
			})
			return theme.punct('{') + parts.join(' ') + theme.punct('}')
		}
		case 'fn':
			// Function literal — render whole signature in closure color.
			return theme.closure(ast.print())
		case 'quote':
			return theme.punct('`') + formatAst(ast.expr)
		case 'unquote':
			return theme.punct('~') + formatAst(ast.expr)
		case 'spread':
			return theme.punct('...') + formatAst(ast.expr)
		case 'splice':
			return theme.punct('...~') + formatAst(ast.expr)
		default:
			return ast.print()
	}
}

// -----------------------------------------------------------------------------
// Diagnostic formatting
// -----------------------------------------------------------------------------

function formatDiagnostic(d: Diagnostic): string {
	const tag =
		d.level === 'error'
			? theme.error('error')
			: d.level === 'warning'
				? theme.warning('warn')
				: theme.info('info')

	const header = `  ${tag} ${theme.hint('·')} ${d.message}`

	// If the offending AST has a stamped source range, render the same
	// caret + underline that parse errors get.
	const range = d.source.ast.source
	if (range !== undefined) {
		return [header, ...renderSourceRange(range.text, range.start, range.end)]
			.join('\n')
	}
	return header
}

function formatParseError(src: string, e: ParseError): string {
	return [
		theme.syntaxError('  syntax error') + theme.hint(' · ') + e.message,
		...renderSourceRange(src, e.position, e.position + 1),
	].join('\n')
}

/**
 * Render `text[start..end]` as a 2-line excerpt: the source line containing
 * `start`, then a caret/underline pointing at the range. Multi-line ranges
 * are clamped to the first line.
 */
function renderSourceRange(
	text: string,
	start: number,
	end: number
): string[] {
	const lineInfo = lineAt(text, start)
	if (lineInfo === null) return []
	const { line, col, content } = lineInfo
	const lineNumLabel = `  ${line + 1} | `
	const caretIndent = ' '.repeat(lineNumLabel.length + col)
	const span = Math.max(1, Math.min(end, text.indexOf('\n', start) === -1 ? text.length : text.indexOf('\n', start)) - start)
	const underline = span > 1 ? '^' + '~'.repeat(span - 1) : '^'
	return [
		theme.hint(lineNumLabel) + content,
		caretIndent + theme.caret(underline),
	]
}

function lineAt(
	src: string,
	pos: number
): { line: number; col: number; content: string } | null {
	if (pos < 0 || pos > src.length) return null
	let lineStart = 0
	let lineNum = 0
	for (let i = 0; i < pos; i++) {
		if (src[i] === '\n') {
			lineNum++
			lineStart = i + 1
		}
	}
	let lineEnd = src.indexOf('\n', lineStart)
	if (lineEnd === -1) lineEnd = src.length
	return {
		line: lineNum,
		col: pos - lineStart,
		content: src.slice(lineStart, lineEnd),
	}
}

// -----------------------------------------------------------------------------
// Multi-line input — paren / bracket / brace / quote balance
// -----------------------------------------------------------------------------

/**
 * Returns true when `src` is structurally incomplete and the REPL should
 * prompt for another line instead of evaluating. We use a try-parse and
 * inspect the failure mode — only "unterminated bracket" / EOF-shaped
 * errors qualify as "needs more input"; an actual syntax error (e.g.
 * `(=>])`) returns false so the caller can show the error promptly.
 *
 * An empty / whitespace-only buffer is considered complete (trivially).
 */
function isIncomplete(src: string): boolean {
	if (src.trim() === '') return false
	try {
		parse(src)
		return false
	} catch (e) {
		if (!(e instanceof ParseError)) return false
		const msg = e.message
		return (
			/unterminated/.test(msg) ||
			/got eof/.test(msg) ||
			/unexpected eof/.test(msg)
		)
	}
}

// -----------------------------------------------------------------------------
// REPL-only syntactic sugar
// -----------------------------------------------------------------------------

/**
 * Top-level `name = expr` is the REPL's sugar for `(def "name" expr)`.
 *
 * Detection uses the lexer so `==`, `=>`, `<=`, `>=`, `!=` (which all
 * tokenize as identifiers / `=>`) don't trigger it — only a bare
 * `<identifier> =` at the start of input does.
 *
 * The transform splices the original RHS source verbatim, so error
 * positions inside the RHS line up with what the user typed.
 */
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
// Tab completion
// -----------------------------------------------------------------------------

const COMMAND_NAMES = [
	':env',
	':ast',
	':type',
	':check',
	':expand',
	':doc',
	':reset',
	':help',
	':quit',
]

/**
 * Completer signature per node:readline. Returns `[matches, partial]`.
 *
 * - At an empty buffer or at the very start of input, offer command names
 *   (when the prefix begins with `:`) or all binding names.
 * - Otherwise, take the last identifier-shaped token off the buffer and
 *   complete it against the env's binding names.
 */
function completeLine(line: string, env: Env): [string[], string] {
	// Slash command in head position
	if (line.startsWith(':')) {
		const matches = COMMAND_NAMES.filter(n => n.startsWith(line))
		return [matches, line]
	}
	// Find a trailing identifier-shaped fragment (matches Glisp ident
	// chars per lex.ts). Falls back to empty so nothing completes mid-paren.
	const m = line.match(/[A-Za-z_!?+\-*<>&|%$/=][A-Za-z_0-9!?+\-*<>&|%$/=]*$/)
	const partial = m === null ? '' : m[0]
	if (partial === '') return [[], '']
	const names = collectEnvNames(env)
	const matches = names.filter(n => n.startsWith(partial))
	return [matches, partial]
}

function collectEnvNames(env: Env): string[] {
	const names = new Set<string>()
	let frame = env
	while (frame !== null) {
		if (frame.bindings) {
			for (const k of frame.bindings.keys()) names.add(k)
		}
		frame = frame.parent
	}
	return [...names].sort()
}

// -----------------------------------------------------------------------------
// History persistence
// -----------------------------------------------------------------------------

const HISTORY_PATH = join(homedir(), '.glisp', 'history')
const HISTORY_LIMIT = 1000

function loadHistory(): string[] {
	if (!existsSync(HISTORY_PATH)) return []
	try {
		return readFileSync(HISTORY_PATH, 'utf8')
			.split('\n')
			.filter(line => line !== '')
			.slice(-HISTORY_LIMIT)
	} catch {
		return []
	}
}

function saveHistory(lines: ReadonlyArray<string>): void {
	try {
		mkdirSync(join(homedir(), '.glisp'), { recursive: true })
		// readline stores history newest-first; persist in chronological order.
		writeFileSync(
			HISTORY_PATH,
			lines.slice(0, HISTORY_LIMIT).reverse().join('\n') + '\n'
		)
	} catch {
		// best-effort — never crash the REPL on history I/O.
	}
}

// -----------------------------------------------------------------------------
// REPL loop
// -----------------------------------------------------------------------------

async function main(): Promise<void> {
	const starter = buildPrelude()
	let env: Env = starter
	let lastSource: string | null = null

	const rl = createInterface({
		input,
		output,
		prompt: theme.prompt,
		// `history` is the array readline mutates — preload past sessions
		// so up-arrow walks back through them.
		history: loadHistory(),
		historySize: HISTORY_LIMIT,
		// Tab completion of bindings + slash commands. The closure reads
		// the live `env` binding so newly-defined names complete too.
		completer: (line: string) => completeLine(line, env),
	})

	output.write(welcome())
	rl.prompt()

	let buffer = ''
	let multiline = false

	rl.on('line', line => {
		// Trailing backslash forces continuation regardless of paren state —
		// useful when the user wants to enter multi-line input that *would*
		// otherwise be complete on the first line.
		if (line.endsWith('\\')) {
			buffer += line.slice(0, -1) + '\n'
			multiline = true
			rl.setPrompt(theme.cont)
			rl.prompt()
			return
		}

		const candidate = buffer + line

		// Auto-continuation: if the buffer-so-far has unclosed parens /
		// brackets / braces / strings, treat this line as a continuation
		// and prompt for more.
		if (isIncomplete(candidate)) {
			buffer = candidate + '\n'
			multiline = true
			rl.setPrompt(theme.cont)
			rl.prompt()
			return
		}

		const fullSource = candidate.trim()
		const printedSource = multiline ? candidate : line
		buffer = ''
		multiline = false
		rl.setPrompt(theme.prompt)

		if (fullSource === '') {
			rl.prompt()
			return
		}

		if (fullSource.startsWith(':')) {
			env = handleCommand(fullSource, env, starter, lastSource)
			rl.prompt()
			return
		}

		try {
			const expandedSource = expandTopLevelSugar(fullSource)
			const ast = parse(expandedSource)
			lastSource = fullSource
			const r = evaluate(ast, env)
			// Top-level IO actions are run automatically — that's what
			// `(def ...)` returns, and the user expects the REPL to apply it.
			if (r.value instanceof IOAction) {
				const effectDiagnostics = r.value.run()
				output.write(
					theme.unit('()') +
						' ' +
						theme.hint(`; ${r.value.description}`) +
						'\n'
				)
				for (const d of effectDiagnostics) {
					output.write(formatDiagnostic(d) + '\n')
				}
			} else {
				output.write(formatValue(r.value, env) + '\n')
			}
			for (const d of r.diagnostics) {
				output.write(formatDiagnostic(d) + '\n')
			}
		} catch (e) {
			if (e instanceof ParseError) {
				output.write(formatParseError(printedSource, e) + '\n')
			} else {
				output.write(
					theme.error('  error') +
						theme.hint(' · ') +
						(e instanceof Error ? e.message : String(e)) +
						'\n'
				)
			}
		}
		rl.prompt()
	})

	rl.on('close', () => {
		// `history` is exposed on the readline interface; persist it
		// before exiting so the next session sees these entries.
		saveHistory((rl as unknown as { history: ReadonlyArray<string> }).history)
		output.write('\n' + theme.hint('bye.') + '\n')
	})
}

function handleCommand(
	src: string,
	env: Env,
	starter: Env,
	lastSource: string | null
): Env {
	const rest = src.slice(1).trim()
	const spaceIdx = rest.search(/\s/)
	const head = spaceIdx === -1 ? rest : rest.slice(0, spaceIdx)
	const args = spaceIdx === -1 ? '' : rest.slice(spaceIdx + 1).trim()

	switch (head) {
		case 'quit':
		case 'q':
			process.exit(0)
		// eslint-disable-next-line no-fallthrough
		case 'help':
			output.write(
				[
					theme.header('  Commands'),
					`    ${theme.keyword(':env')}              ${theme.hint('— list current top-level bindings')}`,
					`    ${theme.keyword(':ast')}              ${theme.hint('— print the AST of the previous input')}`,
					`    ${theme.keyword(':type')} ${theme.hint('[expr]')}     ${theme.hint('— infer the type of expr (or the previous input)')}`,
					`    ${theme.keyword(':check')} ${theme.hint('[expr]')}    ${theme.hint('— static type-check expr (or the previous input)')}`,
					`    ${theme.keyword(':expand')} ${theme.hint('[expr]')}   ${theme.hint('— one-step macro expansion')}`,
					`    ${theme.keyword(':doc')} ${theme.hint('<name>')}      ${theme.hint('— show a name\'s type and current value')}`,
					`    ${theme.keyword(':reset')}            ${theme.hint('— restore the starter env')}`,
					`    ${theme.keyword(':help')}             ${theme.hint('— show this help')}`,
					`    ${theme.keyword(':quit')}             ${theme.hint('— exit (or Ctrl-D)')}`,
					'',
					theme.hint('  Tips:'),
					theme.hint('    - multi-line input wraps automatically when brackets are unbalanced.'),
					theme.hint('    - top-level `name = expr` is sugar for `(def "name" expr)`.'),
					'',
				].join('\n')
			)
			return env
		case 'env': {
			const top = env as Frame | null
			if (top === null || !top.bindings) {
				output.write(theme.hint('  (empty env)') + '\n')
				return env
			}
			const names = [...top.bindings.keys()].sort()
			output.write(
				'  ' +
					names.map(n => theme.keyword(n)).join(theme.hint('  ')) +
					'\n'
			)
			return env
		}
		case 'ast':
			if (lastSource === null) {
				output.write(theme.hint('  (no previous input)') + '\n')
				return env
			}
			try {
				const ast = parse(lastSource)
				output.write('  ' + theme.hint(print(ast)) + '\n')
			} catch (e) {
				output.write(
					theme.error('  error') +
						theme.hint(' · ') +
						(e instanceof Error ? e.message : String(e)) +
						'\n'
				)
			}
			return env
		case 'type': {
			const exprSource = args !== '' ? args : lastSource
			if (exprSource === null) {
				output.write(theme.hint('  (no expression to type)') + '\n')
				return env
			}
			try {
				const ast = parse(exprSource)
				const t = infer(ast, env)
				if (t === null) {
					output.write(
						'  ' + theme.hint('? (type unknown)') + '\n'
					)
				} else {
					output.write(
						'  ' +
							theme.hint(':') +
							' ' +
							theme.type(t.typeName) +
							'\n'
					)
				}
			} catch (e) {
				if (e instanceof ParseError) {
					output.write(formatParseError(exprSource, e) + '\n')
				} else {
					output.write(
						theme.error('  error') +
							theme.hint(' · ') +
							(e instanceof Error ? e.message : String(e)) +
							'\n'
					)
				}
			}
			return env
		}
		case 'reset':
			output.write(theme.hint('  (env reset)') + '\n')
			return starter
		case 'doc': {
			if (args === '') {
				output.write(theme.hint('  usage: :doc <name>') + '\n')
				return env
			}
			try {
				const ast = parse(args)
				const t = infer(ast, env)
				const r = evaluate(ast, env)
				const lines: string[] = []
				lines.push(
					theme.keyword(args) +
						' ' +
						theme.hint(':') +
						' ' +
						theme.type(t === null ? '?' : t.typeName)
				)
				lines.push('  ' + theme.hint('=') + ' ' + formatValue(r.value, env))
				output.write(lines.map(l => '  ' + l).join('\n') + '\n')
			} catch (e) {
				if (e instanceof ParseError) {
					output.write(formatParseError(args, e) + '\n')
				} else {
					output.write(
						theme.error('  error') +
							theme.hint(' · ') +
							(e instanceof Error ? e.message : String(e)) +
							'\n'
					)
				}
			}
			return env
		}
		case 'expand': {
			const exprSource = args !== '' ? args : lastSource
			if (exprSource === null) {
				output.write(theme.hint('  (no expression to expand)') + '\n')
				return env
			}
			try {
				const ast = parse(exprSource)
				const ladder = expandLadder(ast, env)
				if (ladder.length === 1) {
					output.write(
						'  ' +
							theme.hint('(no expansion — already a fixed point)') +
							'\n'
					)
				} else {
					for (let i = 0; i < ladder.length; i++) {
						const arrow =
							i === 0 ? theme.hint('  · ') : theme.hint('  → ')
						output.write(arrow + print(ladder[i]!) + '\n')
					}
				}
			} catch (e) {
				if (e instanceof ParseError) {
					output.write(formatParseError(exprSource, e) + '\n')
				} else {
					output.write(
						theme.error('  error') +
							theme.hint(' · ') +
							(e instanceof Error ? e.message : String(e)) +
							'\n'
					)
				}
			}
			return env
		}
		case 'check': {
			const exprSource = args !== '' ? args : lastSource
			if (exprSource === null) {
				output.write(theme.hint('  (no expression to check)') + '\n')
				return env
			}
			try {
				const ast = parse(exprSource)
				const ds = check(ast, env)
				if (ds.length === 0) {
					output.write(
						'  ' + theme.hint('✓ no static type errors') + '\n'
					)
				} else {
					for (const d of ds) {
						output.write(formatDiagnostic(d) + '\n')
					}
				}
			} catch (e) {
				if (e instanceof ParseError) {
					output.write(formatParseError(exprSource, e) + '\n')
				} else {
					output.write(
						theme.error('  error') +
							theme.hint(' · ') +
							(e instanceof Error ? e.message : String(e)) +
							'\n'
					)
				}
			}
			return env
		}
		default:
			output.write(theme.error(`  unknown command: :${head}`) + '\n')
			return env
	}
}

main().catch(e => {
	output.write(
		theme.error('fatal') +
			' · ' +
			(e instanceof Error ? e.message : String(e)) +
			'\n'
	)
	process.exit(1)
})
