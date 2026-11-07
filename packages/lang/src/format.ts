/**
 * Source laid out anew, as a formatter does: `format` for all of it, `formatRange` for the part
 * of it that a selection is in.
 *
 * It goes by tokens and not by the AST, which has no comments and has some of what is written
 * merged, so that only what is between tokens can change. `formatted` checks that it has.
 * What is written need not be one expression: a program is bindings, one after another.
 *
 * Spec: spec/host-api.md
 */

import { lex, type Token } from './lex.js'
import { ParseError } from './parse.js'

export interface FormatOptions {
	/** How long a line can be, if what is on it can go on another. */
	readonly width?: number
}

/** What is to take the place of what is from `from` to `to`. */
export interface FormatEdit {
	readonly from: number
	readonly to: number
	readonly text: string
}

const WIDTH = 80
const INDENT = 2

// -----------------------------------------------------------------------------
// What is written, as it goes together
// -----------------------------------------------------------------------------

interface Comment {
	readonly text: string
	readonly start: number
	readonly end: number
	/** It is on the line of what is before it. */
	readonly follows: boolean
	readonly blankBefore: boolean
}

/** Between one pair of brackets. */
interface Group {
	readonly open: string
	readonly close: string
	readonly items: readonly Item[]
	/** What is written after the last of the items. */
	readonly dangling: readonly Comment[]
}

/** What is written with nothing between, as `...(f).x`. */
interface Elem {
	readonly kind: 'elem'
	readonly parts: ReadonlyArray<string | Group>
}

/** `name = value`, `k: value`, `name: type`, `(params): type` or `^{...} value`. */
interface Pair {
	readonly kind: 'pair'
	readonly left: Elem
	readonly between: string
	readonly by: '=' | ':' | '^'
	readonly right: Value
}

type Value = Elem | Pair

interface Item {
	readonly value: Value
	readonly leading: readonly Comment[]
	readonly trailing: Comment | null
	readonly blankBefore: boolean
	readonly start: number
	readonly end: number
}

const CLOSING: Readonly<Record<string, string>> = { '(': ')', '[': ']', '{': '}' }
const PREFIXES: ReadonlySet<string> = new Set(['~', '@', '#_', '...', '...~'])

/** What is in the source between two tokens, or before the first of them. */
function commentsIn(source: string, from: number, to: number): { comments: Comment[]; blankAfter: boolean } {
	const comments: Comment[] = []
	let newlines = 0
	let blankBefore = false
	let at = from
	while (at < to) {
		const ch = source[at]!
		if (ch === ';') {
			const lineEnd = source.indexOf('\n', at)
			const end = lineEnd < 0 || lineEnd > to ? to : lineEnd
			comments.push({
				text: source.slice(at, end).trimEnd(),
				start: at,
				end,
				follows: newlines === 0 && comments.length === 0,
				blankBefore,
			})
			at = end
			newlines = 0
			blankBefore = false
			continue
		}
		if (ch === '\n') {
			newlines++
			if (newlines > 1) blankBefore = true
		}
		at++
	}
	return { comments, blankAfter: blankBefore }
}

class Reader {
	private pos = 0
	/** What has come up inside of an item, which goes before it. */
	private pending: Comment[] = []
	private readonly gaps: { comments: Comment[]; blankAfter: boolean }[]

	constructor(
		private readonly source: string,
		private readonly tokens: readonly Token[]
	) {
		this.gaps = tokens.map((token, i) =>
			commentsIn(source, i === 0 ? 0 : tokens[i - 1]!.end, token.start)
		)
	}

