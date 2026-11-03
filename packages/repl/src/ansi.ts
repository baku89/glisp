/**
 * Terminal text measuring and wrapping, aware of ANSI colors and of wide
 * characters such as Japanese.
 */

const SGR = /\x1b\[[0-9;]*m/y

/** Cells a code point takes up in a terminal. */
export function charWidth(codePoint: number): number {
	if (codePoint < 32 || (codePoint >= 0x7f && codePoint < 0xa0)) return 0
	if (
		(codePoint >= 0x300 && codePoint <= 0x36f) ||
		(codePoint >= 0x200b && codePoint <= 0x200f) ||
		(codePoint >= 0xfe00 && codePoint <= 0xfe0f)
	) {
		return 0
	}
	const wide =
		(codePoint >= 0x1100 && codePoint <= 0x115f) ||
		(codePoint >= 0x2e80 && codePoint <= 0x303e) ||
		(codePoint >= 0x3041 && codePoint <= 0x33ff) ||
		(codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
		(codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
		(codePoint >= 0xa000 && codePoint <= 0xa4cf) ||
		(codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
		(codePoint >= 0xf900 && codePoint <= 0xfaff) ||
		(codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
		(codePoint >= 0xff00 && codePoint <= 0xff60) ||
		(codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
		(codePoint >= 0x1f300 && codePoint <= 0x1faff) ||
		(codePoint >= 0x20000 && codePoint <= 0x3fffd)
	return wide ? 2 : 1
}

/** Cells `text` takes up, ignoring color codes. */
export function visibleWidth(text: string): number {
	let width = 0
	forEachPart(text, {
		sgr: () => {},
		char: (_char, cells) => {
			width += cells
		},
	})
	return width
}

export function stripAnsi(text: string): string {
	let plain = ''
	forEachPart(text, {
		sgr: () => {},
		char: char => {
			plain += char
		},
	})
	return plain
}

/** Pad with spaces, or cut, to exactly `width` cells. */
export function fit(text: string, width: number): string {
	const [first = ''] = wrap(text, Math.max(width, 1))
	const cut = width <= 0 ? '' : first
	return cut + ' '.repeat(Math.max(0, width - visibleWidth(cut)))
}

/**
 * Break `text` into lines of at most `width` cells, at character boundaries.
 * `\n` starts a new line. Colors continue across a break, and every line ends
 * with its colors reset, so lines can be drawn independently.
 */
export function wrap(text: string, width: number): string[] {
	const lines: string[] = []
	let active: string[] = []
	let line = ''
	let cells = 0
	const finish = (): void => {
		lines.push(active.length > 0 ? `${line}\x1b[0m` : line)
		line = active.join('')
		cells = 0
	}
	forEachPart(text, {
		sgr: code => {
			line += code
			active = nextActive(active, code)
		},
		char: (char, charCells) => {
			if (char === '\n') {
				finish()
				return
			}
			if (cells + charCells > width && cells > 0) finish()
			line += char
			cells += charCells
		},
	})
	finish()
	return lines
}

/**
 * Where offset `offset` of plain `text` lands when wrapped to `width` cells
 * with the first line starting at `startCell`. Matches `wrap`.
 */
export function cursorCell(
	text: string,
	offset: number,
	width: number,
	startCell = 0
): { row: number; col: number } {
	let row = 0
	let col = startCell
	let index = 0
	for (const char of text) {
		if (index >= offset) break
		index += char.length
		if (char === '\n') {
			row++
			col = 0
			continue
		}
		const cells = charWidth(char.codePointAt(0)!)
		if (col + cells > width && col > 0) {
			row++
			col = 0
		}
		col += cells
	}
	// The next character, if it does not fit, is drawn on the next line.
	const next = text.slice(offset).codePointAt(0)
	const nextCells =
		next === undefined || next === 10 ? 1 : Math.max(charWidth(next), 1)
	if (col + nextCells > width && col > 0) {
		row++
		col = 0
	}
	return { row, col }
}

function forEachPart(
	text: string,
	on: {
		sgr: (code: string) => void
		char: (char: string, cells: number) => void
	}
): void {
	let i = 0
	while (i < text.length) {
		if (text[i] === '\x1b') {
			SGR.lastIndex = i
			const match = SGR.exec(text)
			if (match !== null) {
				on.sgr(match[0])
				i += match[0].length
				continue
			}
		}
		const codePoint = text.codePointAt(i)!
		const char = String.fromCodePoint(codePoint)
		on.char(char, char === '\n' ? 0 : charWidth(codePoint))
		i += char.length
	}
}

/** Which color codes remain in force after `code`. */
function nextActive(active: string[], code: string): string[] {
	const param = Number(code.slice(2, -1) || '0')
	if (param === 0) return []
	const closes: Record<number, (open: number) => boolean> = {
		22: open => open === 1 || open === 2,
		23: open => open === 3,
		24: open => open === 4,
		27: open => open === 7,
		39: open => (open >= 30 && open <= 38) || (open >= 90 && open <= 97),
		49: open => (open >= 40 && open <= 48) || (open >= 100 && open <= 107),
	}
	const close = closes[param]
	if (close === undefined) return [...active, code]
	return active.filter(open => !close(Number(open.slice(2, -1).split(';')[0])))
}
