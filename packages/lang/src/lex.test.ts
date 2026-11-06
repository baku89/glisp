import { describe, expect, it } from 'vitest'

import { lex, LexError, writtenName } from './lex.js'
import { UNIT } from './types.js'

function kinds(src: string): string[] {
	return lex(src)
		.filter(t => t.kind !== 'eof')
		.map(t => t.kind)
}

describe('lex — basics', () => {
	it('skips whitespace and comments', () => {
		expect(kinds('   ')).toEqual([])
		expect(kinds('; comment\n; another')).toEqual([])
		expect(kinds('foo ; trailing comment')).toEqual(['identifier'])
	})

	it('eof is always emitted', () => {
		const ts = lex('')
		expect(ts).toHaveLength(1)
		expect(ts[0]?.kind).toBe('eof')
	})
})

describe('lex — punctuation', () => {
	it('brackets', () => {
		expect(kinds('([{}])')).toEqual(['(', '[', '{', '}', ']', ')'])
	})

	it('colon, hat, question, backtick, tilde', () => {
		expect(kinds(':^?~')).toEqual([':', '^', '?', '~'])
	})

	it('= and =>', () => {
		expect(kinds('= =>')).toEqual(['=', '=>'])
	})

	it('() is the unit token', () => {
		const ts = lex('()')
		expect(ts[0]?.kind).toBe('()')
		expect(ts[0]?.value).toBe(UNIT)
	})
})

describe('lex — literals', () => {
	it('numbers', () => {
		expect(lex('42')[0]).toMatchObject({ kind: 'number', value: 42 })
		expect(lex('-7')[0]).toMatchObject({ kind: 'number', value: -7 })
		expect(lex('3.14')[0]).toMatchObject({ kind: 'number', value: 3.14 })
		expect(lex('1e5')[0]).toMatchObject({ kind: 'number', value: 100000 })
		expect(lex('1.5e-2')[0]).toMatchObject({ kind: 'number', value: 0.015 })
	})

	it('strings with escapes', () => {
		expect(lex('"hello"')[0]).toMatchObject({ kind: 'string', value: 'hello' })
		expect(lex('"a\\nb"')[0]).toMatchObject({ kind: 'string', value: 'a\nb' })
		expect(lex('"q\\"q"')[0]).toMatchObject({ kind: 'string', value: 'q"q' })
		expect(lex('"\\\\"')[0]).toMatchObject({ kind: 'string', value: '\\' })
		expect(lex('"\\u0041"')[0]).toMatchObject({ kind: 'string', value: 'A' })
	})

	it('booleans', () => {
		expect(lex('true')[0]).toMatchObject({ kind: 'boolean', value: true })
		expect(lex('false')[0]).toMatchObject({ kind: 'boolean', value: false })
	})

	it('top and bottom', () => {
		expect(lex('_')[0]).toMatchObject({ kind: '_' })
		expect(lex('!')[0]).toMatchObject({ kind: '!' })
	})

	it('reports unterminated string', () => {
		expect(() => lex('"oops')).toThrow(LexError)
	})
})

describe('lex — identifiers', () => {
	it('accepts non-ASCII letters and symbols', () => {
		for (const name of ['π', 'ℝ', '∞', '°', 'ƒ', 'うんこ', '半径2', 'é', 'x²', '😀', '👨‍👩‍👧']) {
			expect(lex(name), name).toMatchObject([
				{ kind: 'identifier', value: name },
				{ kind: 'eof' },
			])
		}
	})

	it('normalizes, keeping the source text', () => {
		const decomposed = 'か\u3099'
		expect(lex(decomposed)[0]).toMatchObject({ value: 'が', text: decomposed })
	})

	it('rejects non-ASCII punctuation, and a leading digit or mark', () => {
		for (const src of ['「a」', '（a）', '、', '\u3099a', '٣']) {
			expect(() => lex(src), src).toThrow(LexError)
		}
	})

	it('treats an ideographic space as whitespace', () => {
		expect(kinds('a\u3000b')).toEqual(['identifier', 'identifier'])
	})

	it('accepts non-ASCII names in paths', () => {
		expect(lex('../半径/😀')[0]).toMatchObject({
			kind: 'pathSegments',
			value: ['..', '半径', '😀'],
		})
	})

	it('alphanumerics and allowed symbols', () => {
		expect(lex('foo')[0]).toMatchObject({ kind: 'identifier', value: 'foo' })
		expect(lex('+')[0]).toMatchObject({ kind: 'identifier', value: '+' })
		expect(lex('foo-bar')[0]).toMatchObject({
			kind: 'identifier',
			value: 'foo-bar',
		})
		expect(lex('>=')[0]).toMatchObject({ kind: 'identifier', value: '>=' })
		expect(lex('<=')[0]).toMatchObject({ kind: 'identifier', value: '<=' })
		expect(lex('!=')[0]).toMatchObject({ kind: 'identifier', value: '!=' })
		expect(lex('==')[0]).toMatchObject({ kind: 'identifier', value: '==' })
		expect(lex('is-empty!')[0]).toMatchObject({
			kind: 'identifier',
			value: 'is-empty!',
		})
		expect(lex('_x')[0]).toMatchObject({
			kind: 'identifier',
			value: '_x',
		})
	})

	it('separates adjacent tokens by punctuation', () => {
		expect(kinds('(foo bar)')).toEqual(['(', 'identifier', 'identifier', ')'])
	})
})