	private peek(offset = 0): Token {
		return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)]!
	}

	private advance(): Token {
		this.pending.push(...this.gaps[this.pos]!.comments)
		this.gaps[this.pos] = { comments: [], blankAfter: this.gaps[this.pos]!.blankAfter }
		return this.tokens[this.pos++]!
	}

	/** All that there is, up to the end. */
	program(): { items: Item[]; dangling: Comment[] } {
		const items = this.items('eof')
		return { items, dangling: this.gaps[this.pos]!.comments }
	}

	private items(until: string): Item[] {
		const items: Item[] = []
		while (this.peek().kind !== until) {
			if (this.peek().kind === 'eof') {
				throw new ParseError(`unterminated, where \`${until}\` should be`, this.source, this.peek().start)
			}
			if (')]}'.includes(this.peek().kind)) {
				throw new ParseError(`unexpected \`${this.peek().text}\``, this.source, this.peek().start)
			}
			items.push(this.item(items.length === 0))
		}
		return items
	}

	private item(isFirst: boolean): Item {
		const outer = this.pending
		this.pending = []
		const { start } = this.peek()
		const blankBefore =
			!isFirst &&
			(this.gaps[this.pos]!.blankAfter || this.gaps[this.pos]!.comments[0]?.blankBefore === true)
		const value = this.pair()
		const { end } = this.tokens[this.pos - 1]!
		const leading = this.pending
		this.pending = outer
		// On the line of what it is said of, however much comes after it.
		const next = this.gaps[this.pos]!
		const first = next.comments[0]
		const trailing = first?.follows ? first : null
		if (trailing !== null) next.comments.shift()
		return { value, leading, trailing, blankBefore, start, end }
	}

	private pair(): Value {
		const left = this.meta()
		if (left.kind === 'pair') return left
		const next = this.peek()
		if (next.kind === '=') {
			this.advance()
			return { kind: 'pair', left, between: ' = ', by: '=', right: this.meta() }
		}
		const optional = next.kind === '?' && this.peek(1).kind === ':'
		if (next.kind === ':' || optional) {
			const said = optional ? this.advance().text : ''
			this.advance()
			return {
				kind: 'pair',
				left: { kind: 'elem', parts: [...left.parts, `${said}:`] },
				between: ' ',
				by: ':',
				right: this.meta(),
			}
		}
		return left
	}

	private meta(): Value {
		if (this.peek().kind !== '^') return this.elem()
		this.advance()
		// `^{...}` says something of what follows, and `^T` is what it is as
		const left: Elem = { kind: 'elem', parts: ['^', this.peek().kind === '{' ? this.group() : this.atom()] }
		return { kind: 'pair', left, between: ' ', by: '^', right: this.meta() }
	}

	private elem(): Elem {
		const parts: Array<string | Group> = []
		while (PREFIXES.has(this.peek().kind)) {
			const prefix = this.advance()
			// What would otherwise be read as another token.
			const stays = prefix.kind === '...' && this.peek().kind === '~'
			parts.push(stays ? `${prefix.text} ` : prefix.text)
		}
		parts.push(this.atom())
		for (;;) {
			const next = this.peek()
			if (next.kind === '.') {
				this.advance()
				parts.push('.', this.atom())
				continue
			}
			const touches = next.start === this.tokens[this.pos - 1]!.end
			const separate = next.kind === 'eof' || next.kind === '=' || next.kind === ':' || next.kind === '?' || ')]}'.includes(next.kind)
			if (!touches || separate) return { kind: 'elem', parts }
			parts.push(this.atom())
		}
	}

	private atom(): string | Group {
		const { kind, text, start } = this.peek()
		if (kind === '(' || kind === '[' || kind === '{') return this.group()
		if (kind === 'eof' || ')]}'.includes(kind)) {
			throw new ParseError(`unexpected ${kind === 'eof' ? 'end' : `\`${text}\``}`, this.source, start)
		}
		this.advance()
		return text
	}

	private group(): Group {
		const open = this.peek().text
		const close = CLOSING[open]
		if (close === undefined) {
			throw new ParseError(`unexpected \`${open}\``, this.source, this.peek().start)
		}
		this.advance()
		const items = this.items(close)
		const dangling = this.gaps[this.pos]!.comments
		this.gaps[this.pos] = { comments: [], blankAfter: false }
		this.advance()
		return { open, close, dangling, items }
	}
}

