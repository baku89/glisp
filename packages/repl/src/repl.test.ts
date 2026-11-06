import { describe, expect, it } from 'vitest'

import { parse } from '@glisp/lang'

import { charWidth, cursorCell, fit, stripAnsi, visibleWidth, wrap } from './ansi.js'
import { ReplCore } from './core.js'
import { LineEditor } from './editor.js'
import { renderFrame, type ScreenState } from './screen.js'

const plain = (lines: ReadonlyArray<string>): string[] => lines.map(stripAnsi)

describe('ansi', () => {
	const red = (s: string) => `\x1b[31m${s}\x1b[39m`

	it('measures wide characters and ignores colors', () => {
		expect(visibleWidth('abc')).toBe(3)
		expect(visibleWidth('日本語')).toBe(6)
		expect(visibleWidth(red('ab'))).toBe(2)
		expect(charWidth('a'.codePointAt(0)!)).toBe(1)
		expect(charWidth('́'.codePointAt(0)!)).toBe(0)
	})

	it('wraps by cells, keeping a wide character whole', () => {
		expect(wrap('abcde', 2)).toEqual(['ab', 'cd', 'e'])
		expect(wrap('日本語', 3)).toEqual(['日', '本', '語'])
		expect(wrap('a\nb', 5)).toEqual(['a', 'b'])
		expect(wrap('', 5)).toEqual([''])
	})

	it('carries a color across a break and closes each line', () => {
		const lines = wrap(red('abcd'), 2)
		expect(lines[0]).toBe('\x1b[31mab\x1b[0m')
		expect(lines[1]!.startsWith('\x1b[31m')).toBe(true)
		expect(plain(lines)).toEqual(['ab', 'cd'])
	})

	it('stops carrying a color once it is closed', () => {
		const lines = wrap(`${red('a')}bcd`, 2)
		expect(lines[1]!.includes('\x1b[31m')).toBe(false)
	})

	it('fits to an exact width', () => {
		expect(fit('ab', 4)).toBe('ab  ')
		expect(fit('abcdef', 4)).toBe('abcd')
		expect(visibleWidth(fit('日本語', 5))).toBe(5)
		expect(fit('ab', 0)).toBe('')
	})

	it('places the cursor where wrap puts the character', () => {
		expect(cursorCell('abcd', 0, 2)).toEqual({ row: 0, col: 0 })
		expect(cursorCell('abcd', 3, 2)).toEqual({ row: 1, col: 1 })
		expect(cursorCell('abcd', 2, 2)).toEqual({ row: 1, col: 0 })
		expect(cursorCell('ab', 2, 2)).toEqual({ row: 1, col: 0 })
		expect(cursorCell('日本', 2, 10)).toEqual({ row: 0, col: 4 })
		expect(cursorCell('a日', 1, 2)).toEqual({ row: 1, col: 0 })
		expect(cursorCell('ab', 1, 10, 7)).toEqual({ row: 0, col: 8 })
	})
})

