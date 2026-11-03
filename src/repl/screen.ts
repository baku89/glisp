/**
 * Layout of the two-column REPL as plain data: given the state and the size of
 * the terminal, which text goes on which row and where the cursor sits. Writing
 * it to the terminal is `tui.ts`'s job.
 */

import pc from 'picocolors'

import { cursorCell, fit, visibleWidth, wrap } from './ansi.js'

export interface ScreenState {
	/** Log entries, oldest first. An entry may span several lines. */
	readonly log: ReadonlyArray<string>
	/** Rows scrolled up from the newest log line. */
	readonly logScroll: number
	/** Environment lines, as already formatted. */
	readonly env: ReadonlyArray<string>
	/** Rows scrolled down from the top of the environment. */
	readonly envScroll: number
	readonly prompt: string
	readonly continuationPrompt: string
	/** The input with colors, line for line the same text as `inputPlain`. */
	readonly input: string
	readonly inputPlain: string
	readonly inputCursor: number
	readonly status: string
}

export interface Frame {
	readonly rows: ReadonlyArray<string>
	readonly cursor: {
		readonly row: number
		readonly col: number
		/** False when scrolled back past the input. */
		readonly visible: boolean
	}
	/** The most that `logScroll` can usefully be right now. */
	readonly maxLogScroll: number
	/** The most that `envScroll` can usefully be right now. */
	readonly maxEnvScroll: number
}

/** Below this width the columns stack: the environment goes on top. */
const MIN_SIDE_BY_SIDE = 64

const ENV_TITLE = 'Env'
const REPL_TITLE = 'REPL'

export function renderFrame(
	state: ScreenState,
	cols: number,
	rows: number
): Frame {
	const bodyRows = Math.max(rows - 1, 1)
	const status = fit(pc.dim(state.status), cols)
	const frame =
		cols >= MIN_SIDE_BY_SIDE
			? sideBySide(state, cols, bodyRows)
			: stacked(state, cols, bodyRows)
	return {
		...frame,
		rows: [...frame.rows, status].slice(0, rows),
		cursor: {
			...frame.cursor,
			row: Math.max(Math.min(frame.cursor.row, rows - 1), 0),
		},
	}
}

function sideBySide(
	state: ScreenState,
	cols: number,
	rows: number
): Omit<Frame, 'rows'> & { rows: string[] } {
	const envWidth = Math.floor(cols * 0.4)
	const replWidth = cols - envWidth - 1
	const repl = replPane(state, replWidth, rows)
	const env = envPane(state, envWidth, rows)
	const separator = pc.dim('│')
	return {
		rows: repl.rows.map((row, i) => `${row}${separator}${env.rows[i]!}`),
		cursor: repl.cursor,
		maxLogScroll: repl.maxLogScroll,
		maxEnvScroll: env.maxEnvScroll,
	}
}

function stacked(
	state: ScreenState,
	cols: number,
	rows: number
): Omit<Frame, 'rows'> & { rows: string[] } {
	const envRows = Math.max(Math.min(Math.floor(rows / 3), rows - 2), 1)
	const env = envPane(state, cols, envRows)
	const repl = replPane(state, cols, rows - envRows)
	return {
		rows: [...env.rows, ...repl.rows],
		cursor: { ...repl.cursor, row: repl.cursor.row + envRows },
		maxLogScroll: repl.maxLogScroll,
		maxEnvScroll: env.maxEnvScroll,
	}
}

/**
 * Like a console: the log runs from the top, the input follows right after it,
 * and once that outgrows the pane the top scrolls away. Scrolling back moves
 * the view up through the log, past the input.
 */
function replPane(state: ScreenState, width: number, rows: number) {
	const body = Math.max(rows - 1, 0)
	const logLines = state.log.flatMap(entry => wrap(entry, width))
	const input = inputLines(state, width)
	const lines = [...logLines, ...input]
	const inputCursor = cursorInInput(state, width)
	const cursorRow = logLines.length + inputCursor.row

	const maxLogScroll = Math.max(lines.length - body, 0)
	const scroll = Math.min(state.logScroll, maxLogScroll)
	// Input taller than the pane: keep the line being edited in view.
	const newestEnd = Math.max(lines.length - scroll, 0)
	const end =
		scroll === 0 ? Math.min(newestEnd, cursorRow + body) : newestEnd
	const start = Math.max(end - body, 0)
	const shown = lines.slice(start, end)

	const filler = new Array<string>(Math.max(body - shown.length, 0)).fill('')
	const paneRows = [
		titleRow(REPL_TITLE, width, scroll > 0 ? `↓${scroll}` : ''),
		...shown,
		...filler,
	].slice(0, rows)
	return {
		rows: paneRows.map(line => fit(line, width)),
		cursor: {
			row: Math.min(1 + cursorRow - start, Math.max(rows - 1, 0)),
			col: Math.min(inputCursor.col, width - 1),
			visible: cursorRow >= start && cursorRow < end,
		},
		maxLogScroll,
	}
}

function envPane(state: ScreenState, width: number, rows: number) {
	const body = rows - 1
	const lines = state.env.flatMap(line => wrap(line, width))
	const maxEnvScroll = Math.max(lines.length - body, 0)
	const scroll = Math.min(state.envScroll, maxEnvScroll)
	const shown = lines.slice(scroll, scroll + body)
	const hiddenBelow = lines.length - (scroll + shown.length)
	const hint =
		scroll > 0 || hiddenBelow > 0
			? `${scroll > 0 ? `↑${scroll} ` : ''}${hiddenBelow > 0 ? `↓${hiddenBelow}` : ''}`
			: ''
	const padded = [...shown, ...new Array<string>(Math.max(body - shown.length, 0)).fill('')]
	return {
		rows: [titleRow(ENV_TITLE, width, hint), ...padded]
			.slice(0, rows)
			.map(line => fit(line, width)),
		maxEnvScroll,
	}
}

function titleRow(title: string, width: number, right = ''): string {
	const gap = Math.max(width - visibleWidth(title) - visibleWidth(right), 1)
	return pc.bold(title) + ' '.repeat(gap) + pc.dim(right)
}

/** The prompt on the first line, and a continuation prompt on the rest. */
function inputLines(state: ScreenState, width: number): string[] {
	return state.input
		.split('\n')
		.flatMap((line, i) =>
			wrap(promptFor(state, i) + line, width)
		)
}

function promptFor(state: ScreenState, lineIndex: number): string {
	return lineIndex === 0 ? state.prompt : state.continuationPrompt
}

function cursorInInput(
	state: ScreenState,
	width: number
): { row: number; col: number } {
	const before = state.inputPlain.slice(0, state.inputCursor)
	const lineIndex = before.split('\n').length - 1
	let row = 0
	const lines = state.inputPlain.split('\n')
	for (let i = 0; i < lineIndex; i++) {
		row += wrap(promptFor(state, i) + lines[i]!, width).length
	}
	const lineStart = before.lastIndexOf('\n') + 1
	const prompt = visibleWidth(promptFor(state, lineIndex))
	const within = cursorCell(
		lines[lineIndex]!,
		state.inputCursor - lineStart,
		width,
		prompt
	)
	return { row: row + within.row, col: within.col }
}
