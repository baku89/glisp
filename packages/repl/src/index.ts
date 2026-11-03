/**
 * Interactive REPL. Run with `npm run repl`.
 *
 * On a terminal it is two columns: input and results on the left, and on the
 * right the environment, always visible as the let-block it is. When input is
 * piped, it reads lines and prints results.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { stdin as input, stdout as output } from 'node:process'
import { createInterface } from 'node:readline'

import { ReplCore } from './core.js'
import { runTui } from './tui.js'

const HISTORY_PATH = join(homedir(), '.glisp', 'history')
const HISTORY_LIMIT = 1000
/** Stands in for a newline, since the history file has one entry per line. */
const NEWLINE_MARK = '␤'

function loadHistory(): string[] {
	if (!existsSync(HISTORY_PATH)) return []
	try {
		return readFileSync(HISTORY_PATH, 'utf8')
			.split('\n')
			.filter(line => line !== '')
			.slice(-HISTORY_LIMIT)
			.map(line => line.replaceAll(NEWLINE_MARK, '\n'))
	} catch {
		return []
	}
}

function saveHistory(entries: ReadonlyArray<string>): void {
	try {
		mkdirSync(join(homedir(), '.glisp'), { recursive: true })
		const lines = entries
			.slice(-HISTORY_LIMIT)
			.map(entry => entry.replaceAll('\n', NEWLINE_MARK))
		writeFileSync(HISTORY_PATH, `${lines.join('\n')}\n`)
	} catch {
		// Best effort: history never gets to crash the REPL.
	}
}

function runLineMode(core: ReplCore): void {
	const lines = createInterface({ input })
	let buffer = ''
	lines.on('line', line => {
		const source = buffer + line
		if (core.isIncomplete(source)) {
			buffer = `${source}\n`
			return
		}
		buffer = ''
		const submission = core.submit(source)
		for (const block of submission.output) output.write(`${block}\n`)
		if (submission.quit) process.exit(0)
	})
}

const core = new ReplCore()
if (input.isTTY && output.isTTY) {
	runTui(core, { history: loadHistory(), onExit: saveHistory })
} else {
	runLineMode(core)
}