describe('LineEditor', () => {
	const typed = (text: string, history: string[] = []) => {
		const editor = new LineEditor(history)
		editor.insert(text)
		return editor
	}

	it('edits around the cursor', () => {
		const e = typed('ac')
		e.left()
		e.insert('b')
		expect(e.text).toBe('abc')
		expect(e.cursor).toBe(2)
		e.backspace()
		expect(e.text).toBe('ac')
		e.delete()
		expect(e.text).toBe('a')
		e.delete()
		e.right()
		expect(e.cursor).toBe(1)
	})

	it('steps over a surrogate pair as one character', () => {
		const e = typed('a😀b')
		e.left()
		e.left()
		expect(e.cursor).toBe(1)
		e.right()
		expect(e.cursor).toBe(3)
		e.backspace()
		expect(e.text).toBe('ab')
	})

	it('moves and kills by word and by line', () => {
		const e = typed('foo bar')
		e.wordLeft()
		expect(e.cursor).toBe(4)
		e.wordLeft()
		expect(e.cursor).toBe(0)
		e.wordRight()
		expect(e.cursor).toBe(3)
		e.lineEnd()
		e.killWord()
		expect(e.text).toBe('foo ')
		e.lineStart()
		e.killToLineEnd()
		expect(e.text).toBe('')
		const line = typed('one\ntwo')
		line.killToLineStart()
		expect(line.text).toBe('one\n')
	})

	it('moves between lines of multi-line input before using history', () => {
		const e = typed('abc\nd\nefg', ['old'])
		e.up()
		expect(e.cursor).toBe(5)
		e.up()
		expect(e.cursor).toBe(1)
		e.down()
		expect(e.cursor).toBe(5)
		e.down()
		expect(e.cursor).toBe(7)
		e.up()
		e.up()
		e.up()
		expect(e.text).toBe('old')
	})

	it('walks history and returns to the draft', () => {
		const e = new LineEditor(['one', 'two'])
		e.insert('draft')
		e.up()
		expect(e.text).toBe('two')
		e.up()
		expect(e.text).toBe('one')
		e.up()
		expect(e.text).toBe('one')
		e.down()
		e.down()
		expect(e.text).toBe('draft')
	})

	it('records a commit, without blanks or repeats', () => {
		const e = new LineEditor()
		e.insert('x')
		expect(e.commit()).toBe('x')
		expect(e.text).toBe('')
		e.insert('x')
		e.commit()
		e.insert('  ')
		e.commit()
		expect(e.entries).toEqual(['x'])
	})
})

describe('ReplCore', () => {
	const run = (core: ReplCore, source: string): string[] =>
		plain(core.submit(source).output)

	it('evaluates, sets bindings, and reports errors', () => {
		const core = new ReplCore()
		expect(run(core, '(+ 1 2)')).toEqual(['3'])
		expect(run(core, 'x = 1')).toEqual([])
		expect(run(core, '(+ x 1)')).toEqual(['2'])
		expect(run(core, '(')[0]).toContain('syntax error')
		expect(run(core, 'nope')[1]).toContain('unresolvable name: nope')
		expect(run(core, '「')[0]).toBe(
			'syntax error · Unexpected character: "「" (at offset 0)\n1 | 「\n    ^'
		)
		expect(run(core, 'うんこ = (+ 1 2)')).toEqual([])
		expect(run(core, '(+ うんこ 1)')).toEqual(['4'])
		expect(core.complete('(+ うん').matches).toEqual(['うんこ'])
		expect(run(core, './nope/y = 1')[0]).toContain('no such binding: nope')
	})

	it('knows when input needs more lines', () => {
		const core = new ReplCore()
		for (const src of ['(+ 1', '[1 2', '{a = 1', '"abc', 'x = (+ 1', './p/q = [1']) {
			expect(core.isIncomplete(src), src).toBe(true)
		}
		for (const src of ['', '(+ 1 2)', 'x = 1', '(+ 1))', ':help', ']']) {
			expect(core.isIncomplete(src), src).toBe(false)
		}
	})

	it('shows the environment as a let-block that parses', () => {
				const core = new ReplCore()
		expect(plain(core.envLines())).toEqual(['{()}'])
		core.submit('x = 1')
		core.submit('y = (+ x 1)')
		core.submit('f = (=> [n: number]: number (* n 2))')
		const lines = plain(core.envLines())
		expect(lines).toEqual([
			'{x = 1',
			' y = (+ x 1) ; -> 2',
			' f = (=> [n: number]: number (* n 2))',
			'}',
		])
		expect(parse(lines.join('\n')).kind).toBe('let')
	})

	it('updates dependent values and marks what changed', () => {
		const core = new ReplCore()
		core.submit('x = 1')
		core.submit('y = (+ x 1)')
		core.submit('z = (+ 1 1)')
		expect(core.changedBindings()).toEqual([])
		core.submit('x = 100')
		expect(stripAnsi(core.envLines()[1]!)).toBe(' y = (+ x 1) ; -> 101')
		expect(core.changedBindings()).toEqual(['x', 'y'])
		core.submit('z = (+ 2 2)')
		expect(core.changedBindings()).toEqual(['z'])
	})

	it('shows an error on the binding it belongs to', () => {
		const core = new ReplCore()
		core.submit('x = nope')
		expect(plain(core.envLines())[0]).toBe('{x = nope ; ! unresolvable name: nope')
	})

	it('keeps a multi-line binding as it was written', () => {
		const core = new ReplCore()
		core.submit('p = [1\n     2]')
		expect(plain(core.envLines())).toEqual(['{p = [1', '       2] ; -> [1 2]', '}'])
	})

	it('reports what a submission cost, and reuses what did not change', () => {
		const core = new ReplCore()
		core.submit('a = (+ 1 2)')
		core.submit('b = 1')
		expect(core.status()).toMatch(/^\d+ computed · \d+ cached/)
		core.submit('b = 2')
		expect(core.status()).toMatch(/cached/)
		expect(Number(/(\d+) cached/.exec(core.status())![1])).toBeGreaterThan(0)
	})

	it('runs commands', () => {
		const core = new ReplCore()
		core.submit('x = 1')
		expect(run(core, ':type (+ 1 2)')[0]).toContain('number')
		expect(run(core, ':check (+ 1 "a")')[0]).toContain('expected number')
		expect(run(core, ':expand (+ 1 2)')[0]).toContain('fixed point')
		expect(run(core, ':ast (+ 1  2)')[0]).toBe('(+ 1  2)')
		expect(run(core, ':doc inc')[0]).toContain('inc :')
		expect(run(core, ':nope')[0]).toContain('unknown command')
		expect(run(core, ':unset y')[0]).toContain('no such binding')
		expect(run(core, ':unset x')).toEqual([])
		expect(plain(core.envLines())).toEqual(['{()}'])
		core.submit('x = 1')
		core.submit(':reset')
		expect(plain(core.envLines())).toEqual(['{()}'])
		expect(core.submit(':quit').quit).toBe(true)
		expect(core.submit(':help').output.length).toBe(1)
	})

	it('uses the last expression when a command gets none', () => {
		const core = new ReplCore()
		expect(run(core, ':type')[0]).toContain('no expression')
		core.submit('(+ 1 2)')
		expect(run(core, ':type')[0]).toContain('number')
	})

	it('completes commands and names', () => {
		const core = new ReplCore()
		core.submit('zebra = 1')
		expect(core.complete(':he').matches).toEqual([':help'])
		expect(core.complete('(+ zeb').matches).toEqual(['zebra'])
		expect(core.complete('(+ zeb').partial).toBe('zeb')
		expect(core.complete('(+ ').matches).toEqual([])
	})
})