// -----------------------------------------------------------------------------
// As it is laid out
// -----------------------------------------------------------------------------

const hasComments = ({ leading, trailing }: Item): boolean => leading.length > 0 || trailing !== null

const groupOf = (value: Value): Group | null => {
	if (value.kind === 'pair') return null
	const groups = value.parts.filter(part => typeof part !== 'string')
	return groups.length === 1 ? groups[0]! : null
}

const isBinding = (item: Item): boolean => item.value.kind === 'pair' && item.value.by === '='

/** A keyword argument, `k: value`, in a call. */
const isKeyword = (item: Item): boolean => item.value.kind === 'pair' && item.value.by === ':'

/** What is given with a name or a key, which does not stay on the line of what it is given to. */
const isPaired = (item: Item): boolean => isBinding(item) || isKeyword(item)

/** Bindings, which have a line each, as there is no telling them apart otherwise. */
const isBlock = ({ open, items }: Group): boolean =>
	(open === '{' &&
		items.length > 1 &&
		items.every(item => item.value.kind !== 'pair' || item.value.by === '=') &&
		// Names alone, as a function's generics `{T U}` are, bind nothing
		items.some(item => item.value.kind === 'pair')) ||
	(open === '[' && items.some(isBinding))

/** All on one line, if it can be. */
function flat(value: Value): string | null {
	if (value.kind === 'pair') {
		const [left, right] = [flat(value.left), flat(value.right)]
		return left === null || right === null ? null : `${left}${value.between}${right}`
	}
	let out = ''
	for (const part of value.parts) {
		if (typeof part === 'string') {
			out += part
			continue
		}
		if (part.dangling.length > 0 || part.items.some(hasComments) || isBlock(part)) return null
		const inner = part.items.map(({ value }) => flat(value))
		if (inner.includes(null)) return null
		out += `${part.open}${inner.join(' ')}${part.close}`
	}
	return out
}

const isFnGroup = ({ open, items }: Group): boolean => {
	const value = items[0]?.value
	return open === '(' && value?.kind === 'elem' && value.parts[0] === '=>'
}

/** What has lines of its own whatever is around it, and can start on the line of what it is given to. */
const opensOnLine = (value: Value): boolean => {
	const group = groupOf(value)
	return group !== null && (isFnGroup(group) || isBlock(group))
}

const isAtom = (value: Value): boolean =>
	value.kind === 'elem' && value.parts.every(part => typeof part === 'string')

/**
 * What says little enough to go on the line of what it is given to: a name, a vector of names, or
 * if it comes first, as what is asked of `?` does, a call of them.
 */
const isSimple = (value: Value, isFirst: boolean): boolean => {
	if (value.kind === 'pair') return false
	return value.parts.every(
		part =>
			typeof part === 'string' ||
			((part.open === '[' || isFirst) && part.items.every(item => isAtom(item.value)))
	)
}

const columnAfter = (text: string, column: number): number => {
	const line = text.lastIndexOf('\n')
	return line < 0 ? column + text.length : text.length - line - 1
}

class Layout {
	constructor(private readonly width: number) {}

	private fits(text: string, column: number, after: number): boolean {
		return column + text.length + after <= this.width
	}

