/**
 * The two-column REPL on a real terminal: keys in, frames out. Everything worth
 * testing lives in `core.ts`, `editor.ts`, and `screen.ts`.
 */

import { emitKeypressEvents } from 'node:readline'

import { highlight, type ReplCore, theme } from './core.js'
import { LineEditor } from './editor.js'
import { type Frame, renderFrame } from './screen.js'

const ENTER_SCREEN = '\x1b[?1049h\x1b[?2004h'
const LEAVE_SCREEN = '\x1b[?2004l\x1b[?1049l\x1b[?25h'

interface Key {
	readonly name?: string
	readonly sequence?: string
	readonly ctrl?: boolean
	readonly meta?: boolean
	readonly shift?: boolean
}

export interface TuiOptions {
	readonly history: ReadonlyArray<string>
	readonly onExit: (history: ReadonlyArray<string>) => void
}

export function runTui(core: ReplCore, options: TuiOptions): void {
	const { stdin, stdout } = process
	const editor = new LineEditor(options.history)
	const log: string[] = [
		theme.hint('Type an expression, `name = expr`, or :help.'),
	]
	let logScroll = 0
	let envScroll = 0
	let pasting = false
	let previousRows: ReadonlyArray<string> = []
	let lastFrame: Frame | null = null
	let closed = false

	const restore = (): void => {
		if (closed) return
		closed = true
		stdout.write(LEAVE_SCREEN)
		if (stdin.isTTY) stdin.setRawMode(false)
	}

	const exit = (): void => {
		restore()
		options.onExit(editor.entries)
		process.exit(0)
	}

	const draw = (): void => {
		const frame = renderFrame(
			{
				log,
				logScroll,
				env: core.envLines(),
				envScroll,
				prompt: theme.prompt,
				continuationPrompt: theme.continuation,
				input: highlight(editor.text),
				inputPlain: editor.text,
				inputCursor: editor.cursor,
				status: core.status(),
			},
			stdout.columns || 80,
			stdout.rows || 24
		)
		lastFrame = frame
		logScroll = Math.min(logScroll, frame.maxLogScroll)
		envScroll = Math.min(envScroll, frame.maxEnvScroll)
		let out = '\x1b[?25l'
		frame.rows.forEach((row, i) => {
			if (row !== previousRows[i]) out += `\x1b[${i + 1};1H${row}\x1b[K`
		})
		out += `\x1b[${frame.cursor.row + 1};${frame.cursor.col + 1}H\x1b[?25h`
		previousRows = frame.rows
		stdout.write(out)
	}

	const submit = (): void => {
		const text = editor.text
		if (text.endsWith('\\')) {
			editor.set(`${text.slice(0, -1)}\n`)
			return
		}
		if (core.isIncomplete(text)) {
			editor.insert('\n')
			return
		}
		editor.commit()
		if (text.trim() === '') return
		const lines = text.split('\n')
		log.push(highlightInput(lines))
		const submission = core.submit(text)
		log.push(...submission.output)
		logScroll = 0
		if (submission.quit) exit()
	}

	const complete = (): void => {
		const before = editor.text.slice(0, editor.cursor)
		const { matches, partial } = core.complete(before)
		if (matches.length === 0) return
		const common = commonPrefix(matches)
		if (common.length > partial.length) {
			editor.insert(common.slice(partial.length))
		} else if (matches.length > 1) {
			log.push(theme.hint(matches.join('  ')))
			logScroll = 0
		}
	}

	const pageRows = (): number => Math.max((stdout.rows || 24) - 4, 1)

	const onKey = (text: string | undefined, key: Key): void => {
		if (key.name === 'paste-start') {
			pasting = true
			return
		}
		if (key.name === 'paste-end') {
			pasting = false
			return
		}
		if (pasting) {
			if (key.name === 'return' || key.name === 'enter') editor.insert('\n')
			else if (text !== undefined) editor.insert(text)
			return
		}

		if (key.ctrl) {
			switch (key.name) {
				case 'c':
					editor.clear()
					return
				case 'd':
					if (editor.text === '') exit()
					else editor.delete()
					return
				case 'a':
					return editor.lineStart()
				case 'e':
					return editor.lineEnd()
				case 'b':
					return editor.left()
				case 'f':
					return editor.right()
				case 'k':
					return editor.killToLineEnd()
				case 'u':
					return editor.killToLineStart()
				case 'w':
					return editor.killWord()
				case 'p':
					return editor.up()
				case 'n':
					return editor.down()
				case 'l':
					previousRows = []
					return
				case 'left':
					return editor.wordLeft()
				case 'right':
					return editor.wordRight()
			}
			return
		}

		if (key.meta) {
			switch (key.name) {
				case 'return':
				case 'enter':
					return editor.insert('\n')
				case 'up':
					envScroll = Math.max(envScroll - 1, 0)
					return
				case 'down':
					envScroll = Math.min(envScroll + 1, lastFrame?.maxEnvScroll ?? 0)
					return
				case 'left':
				case 'b':
					return editor.wordLeft()
				case 'right':
				case 'f':
					return editor.wordRight()
				case 'backspace':
					return editor.killWord()
			}
			return
		}

		switch (key.name) {
			case 'return':
			case 'enter':
				return submit()
			case 'tab':
				return complete()
			case 'backspace':
				return editor.backspace()
			case 'delete':
				return editor.delete()
			case 'left':
				return editor.left()
			case 'right':
				return editor.right()
			case 'up':
				return editor.up()
			case 'down':
				return editor.down()
			case 'home':
				return editor.lineStart()
			case 'end':
				return editor.lineEnd()
			case 'pageup':
				logScroll = Math.min(
					logScroll + pageRows(),
					lastFrame?.maxLogScroll ?? 0
				)
				return
			case 'pagedown':
				logScroll = Math.max(logScroll - pageRows(), 0)
				return
		}
		if (text !== undefined && !isControl(text)) editor.insert(text)
	}

	stdout.write(ENTER_SCREEN)
	process.on('exit', restore)
	process.on('SIGTERM', exit)
	process.on('SIGHUP', exit)
	emitKeypressEvents(stdin)
	stdin.setRawMode(true)
	stdin.resume()
	stdin.on('keypress', (text: string | undefined, key: Key) => {
		try {
			onKey(text, key)
		} catch (e) {
			log.push(theme.error(e instanceof Error ? e.message : String(e)))
		}
		draw()
	})
	stdin.on('end', exit)
	stdout.on('resize', () => {
		previousRows = []
		stdout.write('\x1b[2J')
		draw()
	})
	draw()
}

function highlightInput(lines: ReadonlyArray<string>): string {
	return highlight(lines.join('\n'))
		.split('\n')
		.map((line, i) => (i === 0 ? theme.prompt : theme.continuation) + line)
		.join('\n')
}

function isControl(text: string): boolean {
	const code = text.codePointAt(0)
	return code === undefined || code < 32 || code === 0x7f
}

function commonPrefix(items: ReadonlyArray<string>): string {
	let prefix = items[0] ?? ''
	for (const item of items) {
		while (!item.startsWith(prefix)) prefix = prefix.slice(0, -1)
	}
	return prefix
}
