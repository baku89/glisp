/**
 * Minimal interactive REPL for trying out the language.
 *
 * Run with `npm run repl`.
 *
 * Each line is parsed and evaluated against a small starter env containing
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

import { lit } from './build.js'
import { evaluate, GlispClosure, makeTopLevel } from './eval.js'
import { parse, ParseError } from './parse.js'
import { print } from './print.js'
import { type AST, type Env, type Frame, UNIT } from './types.js'

// -----------------------------------------------------------------------------
// Starter env — a tiny prelude of host-bound JS functions
// -----------------------------------------------------------------------------

function buildStarterEnv(): Env {
	const num2 = (op: (a: number, b: number) => number) =>
		((a: unknown, b: unknown) =>
			op(a as number, b as number)) as unknown as never
	const cmp2 = (op: (a: number, b: number) => boolean) =>
		((a: unknown, b: unknown) =>
			op(a as number, b as number)) as unknown as never

	const bindings: Record<string, AST> = {
		'+': lit(num2((a, b) => a + b)),
		'-': lit(num2((a, b) => a - b)),
		'*': lit(num2((a, b) => a * b)),
		'/': lit(num2((a, b) => a / b)),
		'<': lit(cmp2((a, b) => a < b)),
		'>': lit(cmp2((a, b) => a > b)),
		'<=': lit(cmp2((a, b) => a <= b)),
		'>=': lit(cmp2((a, b) => a >= b)),
		'==': lit(((a: unknown, b: unknown) => a === b) as unknown as never),
		'!=': lit(((a: unknown, b: unknown) => a !== b) as unknown as never),
		not: lit(((a: unknown) => !a) as unknown as never),
		identity: lit(((a: unknown) => a) as unknown as never),
		first: lit(
			((xs: unknown) =>
				Array.isArray(xs) ? xs[0] : UNIT) as unknown as never
		),
		last: lit(
			((xs: unknown) =>
				Array.isArray(xs) ? xs[xs.length - 1] : UNIT) as unknown as never
		),
		count: lit(
			((xs: unknown) =>
				Array.isArray(xs) ? xs.length : 0) as unknown as never
		),
	}
	return makeTopLevel(bindings)
}

// -----------------------------------------------------------------------------
// Pretty-print a result value
// -----------------------------------------------------------------------------

function formatValue(v: unknown): string {
	if (v === UNIT) return '()'
	if (v === null) return 'null'
	if (v === undefined) return 'undefined'
	if (typeof v === 'string') return JSON.stringify(v)
	if (typeof v === 'number' || typeof v === 'boolean') return String(v)
	if (typeof v === 'function') return '<host-fn>'
	if (v instanceof GlispClosure) return `<closure ${print(v.ast)}>`
	if (Array.isArray(v)) return `[${v.map(formatValue).join(' ')}]`
	if (typeof v === 'object') {
		const entries = Object.entries(v as Record<string, unknown>).map(
			([k, x]) => `${k}: ${formatValue(x)}`
		)
		return `{${entries.join(' ')}}`
	}
	return String(v)
}

// -----------------------------------------------------------------------------
// REPL loop
// -----------------------------------------------------------------------------

async function main(): Promise<void> {
	const starter = buildStarterEnv()
	let env: Env = starter
	let lastSource: string | null = null

	const rl = createInterface({ input, output, prompt: 'glisp> ' })

	output.write('Glisp REPL — type an expression (or :help for commands).\n')
	rl.prompt()

	let buffer = ''

	rl.on('line', line => {
		// Multi-line continuation via trailing backslash.
		if (line.endsWith('\\')) {
			buffer += line.slice(0, -1) + '\n'
			rl.setPrompt('     | ')
			rl.prompt()
			return
		}
		const src = (buffer + line).trim()
		buffer = ''
		rl.setPrompt('glisp> ')

		if (src === '') {
			rl.prompt()
			return
		}

		if (src.startsWith(':')) {
			env = handleCommand(src, env, starter, lastSource)
			rl.prompt()
			return
		}

		try {
			const ast = parse(src)
			lastSource = src
			const r = evaluate(ast, env)
			output.write(formatValue(r.value) + '\n')
			for (const d of r.diagnostics) {
				output.write(`  ${d.level}: ${d.message}\n`)
			}
		} catch (e) {
			if (e instanceof ParseError) {
				output.write(`parse error: ${e.message}\n`)
				output.write(`  at offset ${e.position}\n`)
			} else {
				output.write(
					`error: ${e instanceof Error ? e.message : String(e)}\n`
				)
			}
		}
		rl.prompt()
	})

	rl.on('close', () => {
		output.write('\nbye.\n')
	})
}

function handleCommand(
	src: string,
	env: Env,
	starter: Env,
	lastSource: string | null
): Env {
	const cmd = src.slice(1).trim()
	switch (cmd) {
		case 'quit':
		case 'q':
			process.exit(0)
		// eslint-disable-next-line no-fallthrough
		case 'help':
			output.write(
				[
					'Commands:',
					'  :env    — list current top-level bindings',
					'  :ast    — print the AST of the previous input',
					'  :reset  — restore the starter env',
					'  :help   — show this help',
					'  :quit   — exit (or Ctrl-D)',
					'',
					'Use a trailing backslash for multi-line input.',
				].join('\n') + '\n'
			)
			return env
		case 'env': {
			const top = env as Frame | null
			if (top === null || !top.bindings) {
				output.write('(empty env)\n')
				return env
			}
			const names = [...top.bindings.keys()].sort()
			output.write(names.join('  ') + '\n')
			return env
		}
		case 'ast':
			if (lastSource === null) {
				output.write('(no previous input)\n')
				return env
			}
			try {
				const ast = parse(lastSource)
				output.write(print(ast) + '\n')
			} catch (e) {
				output.write(
					`error: ${e instanceof Error ? e.message : String(e)}\n`
				)
			}
			return env
		case 'reset':
			output.write('(env reset)\n')
			return starter
		default:
			output.write(`unknown command: :${cmd}\n`)
			return env
	}
}

main().catch(e => {
	output.write(`fatal: ${e instanceof Error ? e.message : String(e)}\n`)
	process.exit(1)
})