describe('renderFrame', () => {
	const state: ScreenState = {
		log: [],
		logScroll: 0,
		env: ['{x = 1', '}'],
		envScroll: 0,
		prompt: 'glisp> ',
		continuationPrompt: '     | ',
		input: '',
		inputPlain: '',
		inputCursor: 0,
		status: 'status',
	}
	const render = (over: Partial<ScreenState>, cols = 80, rows = 8) =>
		renderFrame({ ...state, ...over }, cols, rows)

	it('fills the terminal exactly', () => {
		const frame = render({})
		expect(frame.rows).toHaveLength(8)
		for (const row of frame.rows) expect(visibleWidth(row)).toBe(80)
	})

	it('puts REPL on the left, Env on the right, input at the bottom', () => {
		const rows = plain(render({ log: ['one'] }).rows)
		expect(rows[0]).toMatch(/^REPL +│Env +$/)
		expect(rows[1]).toMatch(/│\{x = 1 +$/)
		expect(rows[2]).toMatch(/│\} +$/)
		expect(rows[1]).toMatch(/^one +│/)
		expect(rows[2]).toMatch(/^glisp> +│/)
		expect(rows[6]).toMatch(/^ +│/)
		expect(rows[7]).toMatch(/^status +$/)
	})

	it('puts the cursor after the prompt', () => {
		const frame = render({ input: 'ab', inputPlain: 'ab', inputCursor: 1 })
		expect(frame.cursor).toEqual({ row: 1, col: 8, visible: true })
	})

	it('grows the input over multiple lines, with the cursor on the right one', () => {
		const frame = render({ input: 'a\nbc', inputPlain: 'a\nbc', inputCursor: 4 })
		const rows = plain(frame.rows)
		expect(rows[1]).toMatch(/^glisp> a +│/)
		expect(rows[2]).toMatch(/^ {5}\| bc +│/)
		expect(frame.cursor).toEqual({ row: 2, col: 9, visible: true })
	})

	it('wraps long input and follows the cursor', () => {
		const text = 'x'.repeat(60)
		const frame = render({ input: text, inputPlain: text, inputCursor: 60 })
		expect(frame.cursor.row).toBe(2)
		expect(frame.cursor.col).toBe((7 + 60) % 47)
	})

	it('keeps the cursor on screen when input outgrows the pane', () => {
		const text = Array.from({ length: 20 }, (_, i) => `l${i}`).join('\n')
		const atEnd = render({ input: text, inputPlain: text, inputCursor: text.length })
		expect(atEnd.cursor.row).toBeLessThan(7)
		expect(atEnd.cursor.visible).toBe(true)
		expect(plain(atEnd.rows)[atEnd.cursor.row]).toContain('l19')
		const atStart = render({ input: text, inputPlain: text, inputCursor: 0 })
		expect(plain(atStart.rows)[atStart.cursor.row]).toContain('l0')
	})

	it('shows the newest log lines and scrolls back', () => {
		const log = Array.from({ length: 20 }, (_, i) => `line${i}`)
		const newest = plain(render({ log }).rows)
		expect(newest[6]).toMatch(/^glisp> /)
		expect(newest[5]).toMatch(/^line19 /)
		expect(newest[1]).toMatch(/^line15 /)
		const scrolled = plain(render({ log, logScroll: 3 }).rows)
		expect(scrolled[6]).toMatch(/^line17 /)
		expect(render({ log, logScroll: 3 }).cursor.visible).toBe(false)
		expect(render({ log }).cursor.visible).toBe(true)
		expect(render({ log }).maxLogScroll).toBe(15)
		expect(plain(render({ log, logScroll: 3 }).rows)[0]).toMatch(/^REPL +↓3│/)
		expect(plain(render({ log, logScroll: 999 }).rows)[1]).toMatch(/^line0 /)
	})

	it('wraps both panes and scrolls the environment', () => {
		const env = Array.from({ length: 20 }, (_, i) => `v${i}`)
		const rows = plain(render({ env }).rows)
		expect(rows[0]).toContain('↓14')
		expect(rows[1]).toContain('│v0')
		const scrolled = plain(render({ env, envScroll: 2 }).rows)
		expect(scrolled[0]).toContain('↑2')
		expect(scrolled[1]).toContain('│v2')
		const long = 'e'.repeat(50)
		const wrapped = render({ env: [long] }).rows
		for (const row of wrapped) expect(visibleWidth(row)).toBe(80)
		expect(plain(wrapped)[2]).toContain(`│${'e'.repeat(18)} `)
	})

	it('stacks the panes on a narrow terminal', () => {
		const frame = render({ log: ['one'] }, 40, 12)
		const rows = plain(frame.rows)
		expect(rows).toHaveLength(12)
		expect(rows[0]).toMatch(/^Env/)
		expect(rows[3]).toMatch(/^REPL/)
		expect(rows[5]).toMatch(/^glisp>/)
		expect(frame.cursor).toEqual({ row: 5, col: 7, visible: true })
	})

	it('survives a very small terminal', () => {
		for (const [cols, rows] of [[10, 3], [64, 2], [1, 1]] as const) {
			const frame = render({ log: ['x'], input: 'abc', inputPlain: 'abc', inputCursor: 3 }, cols, rows)
			expect(frame.rows.length).toBeLessThanOrEqual(rows)
			expect(frame.cursor.row).toBeLessThan(rows)
			expect(frame.cursor.col).toBeLessThan(Math.max(cols, 1))
		}
	})

	it('handles Japanese in the input', () => {
		const frame = render({ input: '"日本語"', inputPlain: '"日本語"', inputCursor: 4 })
		expect(frame.cursor.col).toBe(7 + 1 + 6)
	})
})
