import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { format, formatRange } from './format.js'
import { lex } from './lex.js'
import { parse, ParseError } from './parse.js'
import { print } from './print.js'

const stripped = (source: string): string => lex(source).map(({ text }) => text).join(' ')

describe('format', () => {
	it('leaves what fits on a line', () => {
		expect(format('(+  1   2)')).toBe('(+ 1 2)')
		expect(format('[1\n2\n3]')).toBe('[1 2 3]')
		expect(format('(f 1 k:  2)')).toBe('(f 1 k: 2)')
		expect(format('{ a: 1   b?: 2 }')).toBe('{a: 1 b?: 2}')
		expect(format('( =>  [x: number] : number (* x x))')).toBe('(=> [x: number]: number (* x x))')
	expect(format('(=> { T  U } [x: T f: (=> [T]: U)]: U (f x))')).toBe('(=> {T U} [x: T f: (=> [T]: U)]: U (f x))')
		expect(format('a . b')).toBe('a.b')
		expect(format('(: 1  number)')).toBe('(: 1 number)')
		expect(format('^{doc: "x"}   (f)')).toBe('^{doc: "x"} (f)')
		expect(format('[ ...xs  ~y  @z  #_w ]')).toBe('[...xs ~y @z #_w]')
		expect(format('')).toBe('')
		expect(format('{}')).toBe('{}')
		expect(format('()')).toBe('()')
	})

	it('gives a binding a line of its own, at the top', () => {
		expect(format('a=1   b  =  2\n(f a)')).toBe('a = 1\nb = 2\n(f a)')
	})

	it('has the bindings of a block a line each, whatever fits', () => {
		expect(format('{a = 1 b = 2 (+ a b)}')).toBe('{\n  a = 1\n  b = 2\n  (+ a b)\n}')
		expect(format('{a = 1}')).toBe('{a = 1}')
		expect(format('[a = (f) b]')).toBe('[\n  a = (f)\n  b\n]')
		expect(format('(g {a = 1 b = 2})')).toBe('(g {\n  a = 1\n  b = 2\n})')
	})

	it('breaks what does not fit, with what it closes on the last line', () => {
		expect(format('(style (path.radial [400 400] (map (range 0 24) f)) stroke: "#ffffff" width: 3)', { width: 40 })).toBe(
			[
				'(style',
				'  (path.radial [400 400]',
				'    (map (range 0 24) f))',
				'  stroke: "#ffffff" width: 3)',
			].join('\n')
		)
	})

	it('starts a function on the line of what it is given to', () => {
		const written = '(map (range 0 96) (=> [i: number]: _ [(+ 400 (cos (* i turn))) (+ 400 (sin (* i turn)))]))'
		expect(format(`ring = ${written}`, { width: 44 })).toBe(
			[
				'ring = (map (range 0 96) (=> [i: number]: _',
				'  [(+ 400 (cos (* i turn)))',
				'   (+ 400 (sin (* i turn)))]))',
			].join('\n')
		)
	})

	it('says what comes first of a condition on the line of what asks it', () => {
		expect(format('(? (> a 1) (fffffffff 1 2) (ggggggggg 3 4))', { width: 24 })).toBe(
			['(? (> a 1)', '  (fffffffff 1 2)', '  (ggggggggg 3 4))'].join('\n')
		)
	})

	it('has what it says something of on the next line, further in if it is not at the start of one', () => {
		const doc = '^{doc: "a very long description indeed"}'
		expect(format(`${doc} (f)`, { width: 30 })).toBe(`${doc}\n(f)`)
		expect(format(`m = ${doc} (f)`, { width: 30 })).toBe(`m = ${doc}\n  (f)`)
	})

	it('goes on with a vector of numbers for as long as it fits', () => {
		expect(format('[1 2 3 4 5 6 7 8]', { width: 8 })).toBe('[1 2 3 4\n 5 6 7\n 8]')
	})

	it('goes on with names given to a call for as long as they fit', () => {
		expect(format('(max 1 2 3 4 5 6 7 8)', { width: 10 })).toBe('(max 1 2 3\n  4 5 6 7\n  8)')
		expect(format('(f (g (h)) 1 2 k: 3 m: 4)', { width: 12 })).toBe('(f\n  (g (h))\n  1 2\n  k: 3 m: 4)')
	})

	it('keeps comments, where they are said', () => {
		expect(format('a = 1   ; one\n;; two\nb = 2\n; end')).toBe('a = 1 ; one\n;; two\nb = 2\n; end')
		expect(format('(f a ; of a\n  b)')).toBe('(f a ; of a\n  b)')
		expect(format('(f a ; last\n)')).toBe('(f a ; last\n)')
		expect(format('[1 ; one\n 2]')).toBe('[1 ; one\n 2]')
		expect(format('{a = 1\n ; inside\n}')).toBe('{\n  a = 1\n  ; inside\n}')
		expect(format('(f\n ; before\n a)')).toBe('(f\n  ; before\n  a)')
		expect(format('; first\n(f)')).toBe('; first\n(f)')
	})

	it('moves a comment out of what cannot have one on a line of its own, rather than lose it', () => {
		const text = format('a = ; why\n  1')
		expect(text).toContain('; why')
		expect(print(parse(`{${text}\n}`))).toBeDefined()
	})

	it('keeps one blank line, between things', () => {
		expect(format('a = 1\n\n\n\nb = 2')).toBe('a = 1\n\nb = 2')
		expect(format('\n\na = 1')).toBe('a = 1')
		expect(format('a = 1\n\n; b\nb = 2')).toBe('a = 1\n\n; b\nb = 2')
	})

	it('keeps a last newline if there was one', () => {
		expect(format('a = 1\n')).toBe('a = 1\n')
		expect(format('a = 1')).toBe('a = 1')
	})

	it('does not put together what would be read as something else', () => {
		expect(stripped(format('[... ~x]'))).toBe(stripped('[... ~x]'))
		expect(stripped(format('(f k = ==)'))).toBe(stripped('(f k = ==)'))
	})

	it('says what is wrong with brackets that do not go together', () => {
		expect(() => format('(f')).toThrow(ParseError)
		expect(() => format('f)')).toThrow(ParseError)
		expect(() => format('(f]')).toThrow(ParseError)
	})

	// What is written all over the place, so that nothing in it has been left out of the above.
	const blocksIn = (file: string): string[] =>
		[...readFileSync(resolve(__dirname, '../../..', file), 'utf8').matchAll(/```(?:glisp|clojure)\n([\s\S]*?)```/g)].map(
			([, code]) => code!
		)
	const WRITTEN = ['README.md', 'site/lang/guide.md', 'spec/syntax.md', 'spec/types.md', 'spec/eval.md'].flatMap(blocksIn)

	const readable = WRITTEN.filter(code => {
		try {
			lex(code)
			format(code)
			return true
		} catch {
			return false
		}
	})

	it('has examples to go by', () => {
		expect(readable.length).toBeGreaterThan(50)
	})

	it.each(readable)('changes only what is between tokens of %s', code => {
		expect(stripped(format(code))).toBe(stripped(code))
	})

	it.each(readable)('comes to the same the second time, for %s', code => {
		const once = format(code)
		expect(format(once)).toBe(once)
	})
})

