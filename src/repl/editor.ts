/**
 * The input line: text, cursor, and history. No terminal in here, so it can
 * be driven directly by tests.
 */
export class LineEditor {
	text = ''
	/** Offset into `text`, in UTF-16 units, always on a code point boundary. */
	cursor = 0

	private history: string[]
	/** Position in `history`, or `history.length` while editing new input. */
	private historyIndex: number
	private draft = ''

	constructor(history: ReadonlyArray<string> = []) {
		this.history = [...history]
		this.historyIndex = this.history.length
	}

	get entries(): ReadonlyArray<string> {
		return this.history
	}

	/** Take the text as submitted: record it and start empty. */
	commit(): string {
		const text = this.text
		if (text.trim() !== '' && this.history.at(-1) !== text) {
			this.history.push(text)
		}
		this.historyIndex = this.history.length
		this.draft = ''
		this.set('')
		return text
	}

	set(text: string, cursor = text.length): void {
		this.text = text
		this.cursor = cursor
	}

	clear(): void {
		this.historyIndex = this.history.length
		this.draft = ''
		this.set('')
	}

	insert(text: string): void {
		this.text =
			this.text.slice(0, this.cursor) + text + this.text.slice(this.cursor)
		this.cursor += text.length
	}

	backspace(): void {
		if (this.cursor === 0) return
		const start = this.previousBoundary(this.cursor)
		this.text = this.text.slice(0, start) + this.text.slice(this.cursor)
		this.cursor = start
	}

	delete(): void {
		if (this.cursor === this.text.length) return
		const end = this.nextBoundary(this.cursor)
		this.text = this.text.slice(0, this.cursor) + this.text.slice(end)
	}

	left(): void {
		if (this.cursor > 0) this.cursor = this.previousBoundary(this.cursor)
	}

	right(): void {
		if (this.cursor < this.text.length) {
			this.cursor = this.nextBoundary(this.cursor)
		}
	}

	wordLeft(): void {
		this.cursor = this.wordStart()
	}

	wordRight(): void {
		const rest = this.text.slice(this.cursor)
		const match = /^\s*\S+/.exec(rest)
		this.cursor += match === null ? rest.length : match[0].length
	}

	lineStart(): void {
		this.cursor = this.text.lastIndexOf('\n', this.cursor - 1) + 1
	}

	lineEnd(): void {
		const end = this.text.indexOf('\n', this.cursor)
		this.cursor = end === -1 ? this.text.length : end
	}

	killToLineEnd(): void {
		const end = this.text.indexOf('\n', this.cursor)
		const stop = end === -1 ? this.text.length : end
		this.text = this.text.slice(0, this.cursor) + this.text.slice(stop)
	}

	killToLineStart(): void {
		const start = this.text.lastIndexOf('\n', this.cursor - 1) + 1
		this.text = this.text.slice(0, start) + this.text.slice(this.cursor)
		this.cursor = start
	}

	killWord(): void {
		const start = this.wordStart()
		this.text = this.text.slice(0, start) + this.text.slice(this.cursor)
		this.cursor = start
	}

	/** Up: within multi-line input first, then back through history. */
	up(): void {
		if (!this.moveLine(-1)) this.historyPrevious()
	}

	/** Down: within multi-line input first, then forward through history. */
	down(): void {
		if (!this.moveLine(1)) this.historyNext()
	}

	private historyPrevious(): void {
		if (this.historyIndex === 0) return
		if (this.historyIndex === this.history.length) this.draft = this.text
		this.historyIndex--
		this.set(this.history[this.historyIndex]!)
	}

	private historyNext(): void {
		if (this.historyIndex === this.history.length) return
		this.historyIndex++
		this.set(this.history[this.historyIndex] ?? this.draft)
	}

	private moveLine(delta: -1 | 1): boolean {
		const start = this.text.lastIndexOf('\n', this.cursor - 1) + 1
		const column = this.cursor - start
		if (delta === -1) {
			if (start === 0) return false
			const previousStart = this.text.lastIndexOf('\n', start - 2) + 1
			this.cursor = Math.min(previousStart + column, start - 1)
			return true
		}
		const end = this.text.indexOf('\n', this.cursor)
		if (end === -1) return false
		const nextEnd = this.text.indexOf('\n', end + 1)
		const stop = nextEnd === -1 ? this.text.length : nextEnd
		this.cursor = Math.min(end + 1 + column, stop)
		return true
	}

	private wordStart(): number {
		const match = /\S+\s*$/.exec(this.text.slice(0, this.cursor))
		if (match !== null) return match.index
		return /\s*$/.exec(this.text.slice(0, this.cursor))!.index
	}

	private previousBoundary(offset: number): number {
		const low = this.text.charCodeAt(offset - 1)
		const isPair = low >= 0xdc00 && low <= 0xdfff && offset >= 2
		return offset - (isPair ? 2 : 1)
	}

	private nextBoundary(offset: number): number {
		return offset + String.fromCodePoint(this.text.codePointAt(offset)!).length
	}
}