	/** `value`, from `column`, on a line indented by `indent`, with `after` to come after it. */
	value(value: Value, indent: number, column: number, after: number): string {
		const whole = flat(value)
		if (whole !== null && this.fits(whole, column, after)) return whole
		if (value.kind === 'pair') {
			// What says something of what comes next can be on the line before it, as it is.
			if (value.by === '^') {
				const left = flat(value.left) ?? this.value(value.left, indent, column, 0)
				const below = column === indent ? indent : indent + INDENT
				return `${left}\n${' '.repeat(below)}${this.value(value.right, below, below, after)}`
			}
			const left = this.value(value.left, indent, column, value.between.length)
			const at = columnAfter(left, column) + value.between.length
			return `${left}${value.between}${this.value(value.right, indent, at, after)}`
		}
		let out = ''
		let at = column
		value.parts.forEach((part, i) => {
			const rest = value.parts.slice(i + 1).reduce<number>(
				(sum, other) => sum + (typeof other === 'string' ? other.length : 0),
				0
			)
			const text = typeof part === 'string' ? part : this.group(part, indent, at, after + rest)
			out += text
			at = columnAfter(text, at)
		})
		return out
	}

	/** One after another, a line each, with what is said of them. */
	lines(items: readonly Item[], dangling: readonly Comment[], indent: number): string {
		const pad = ' '.repeat(indent)
		const lines: string[] = []
		items.forEach(item => {
			if (item.blankBefore) lines.push('')
			item.leading.forEach((comment, i) => {
				if (comment.blankBefore && i > 0) lines.push('')
				lines.push(pad + comment.text)
			})
			lines.push(pad + this.item(item, indent))
		})
		dangling.forEach(comment => {
			if (comment.blankBefore && lines.length > 0) lines.push('')
			lines.push(pad + comment.text)
		})
		return lines.join('\n')
	}

	private item(item: Item, indent: number): string {
		const text = this.value(item.value, indent, indent, 0)
		return item.trailing === null ? text : `${text} ${item.trailing.text}`
	}

	private block({ open, close, items, dangling }: Group, indent: number): string {
		if (items.length === 0 && dangling.length === 0) return `${open}${close}`
		return `${open}\n${this.lines(items, dangling, indent + INDENT)}\n${' '.repeat(indent)}${close}`
	}

	private group(group: Group, indent: number, column: number, after: number): string {
		if (group.open === '(' && group.items.length > 0) return this.call(group, indent, column, after)
		if (group.open === '[' && !isBlock(group) && group.items.length > 0) return this.vector(group, column, after)
		return this.block(group, indent)
	}

	/** What closes it, on the line of what it comes after if a comment is not in the way. */
	private closing({ close, items, dangling }: Group, indent: number): string {
		return dangling.length > 0 || items.at(-1)?.trailing
			? `\n${' '.repeat(indent)}${close}`
			: close
	}

	/** On their own lines from here on, aligned at `indent`, with keywords and with names going on for as long as they fit. */
	private rest(
		items: readonly Item[],
		dangling: readonly Comment[],
		indent: number,
		after: number,
		goesOn: (item: Item) => boolean = isBinding
	): string {
		const pad = ' '.repeat(indent)
		let out = ''
		let line = ''
		let lineKind: 'keyword' | 'atom' | null = null
		const flush = () => {
			if (line !== '') out += `\n${pad}${line}`
			line = ''
		}
		items.forEach((item, i) => {
			const isLast = i === items.length - 1
			const closing = isLast && dangling.length === 0 && item.trailing === null ? after : 0
			const whole = flat(item.value)
			const kind = hasComments(item) || whole === null ? null : goesOn(item) ? 'keyword' : isAtom(item.value) ? 'atom' : null
			if (kind !== null && kind === lineKind && this.fits(`${line} ${whole!}`, indent, closing)) {
				line += ` ${whole!}`
				return
			}
			flush()
			lineKind = kind
			if (kind !== null && this.fits(whole!, indent, closing)) {
				line = whole!
				return
			}
			if (item.blankBefore) out += '\n'
			item.leading.forEach(comment => {
				out += `\n${pad}${comment.text}`
			})
			const text = this.value(item.value, indent, indent, closing)
			out += `\n${pad}${text}${item.trailing === null ? '' : ` ${item.trailing.text}`}`
		})
		flush()
		dangling.forEach(comment => {
			out += `\n${pad}${comment.text}`
		})
		return out
	}

