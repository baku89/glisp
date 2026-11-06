import { lex, type Token } from '@glisp/lang'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { LINE_START, type LineState, tokenizeLine } from './highlight'

/** What each stretch of `source` is, as [text, scope], without what is only space. */
function read(source: string, from: LineState = LINE_START): [string, string][] {
	const out: [string, string][] = []
	let state = from
	for (const line of source.split('\n')) {
		const { tokens, state: next } = tokenizeLine(line, state)
		state = next
		tokens.forEach((token, i) => {
			const text = line.slice(token.start, tokens[i + 1]?.start ?? line.length)
			if (text.trim() !== '') out.push([text.trimEnd(), token.scope])
		})
	}
	return out
}

const scopeIn = (source: string, text: string) =>
	read(source).find(([t]) => t === text)?.[1]

describe('tokenizeLine', () => {
	it('tells what a call calls from what it is given', () => {
		expect(read('(foo bar 1)')).toEqual([
			['(', 'delimiter'],
			['foo', 'function'],
			['bar', 'identifier'],
			['1', 'number'],
			[')', 'delimiter'],
		])
	})

	it('goes along a name with dots, as what is called', () => {
		expect(read('(path.ngon a.b)').slice(1, 6)).toEqual([
			['path', 'function'],
			['.', 'delimiter'],
			['ngon', 'function'],
			['a', 'identifier'],
			['.', 'delimiter'],
		])
	})

	it('reads a name given something, including by a keyword', () => {
		expect(scopeIn('{a = 1}', 'a')).toBe('variable')
		expect(scopeIn('{x: 1}', 'x')).toBe('variable')
		expect(scopeIn('(f x: 2)', 'x')).toBe('variable')
		expect(scopeIn('{y?: string}', 'y')).toBe('variable')
		expect(scopeIn('(f x==2)', 'x')).toBe('identifier')
	})

	it('reads what is after a colon as a type, but not in a call of it', () => {
		expect(scopeIn('{x: Foo}', 'Foo')).toBe('type')
		expect(scopeIn('(f x: Foo)', 'Foo')).toBe('identifier')
		expect(scopeIn('(f x: (g 1))', 'g')).toBe('function')
		expect(scopeIn('(f\n  x: Foo)', 'Foo')).toBe('identifier')
		expect(scopeIn('(=> [x: Foo] (f y: Bar))', 'Bar')).toBe('identifier')
		expect(scopeIn('(=> {T} [x: T]: Bar x)', 'Bar')).toBe('type')
		expect(scopeIn('(: v Foo)', 'v')).toBe('identifier')
		expect(scopeIn('(=> [x: Foo]: Bar x)', 'Bar')).toBe('type')
	})

	it('calls nothing in a list of parameters', () => {
		expect(scopeIn('(=> {T} [x: T]: T x)', 'T')).toBe('identifier')
		expect(scopeIn('(=> [Foo Foo]: Foo)', 'Foo')).toBe('identifier')
		expect(scopeIn('(=> [x: (refine number 0 p)]: T x)', 'refine')).toBe('function')
	})

	it('has the literals and what is reserved', () => {
		expect(scopeIn('[true ()]', 'true')).toBe('constant.language')
		expect(scopeIn('[true ()]', '()')).toBe('constant.language')
		expect(scopeIn('[_ !]', '_')).toBe('type')
		expect(scopeIn('[./width/0]', './width/0')).toBe('variable.predefined')
		expect(scopeIn('[/a/b]', '/a/b')).toBe('variable.predefined')
		expect(scopeIn('[./c/radius:]', './c/radius:')).toBe('variable.predefined')
		expect(scopeIn('(|> x %)', '|>')).toBe('keyword')
		expect(scopeIn('(|> x %)', '%')).toBe('keyword')
		expect(scopeIn('(? x)', '?')).toBe('keyword')
		expect(scopeIn('[...xs]', '...')).toBe('keyword')
		expect(scopeIn('[#_ x]', '#_')).toBe('keyword')
	})

	it('reads a name as far as the language does', () => {
		expect(scopeIn('(半径 π)', '半径')).toBe('function')
		expect(scopeIn('[a-7 -7]', 'a-7')).toBe('identifier')
		expect(scopeIn('[a-7 -7]', '-7')).toBe('number')
	})

	it('shows what cannot be read, and reads on from it', () => {
		expect(scopeIn('[`a b]', '`')).toBe('invalid')
		expect(scopeIn('[`a b]', 'b')).toBe('identifier')
		expect(scopeIn('[「 b]', '「')).toBe('invalid')
		expect(scopeIn('[1e b]', 'b')).toBe('identifier')
	})

	it('tells an escape from one that is not', () => {
		expect(read('"a\\nb\\qc"')).toEqual([
			['"a', 'string'],
			['\\n', 'string.escape'],
			['b', 'string'],
			['\\q', 'invalid'],
			['c"', 'string'],
		])
	})

	it('goes on with a string and a call to the next line', () => {
		expect(read('"a\nb" c')).toEqual([
			['"a', 'string'],
			['b"', 'string'],
			['c', 'identifier'],
		])
		expect(scopeIn('(\n  foo)', 'foo')).toBe('function')
	})

	it('has a comment to the end of the line, but not in a string', () => {
		expect(read('a ; b "c')).toEqual([
			['a', 'identifier'],
			['; b "c', 'comment'],
		])
		expect(read('"a ; b"')).toEqual([['"a ; b"', 'string']])
	})
})

describe('as the language reads it', () => {
	const blocks = ['spec/syntax.md', 'spec/types.md', 'spec/eval.md', 'site/lang/guide.md']
		.flatMap(file => [...readFileSync(file, 'utf8').matchAll(/```glisp\n([\s\S]*?)```/g)])
		.map(match => match[1]!)

	it('has examples to go by', () => {
		expect(blocks.length).toBeGreaterThan(50)
	})

	it('breaks every example where the lexer does', () => {
		for (const block of blocks) {
			let tokens: Token[]
			try {
				tokens = lex(block)
			} catch {
				continue // an example of what is not Glisp
			}
			const starts = new Set<number>()
			const strings = tokens.filter(token => token.kind === 'string')
			let offset = 0
			let state = LINE_START
			for (const line of block.split('\n')) {
				const read = tokenizeLine(line, state)
				state = read.state
				for (const token of read.tokens) {
					expect(token.scope, `${line} in\n${block}`).not.toBe('invalid')
					if (token.scope !== '') starts.add(offset + token.start)
				}
				offset += line.length + 1
			}
			for (const token of tokens) {
				if (token.kind === 'eof') continue
				expect(starts.has(token.start), `${token.text} at ${token.start} in\n${block}`).toBe(true)
			}
			expect(state.inString).toBe(false)
			expect(strings.every(token => starts.has(token.start))).toBe(true)
		}
	})
})
