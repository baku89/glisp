/**
 * What the REPL does with input, apart from how it is displayed: evaluation,
 * commands, completion, and the view of the environment. Every result is
 * formatted text, so the two-column UI and the plain line mode share it.
 */

import pc from 'picocolors'

import { check } from '../check.js'
import { IO, isGlispClosure, isTypedHostFn, isTypeValue, toAst } from '../eval.js'
import { expandLadder } from '../expand.js'
import { infer } from '../infer.js'
import { lex, LexError } from '../lex.js'
import { parse, ParseError } from '../parse.js'
import { buildPrelude } from '../prelude.js'
import { assignmentExpression, Session } from '../session.js'
import {
	type AST,
	type Diagnostic,
	type Env,
	SpreadAST,
	SymAST,
	UNIT,
} from '../types.js'

export const theme = {
	prompt: pc.cyan('> '),
	continuation: '  ',
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
	caret: pc.red,
	hint: pc.dim,
	header: pc.bold,
	changed: (text: string) => pc.bold(pc.yellow(text)),
}

export const COMMAND_NAMES = [
	':ast',
	':type',
	':check',
	':expand',
	':doc',
	':unset',
	':reset',
	':help',
	':quit',
]

/** The outcome of submitting input. */
export interface Submission {
	/** Formatted output, one entry per block. */
	readonly output: ReadonlyArray<string>
	readonly quit: boolean
}

export class ReplCore {
	readonly session = new Session(buildPrelude())
	private lastSource: string | null = null
	private previousValues = new Map<string, unknown>()
	/** Bindings whose value changed in the last submission. */
	private changed = new Set<string>()
	private lastEvaluatedMs = 0
	private env: string[] = [theme.punct('{}')]

	submit(source: string): Submission {
		const src = source.trim()
		if (src === '') return { output: [], quit: false }
		const start = performance.now()
		this.session.resetStats()
		const submission = src.startsWith(':')
			? this.command(src)
			: { output: this.evaluate(src), quit: false }
		this.refreshEnv()
		this.env = this.formatEnv()
		this.lastEvaluatedMs = performance.now() - start
		return submission
	}

	/**
	 * Whether `source` needs more lines before it can be evaluated. A real
	 * syntax error is complete, so that it gets reported straight away.
	 */
	isIncomplete(source: string): boolean {
		if (source.trim() === '' || source.trimStart().startsWith(':')) return false
		try {
			parse(assignmentExpression(source) ?? source)
			return false
		} catch (e) {
			if (!(e instanceof Error)) return false
			return /unterminated|got eof|unexpected eof/i.test(e.message)
		}
	}