describe('lex — paths', () => {
	it('./foo', () => {
		const t = lex('./foo')[0]!
		expect(t.kind).toBe('pathSegments')
		expect(t.value).toEqual(['foo'])
		expect(t.text).toBe('./foo')
	})

	it('../foo', () => {
		expect(lex('../foo')[0]?.value).toEqual(['..', 'foo'])
	})

	it('../../a', () => {
		expect(lex('../../a')[0]?.value).toEqual(['..', '..', 'a'])
	})

	it('mixed names and indices', () => {
		expect(lex('../vec/0/name')[0]?.value).toEqual(['..', 'vec', 0, 'name'])
	})

	it('trailing slash means "the node itself"', () => {
		expect(lex('./')[0]?.value).toEqual([])
		expect(lex('../')[0]?.value).toEqual(['..'])
	})

	it('.. alone (no slash) is also a path', () => {
		expect(lex('..')[0]).toMatchObject({
			kind: 'pathSegments',
			value: ['..'],
		})
	})
})

describe('lex — comment edge cases', () => {
	it('lone semicolon is a comment to EOL', () => {
		expect(kinds(';')).toEqual([])
		expect(kinds(';\n')).toEqual([])
	})

	it('comment without trailing newline is fine at EOF', () => {
		expect(kinds('foo ; trailing no newline')).toEqual(['identifier'])
		expect(kinds('; only comment, no newline')).toEqual([])
	})

	it('comment inside a call only consumes to EOL', () => {
		expect(kinds('(a ; mid\nb)')).toEqual(['(', 'identifier', 'identifier', ')'])
	})

	it('semicolon inside a string is content, not a comment', () => {
		expect(lex('";"')[0]).toMatchObject({ kind: 'string', value: ';' })
	})

	it('mixed tabs and spaces between tokens', () => {
		expect(kinds('a\t b\t\tc')).toEqual([
			'identifier',
			'identifier',
			'identifier',
		])
	})
})

describe('lex — `:` as coerce head', () => {
	it('`(: v T)` lexes `:` as its own token', () => {
		expect(kinds('(: v T)')).toEqual([
			'(',
			':',
			'identifier',
			'identifier',
			')',
		])
	})

})

describe('lex — dot family disambiguation', () => {
	it('. is the accessor token', () => {
		expect(kinds('a.b')).toEqual(['identifier', '.', 'identifier'])
	})

	it('...xs is spread', () => {
		expect(kinds('...xs')).toEqual(['...', 'identifier'])
	})

	it('...~xs is splice', () => {
		expect(kinds('...~xs')).toEqual(['...~', 'identifier'])
	})

	it('.../foo is a 3-dot path (segments include two ..)', () => {
		const t = lex('.../foo')[0]!
		expect(t.kind).toBe('pathSegments')
		expect(t.value).toEqual(['..', '..', 'foo'])
	})
})

describe('lex — names written with `\\`', () => {
	const only = (src: string) => {
		const [token, end] = lex(src)
		expect(end!.kind).toBe('eof')
		return token!
	}

	it('puts what follows `\\` in the name, whatever it is', () => {
		expect(only('layer\\ 1')).toMatchObject({ kind: 'identifier', value: 'layer 1', text: 'layer\\ 1' })
		expect(only('a\\:b').value).toBe('a:b')
		expect(only('\\(x\\)').value).toBe('(x)')
		expect(only('a\\/b').value).toBe('a/b')
		expect(only('\\\\').value).toBe('\\')
		expect(only('\\「見出し\\」').value).toBe('「見出し」')
	})

	it('has `\\n` as `n`, not a new line', () => {
		expect(only('a\\n').value).toBe('an')
	})

	it('makes a name of what would be a number or a literal', () => {
		expect(only('\\1st')).toMatchObject({ kind: 'identifier', value: '1st' })
		expect(only('\\true')).toMatchObject({ kind: 'identifier', value: 'true' })
		expect(only('\\-1')).toMatchObject({ kind: 'identifier', value: '-1' })
	})

	it('cannot put in what could not be seen, or stands for something else', () => {
		expect(() => lex('a\\')).toThrow(LexError)
		expect(() => lex('a\\\nb')).toThrow(LexError)
		expect(() => lex('\\_')).toThrow(LexError)
		expect(() => lex('\\%')).toThrow(LexError)
	})

	it('goes along a path, to a name that is not a segment of one', () => {
		expect(only('./layer\\ 1/r:')).toMatchObject({ kind: 'pathSegments', value: ['layer 1', 'r:'] })
		expect(only('./\\1st')).toMatchObject({ value: ['1st'] })
		expect(() => lex('./a\\:')).toThrow(/cannot go to the name/)
		expect(() => lex('./\\.\\.')).toThrow(/cannot go to the name/)
	})
})

describe('writtenName', () => {
	it('writes a name as it is when it can be, and with `\\` where it must', () => {
		expect(writtenName('radius')).toBe('radius')
		expect(writtenName('>=')).toBe('>=')
		expect(writtenName('/')).toBe('/')
		expect(writtenName('layer 1')).toBe('layer\\ 1')
		expect(writtenName('1st')).toBe('\\1st')
		expect(writtenName('true')).toBe('\\true')
		expect(writtenName('-1')).toBe('\\-1')
		expect(writtenName('a:b')).toBe('a\\:b')
		expect(writtenName('a.b')).toBe('a\\.b')
	})

	it('writes what reads back as the same name', () => {
		for (const name of ['layer 1', '1st', 'true', '-1', 'a:b', '(x)', '#tag', 'a"b', 'x?', '\\', '見出し 1', 'é']) {
			const [token, end] = lex(writtenName(name))
			expect(token, name).toMatchObject({ kind: 'identifier', value: name.normalize('NFC') })
			expect(end!.kind, name).toBe('eof')
		}
	})
})
