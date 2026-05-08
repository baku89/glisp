import { describe, expect, it } from 'vitest'

import { lex, LexError } from './lex.js'
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
		expect(kinds(':^?`~')).toEqual([':', '^', '?', '`', '~'])
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