	private call(group: Group, indent: number, column: number, after: number): string {
		const { items, dangling } = group
		const closing = this.closing(group, indent)
		const closed = closing.length + after
		const inner = indent + INDENT
		const [head, ...others] = items as [Item, ...Item[]]
		let out = group.open + head.leading.map(comment => `${comment.text}\n${' '.repeat(column + 1)}`).join('')
		out += this.value(head.value, indent, columnAfter(out, column), 0)
		if (head.trailing !== null) {
			out += ` ${head.trailing.text}`
			return out + this.rest(others, dangling, inner, closed, isKeyword) + closing
		}
		let at = columnAfter(out, column)
		let i = 0

		// The rest of a function's signature, whatever it comes to, then what it does.
		if (isFnGroup(group)) {
			while (i < others.length && !hasComments(others[i]!)) {
				const part = others[i]!
				const isSignature = part.value.kind === 'pair' && part.value.by === ':'
				const text = this.value(part.value, indent, at + 1, isSignature && i === others.length - 1 ? closed : 0)
				out += ` ${text}`
				at = columnAfter(text, at + 1)
				i++
				if (isSignature) break
			}
			return out + this.rest(others.slice(i), dangling, inner, closed) + closing
		}

		// What it is all for comes last, and can start on this line.
		const last = others.at(-1)
		const before = others.slice(0, -1).map(({ value }) => flat(value))
		if (
			last !== undefined &&
			opensOnLine(last.value) &&
			dangling.length === 0 &&
			!others.some(hasComments) &&
			!before.includes(null) &&
			!others.some(isPaired) &&
			this.fits(before.map(text => ` ${text}`).join(''), at, 0)
		) {
			const said = before.map(text => ` ${text}`).join('')
			const start = at + said.length + 1
			return `${out}${said} ${this.value(last.value, indent, start, closed)}${closing}`
		}

		// What is simple can stay with what it is given to.
		while (i < others.length) {
			const item = others[i]!
			const text = flat(item.value)
			if (text === null || item.leading.length > 0 || isPaired(item) || !isSimple(item.value, i === 0)) break
			const isLast = i === others.length - 1
			if (!this.fits(` ${text}`, at, isLast ? closed : 0)) break
			out += ` ${text}`
			at += text.length + 1
			i++
			if (item.trailing !== null) {
				out += ` ${item.trailing.text}`
				break
			}
		}
		return out + this.rest(others.slice(i), dangling, inner, closed, isKeyword) + closing
	}

	/** Each aligned with the first, with what is only numbers and names going on for as long as it fits. */
	private vector(group: Group, column: number, after: number): string {
		const { items, dangling, open } = group
		const closing = this.closing(group, column)
		const closed = closing.length + after
		const inner = column + 1
		const pad = ' '.repeat(inner)
		const fills = items.every(item => isAtom(item.value) && !hasComments(item))
		let out = open
		let at = inner
		items.forEach((item, i) => {
			const isLast = i === items.length - 1
			const closes = isLast && dangling.length === 0 ? closed : 0
			if (i > 0) {
				const whole = flat(item.value)
				if (fills && whole !== null && this.fits(` ${whole}`, at, closes)) {
					out += ` ${whole}`
					at += whole.length + 1
					return
				}
				out += `\n${pad}`
				at = inner
			}
			if (item.blankBefore && i > 0) out += `\n${pad}`
			item.leading.forEach(comment => {
				out += `${comment.text}\n${pad}`
			})
			const text = this.value(item.value, inner, inner, closes)
			out += text
			at = columnAfter(text, inner)
			if (item.trailing !== null) out += ` ${item.trailing.text}`
		})
		dangling.forEach(comment => {
			out += `\n${pad}${comment.text}`
		})
		return out + closing
	}
}

