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

import { stdin as input, stdout as output } from 'node:process'
import { createInterface } from 'node:readline/promises'

import pc from 'picocolors'

import { evaluate, GlispClosure, IOAction, isTypeValue } from './eval.js'
import { infer } from './infer.js'
import { lex } from './lex.js'
import { parse, ParseError } from './parse.js'
import { buildPrelude } from './prelude.js'
import { print } from './print.js'
import { type Diagnostic, type Env, type Frame, UNIT } from './types.js'

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

function formatValue(v: unknown): string {
	if (v === UNIT) return theme.unit('()')
	if (v === null) return theme.unit('null')
	if (v === undefined) return theme.unit('undefined')
	if (typeof v === 'string') return theme.string(JSON.stringify(v))
	if (typeof v === 'number') return theme.number(String(v))
	if (typeof v === 'boolean') return theme.boolean(String(v))
	if (isTypeValue(v)) return theme.type(v.typeName)
	if (v instanceof IOAction) return theme.type(`<IO ${v.description}>`)
	if (v instanceof GlispClosure)
		return theme.closure(`<closure ${print(v.ast)}>`)
	if (typeof v === 'function') return theme.hostfn('<host-fn>')
	if (Array.isArray(v)) {
		return (
			theme.punct('[') +
			v.map(formatValue).join(' ') +
			theme.punct(']')
		)
	}
	if (typeof v === 'object') {
		const entries = Object.entries(v as Record<string, unknown>).map(
			([k, x]) => `${theme.keyword(k)}${theme.punct(':')} ${formatValue(x)}`
		)
		return theme.punct('{') + entries.join(' ') + theme.punct('}')
	}
	return String(v)
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
	return `  ${tag} ${theme.hint('·')} ${d.message}`
}

function formatParseError(src: string, e: ParseError): string {
	const lines: string[] = []
	lines.push(theme.syntaxError('  syntax error') + theme.hint(' · ') + e.message)

	// caret on the offending position
	const lineInfo = lineAt(src, e.position)
	if (lineInfo !== null) {
		const { line, col, content } = lineInfo
		lines.push(theme.hint(`  ${line + 1} | `) + content)
		const caretIndent = ' '.repeat(`  ${line + 1} | `.length + col)
		lines.push(caretIndent + theme.caret('^'))
	}
	return lines.join('\n')
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
// REPL loop
// -----------------------------------------------------------------------------

async function main(): Promise<void> {
	const starter = buildPrelude()
	let env: Env = starter
	let lastSource: string | null = null

	const rl = createInterface({ input, output, prompt: theme.prompt })

	output.write(welcome())
	rl.prompt()

	let buffer = ''
	let multiline = false

	rl.on('line', line => {
		// trailing backslash → continuation
		if (line.endsWith('\\')) {
			buffer += line.slice(0, -1) + '\n'
			multiline = true
			rl.setPrompt(theme.cont)
			rl.prompt()
			return
		}
		const fullSource = (buffer + line).trim()
		const printedSource = multiline ? buffer + line : line
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
				output.write(formatValue(r.value) + '\n')
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
					`    ${theme.keyword(':reset')}            ${theme.hint('— restore the starter env')}`,
					`    ${theme.keyword(':help')}             ${theme.hint('— show this help')}`,
					`    ${theme.keyword(':quit')}             ${theme.hint('— exit (or Ctrl-D)')}`,
					'',
					theme.hint('  Tip: end a line with `\\` to continue on the next.'),
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