describe('formatRange', () => {
	const SOURCE = 'a = (f   1   (g   2))\nb = (h   3)\nc = 4'
	const edited = (source: string, from: number, to: number): string => {
		const edit = formatRange(source, from, to)
		return edit === null ? source : source.slice(0, edit.from) + edit.text + source.slice(edit.to)
	}

	it('lays out only the least that has all of what is selected in it', () => {
		const inG = SOURCE.indexOf('g') + 1
		expect(edited(SOURCE, inG, inG + 1)).toBe('a = (f   1   (g 2))\nb = (h   3)\nc = 4')
	})

	it('lays out the whole of what is selected', () => {
		const from = SOURCE.indexOf('(f')
		const to = SOURCE.indexOf('\nb')
		expect(edited(SOURCE, from, to)).toBe('a = (f 1 (g 2))\nb = (h   3)\nc = 4')
	})

	it('lays out what is around several of what is selected', () => {
		const from = SOURCE.indexOf('1')
		const to = SOURCE.indexOf('2')
		expect(edited(SOURCE, from, to)).toBe('a = (f 1 (g 2))\nb = (h   3)\nc = 4')
	})

	it('lays out each of several at the top', () => {
		const from = SOURCE.indexOf('(f')
		const to = SOURCE.indexOf('(h') + 2
		expect(edited(SOURCE, from, to)).toBe('a = (f 1 (g 2))\nb = (h 3)\nc = 4')
	})

	it('goes by where it starts, and by what comes after it on the line', () => {
		const source = `[\n  (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb (cccccccccccccc d)) ; note\n]`
		const from = source.indexOf('(aaa')
		const edit = formatRange(source, from, from + 1)!
		expect(edit.text).toContain('\n    (cccccccccccccc d)')
	})

	it('breaks nothing for what is further along a line that is too long already', () => {
		const source = `(+   (*  2  3)  (max ${'1 '.repeat(50)}))`
		const inner = source.indexOf('*')
		expect(edited(source, inner, inner + 1)).toBe(source.replace('(*  2  3)', '(* 2 3)'))
	})

	it('keeps a comment of what it lays out', () => {
		const source = '; about a\na = (f   1) ; of a\nb = 2'
		expect(edited(source, source.indexOf('(f'), source.indexOf('1'))).toBe('; about a\na = (f 1) ; of a\nb = 2')
	})

	it('has nothing to do where there is nothing', () => {
		expect(formatRange('', 0, 0)).toBeNull()
		expect(formatRange('a = 1\n\n\nb = 2', 7, 7)).toBeNull()
	})

	it('comes to what is already so', () => {
		const once = format(SOURCE)
		expect(edited(once, 0, once.length)).toBe(once)
	})
})