// -----------------------------------------------------------------------------
// What can be asked for
// -----------------------------------------------------------------------------

/** All that is not in between tokens, in the order that it comes, as nothing else may change. */
function isSameBut(source: string, other: string): boolean {
	const said = (text: string): string[] => {
		const tokens = lex(text)
		return tokens.map(({ kind, text: written }) => `${kind} ${written}`)
	}
	const notesOf = (text: string): string[] => {
		const tokens = lex(text)
		return tokens
			.flatMap((token, i) => commentsIn(text, i === 0 ? 0 : tokens[i - 1]!.end, token.start).comments)
			.map(comment => comment.text)
			.sort()
	}
	try {
		return said(source).join('\n') === said(other).join('\n') && notesOf(source).join('\n') === notesOf(other).join('\n')
	} catch {
		return false
	}
}

const readOf = (source: string) => new Reader(source, lex(source)).program()

/**
 * `source`, laid out anew. Only what is between tokens changes, and comments stay, so that it
 * comes to the same. Throws `LexError` or `ParseError` if its brackets do not go together.
 */
export function format(source: string, { width = WIDTH }: FormatOptions = {}): string {
	const { items, dangling } = readOf(source)
	const laid = new Layout(width).lines(items, dangling, 0)
	const text = source.endsWith('\n') && laid !== '' ? `${laid}\n` : laid
	return isSameBut(source, text) ? text : source
}

/** The least of `items` that all of what is from `from` to `to` is in, and that has anything to lay out. */
function itemsWritten(
	items: readonly Item[],
	from: number,
	to: number
): readonly Item[] {
	const over = items.filter(item => item.start < Math.max(to, from + 1) && from <= item.end)
	const [only] = over
	if (only === undefined || over.length > 1) return over
	if (from <= only.start && only.end <= to) return over
	const groupsOf = (value: Value): Group[] =>
		value.kind === 'pair'
			? [...groupsOf(value.left), ...groupsOf(value.right)]
			: value.parts.filter(part => typeof part !== 'string')
	for (const group of groupsOf(only.value)) {
		const inner = itemsWritten(group.items, from, to)
		const [first] = inner
		// Several of what is in it, or what has nothing in it to lay out, are of what is around them.
		if (first !== undefined && inner.length === 1 && groupsOf(first.value).length > 0) return inner
	}
	return over
}

/**
 * What to do to `source` for the least of what is written that has all of `from` to `to` in it
 * to be laid out anew: a subtree, or several of what the whole of it is one after another of.
 * Null if there is nothing there. Throws as `format` does.
 */
export function formatRange(
	source: string,
	from: number,
	to: number,
	{ width = WIDTH }: FormatOptions = {}
): FormatEdit | null {
	const items = itemsWritten(readOf(source).items, from, to)
	const [first] = items
	const last = items.at(-1)
	if (first === undefined || last === undefined) return null

	const start = first.leading[0]?.start ?? first.start
	const end = last.trailing?.end ?? last.end
	const lineStart = source.lastIndexOf('\n', start - 1) + 1
	const before = source.slice(lineStart, start)
	const column = before.length
	const indent = /^\s*$/.test(before) ? column : before.length - before.trimStart().length
	const lineEnd = source.indexOf('\n', end)
	// What closes around it stays next to it, and what is further along can go on another line.
	const after = /^\S*/.exec(source.slice(end, lineEnd < 0 ? source.length : lineEnd))![0].length

	const layout = new Layout(width)
	const [only] = items
	const text =
		items.length === 1 && only !== undefined && only.leading.length === 0
			? layout.value(only.value, indent, column, only.trailing === null ? after : 0) +
				(only.trailing === null ? '' : ` ${only.trailing.text}`)
			: layout.lines(items, [], indent).trimStart()
	const next = `${source.slice(0, start)}${text}${source.slice(end)}`
	return isSameBut(source, next) ? { from: start, to: end, text } : null
}