	/** Completions for the end of `line`, and the fragment they replace. */
	complete(line: string): { matches: string[]; partial: string } {
		if (line.startsWith(':') && !/\s/.test(line)) {
			return {
				matches: COMMAND_NAMES.filter(name => name.startsWith(line)),
				partial: line,
			}
		}
		const match = /[^\s()[\]{}"'`~^,;:=./?@0-9][^\s()[\]{}"'`~^,;:=./?@]*$/u.exec(line)
		if (match === null) return { matches: [], partial: '' }
		const partial = match[0]
		return {
			matches: collectEnvNames(this.session.env).filter(name =>
				name.startsWith(partial)
			),
			partial,
		}
	}

	/**
	 * The environment as what it is, a let-block, with each value in a comment
	 * where the source alone does not show it. So what is on screen is valid
	 * Glisp source.
	 */
	envLines(): ReadonlyArray<string> {
		return this.env
	}

	private formatEnv(): string[] {
		const names = this.session.bindings()
		if (names.length === 0) return [theme.punct('{}')]
		const body = names.flatMap((name, i) => {
			const prefix = i === 0 ? theme.punct('{') : ' '
			return this.bindingLines(name).map((line, j) =>
				j === 0 ? prefix + line : `  ${line}`
			)
		})
		return [...body, theme.punct('}')]
	}

	/** Bindings whose value changed in the last submission. */
	changedBindings(): string[] {
		return [...this.changed]
	}

	/** One line about what the last submission cost. */
	status(): string {
		const { computed, hits } = this.session.stats()
		const ms = this.lastEvaluatedMs
		const time = ms < 10 ? ms.toFixed(1) : Math.round(ms).toString()
		return `${computed} computed · ${hits} cached · ${time}ms   ^C quit  PgUp/PgDn log  Alt+↑↓ env  Tab complete`
	}

	private bindingLines(name: string): string[] {
		const ast = this.session.bindingAst(name)!
		const lines = highlight(ast.print()).split('\n')
		const first = `${this.changed.has(name) ? theme.changed(name) : theme.keyword(name)} ${theme.punct('=')} `
		lines[0] = first + lines[0]!
		const note = this.valueNote(name, ast)
		if (note !== null) lines[lines.length - 1] += ` ${note}`
		return lines
	}

	private valueNote(name: string, ast: AST): string | null {
		const result = this.session.evalAst(new SymAST(name))
		if (result.diagnostics.length > 0) {
			return theme.error(`; ! ${result.diagnostics[0]!.message}`)
		}
		if (isSelfEvident(ast)) return null
		const text = `; -> ${toSource(result.value, this.session.env)}`
		return this.changed.has(name) ? theme.changed(text) : theme.hint(text)
	}

	private refreshEnv(): void {
		const values = new Map<string, unknown>()
		this.changed = new Set()
		for (const name of this.session.bindings()) {
			const { value } = this.session.evalAst(new SymAST(name))
			values.set(name, value)
			if (
				this.previousValues.has(name) &&
				!Object.is(this.previousValues.get(name), value)
			) {
				this.changed.add(name)
			}
		}
		this.previousValues = values
	}

	private evaluate(src: string): string[] {
		this.lastSource = src
		try {
			const result = this.session.evalSrc(src)
			if (result.value instanceof IO) {
				// `name = expr` evaluates to an action. A shell runs what it is given.
				const effects = result.value.run()
				return [...result.diagnostics, ...effects].map(formatDiagnostic)
			}
			return [
				formatValue(result.value, this.session.env),
				...result.diagnostics.map(formatDiagnostic),
			]
		} catch (e) {
			return [formatError(e, src)]
		}
	}

	private command(src: string): Submission {
		const rest = src.slice(1).trim()
		const space = rest.search(/\s/)
		const head = space === -1 ? rest : rest.slice(0, space)
		const args = space === -1 ? '' : rest.slice(space + 1).trim()
		const output = (...lines: string[]): Submission => ({
			output: lines,
			quit: false,
		})
		const env = this.session.env

		const onExpression = (
			what: string,
			run: (ast: AST, source: string) => string[]
		): Submission => {
			const source = args !== '' ? args : this.lastSource
			if (source === null) return output(theme.hint(`(no expression to ${what})`))
			try {
				return output(...run(parse(source), source))
			} catch (e) {
				return output(formatError(e, source))
			}
		}

		switch (head) {
			case 'quit':
			case 'q':
				return { output: [], quit: true }
			case 'help':
				return output(helpText())
			case 'ast':
				return onExpression('print', ast => [theme.hint(ast.print())])
			case 'type':
				return onExpression('type', ast => {
					const type = infer(ast, env)
					return [
						type === null
							? theme.hint('? (type unknown)')
							: `${theme.hint(':')} ${theme.type(type.typeName)}`,
					]
				})
			case 'check':
				return onExpression('check', ast => {
					const diagnostics = check(ast, env)
					return diagnostics.length === 0
						? [theme.hint('✓ no static type errors')]
						: diagnostics.map(formatDiagnostic)
				})
			case 'expand':
				return onExpression('expand', ast => {
					const ladder = expandLadder(ast, env)
					if (ladder.length === 1) {
						return [theme.hint('(no expansion — already a fixed point)')]
					}
					return [
						ladder
							.map(
								(rung, i) =>
									`${theme.hint(i === 0 ? '· ' : '-> ')}${highlight(rung.print())}`
							)
							.join('\n'),
					]
				})
			case 'doc': {
				if (args === '') return output(theme.hint('usage: :doc <name>'))
				try {
					const ast = parse(args)
					const type = infer(ast, env)
					const result = this.session.evalAst(ast)
					const doc = lookupDoc(args, env)
					const lines = [
						`${theme.keyword(args)} ${theme.hint(':')} ${theme.type(type === null ? '?' : type.typeName)}`,
					]
					if (doc !== null) lines.push(`  ${theme.hint(doc)}`)
					lines.push(`  ${theme.hint('=')} ${formatValue(result.value, env)}`)
					return output(lines.join('\n'))
				} catch (e) {
					return output(formatError(e, args))
				}
			}
			case 'unset':
				if (args === '') return output(theme.hint('usage: :unset <name>'))
				return this.session.unsetBinding(args)
					? output()
					: output(theme.warning(`no such binding: ${args}`))
			case 'reset':
				this.session.reset()
				return output()
			default:
				return output(theme.error(`unknown command: :${head}`))
		}
	}
}

/** Color source text by its tokens. Text that does not lex stays as it is. */
export function highlight(source: string): string {
	let tokens
	try {
		tokens = lex(source)
	} catch {
		return source
	}
	let out = ''
	let position = 0
	for (const token of tokens) {
		if (token.kind === 'eof') break
		out += source.slice(position, token.start)
		const text = source.slice(token.start, token.end)
		out += colorFor(token.kind)(text)
		position = token.end
	}
	return out + source.slice(position)
}

function colorFor(kind: string): (text: string) => string {
	switch (kind) {
		case 'number':
			return theme.number
		case 'string':
			return theme.string
		case 'boolean':
			return theme.boolean
		case '()':
			return theme.unit
		case 'identifier':
			return (text: string) => text
		case 'pathSegments':
			return theme.type
		case '_':
		case '!':
			return theme.type
		default:
			return theme.punct
	}
}

function isSelfEvident(ast: AST): boolean {
	const inner = ast.kind === 'meta' ? ast.expr : ast
	return inner.kind === 'lit' || inner.kind === 'fn'
}

function toSource(value: unknown, env: Env): string {
	if (value instanceof IO) return `<IO ${value.description}>`
	if (
		typeof value === 'function' &&
		!isTypedHostFn(value) &&
		!isTypeValue(value) &&
		!isGlispClosure(value)
	) {
		const ast = toAst(value, env)
		return ast.kind === 'sym' ? ast.name : '<host-fn>'
	}
	return toAst(value, env).print()
}

/**
 * Render a value as Glisp source whose evaluation reproduces it. `IO` is the
 * one exception: an action has no expression that re-creates it.
 */
function formatValue(value: unknown, env: Env): string {
	if (value instanceof IO) return theme.type(`<IO ${value.description}>`)
	if (value === UNIT) return theme.unit('()')
	if (
		typeof value === 'function' &&
		!isTypedHostFn(value) &&
		!isTypeValue(value) &&
		!isGlispClosure(value)
	) {
		const ast = toAst(value, env)
		return ast.kind === 'sym' ? theme.keyword(ast.name) : theme.hostfn('<host-fn>')
	}
	return formatAst(toAst(value, env))
}

function formatAst(ast: AST): string {
	switch (ast.kind) {
		case 'lit': {
			const value = ast.value
			if (value === UNIT) return theme.unit('()')
			if (typeof value === 'string') return theme.string(JSON.stringify(value))
			if (typeof value === 'number') return theme.number(String(value))
			if (typeof value === 'boolean') return theme.boolean(String(value))
			return ast.print()
		}
		case 'sym':
			return theme.keyword(ast.name)
		case 'vec':
			return (
				theme.punct('[') +
				ast.elements.map(formatAst).join(' ') +
				theme.punct(']')
			)
		case 'record':
			return (
				theme.punct('{') +
				ast.fields
					.map(entry =>
						entry instanceof SpreadAST
							? theme.punct('...') + formatAst(entry.expr)
							: `${theme.keyword(entry[0])}${theme.punct(':')} ${formatAst(entry[1])}`
					)
					.join(' ') +
				theme.punct('}')
			)
		case 'fn':
			return theme.closure(ast.print())
		default:
			return ast.print()
	}
}

function formatDiagnostic(d: Diagnostic): string {
	const tag =
		d.level === 'error'
			? theme.error('error')
			: d.level === 'warning'
				? theme.warning('warn')
				: theme.info('info')
	const header = `${tag} ${theme.hint('·')} ${d.message}`
	const range = d.source.ast.source
	if (range === undefined) return header
	return [header, ...sourceExcerpt(range.text, range.start, range.end)].join('\n')
}

function formatError(e: unknown, source: string): string {
	if (e instanceof ParseError || e instanceof LexError) {
		return [
			`${theme.error('syntax error')} ${theme.hint('·')} ${e.message}`,
			...sourceExcerpt(source, e.position, e.position + 1),
		].join('\n')
	}
	return `${theme.error('error')} ${theme.hint('·')} ${e instanceof Error ? e.message : String(e)}`
}

/** The source line holding `start`, then an underline of the range on it. */
function sourceExcerpt(text: string, start: number, end: number): string[] {
	if (start < 0 || start > text.length) return []
	const lineStart = text.lastIndexOf('\n', start - 1) + 1
	const newline = text.indexOf('\n', start)
	const lineEnd = newline === -1 ? text.length : newline
	const lineNumber = text.slice(0, lineStart).split('\n').length
	const gutter = `${lineNumber} | `
	const span = Math.max(1, Math.min(end, lineEnd) - start)
	return [
		theme.hint(gutter) + text.slice(lineStart, lineEnd),
		' '.repeat(gutter.length + (start - lineStart)) +
			theme.caret(`^${'~'.repeat(span - 1)}`),
	]
}

function collectEnvNames(env: Env): string[] {
	const names = new Set<string>()
	for (let frame = env; frame !== null; frame = frame.parent) {
		if (frame.bindings) {
			for (const name of frame.bindings.keys()) names.add(name)
		}
	}
	return [...names].sort()
}

/** A name's `^{doc: "..."}`, or null if it is unbound or has none. */
function lookupDoc(name: string, env: Env): string | null {
	for (let frame = env; frame !== null; frame = frame.parent) {
		const target = frame.bindings?.get(name)
		if (target === undefined) continue
		if (target.ast.kind !== 'meta') return null
		const entry = target.ast.metadata.get('doc')
		return entry?.kind === 'lit' && typeof entry.value === 'string'
			? entry.value
			: null
	}
	return null
}

function helpText(): string {
	const row = (name: string, args: string, description: string): string =>
		`  ${theme.keyword(name)}${args === '' ? '' : ` ${theme.hint(args)}`}  ${theme.hint(description)}`
	return [
		theme.header('Commands'),
		row(':ast', '[expr]', 'print the AST'),
		row(':type', '[expr]', 'infer the type'),
		row(':check', '[expr]', 'static check'),
		row(':expand', '[expr]', 'show the abstraction ladder'),
		row(':doc', '<name>', "show a name's type, doc and value"),
		row(':unset', '<name>', 'remove a binding'),
		row(':reset', '', 'empty the environment'),
		row(':quit', '', 'exit (or Ctrl-C)'),
		'',
		theme.hint('`name = expr` sets a binding in the environment.'),
		theme.hint('`name/seg = expr` edits inside one, by path.'),
		theme.hint('Unbalanced brackets continue on the next line; Alt+Enter adds one.'),
	].join('\n')
}
