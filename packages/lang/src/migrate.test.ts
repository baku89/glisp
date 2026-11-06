import { describe, expect, it } from 'vitest'

import { buildPrelude, type CallAST, evaluate, fromOlderSyntax, nameOf, parse, withFunctionsAsNow } from './index.js'

const env = buildPrelude()
const now = (source: string) => fromOlderSyntax(source, env)
const valueOf = (source: string) => evaluate(parse(source), env)

describe('keyword arguments', () => {
	it('are written with `:`, as a field of a record is', () => {
		expect(valueOf('(take [1 2 3] n: 2)').value).toEqual([1, 2])
		expect(parse('(f 1 k: 2)').print()).toBe('(f 1 k: 2)')
	})

	it('are not written with `=`, which names what is passed by position', () => {
		expect(nameOf((parse('(f 1 k=2)') as CallAST).args[1]!)).toBe('k')
		expect(valueOf('(take [1 2 3] k = 2)').value).toEqual([1, 2])
	})
})

describe('a path', () => {
	it('goes to what fills a slot by its key, and to what is bound by its name', () => {
		expect(valueOf('{width: 100 height: ./width:}').value).toEqual({ width: 100, height: 100 })
		expect(valueOf('{c = (+ 1 2 3) d = ./c/xs:/1 d}').value).toBe(2)
		expect(valueOf('{a = {b = [10 20]} c = /a/b/1 c}').value).toBe(20)
	})

	it('does not take a key for a name, or a name for a key', () => {
		expect(valueOf('{width: 100 height: ./width}').diagnostics[0]?.message).toContain('not found')
		expect(valueOf('{a = {b = 1} c = ./a/b: c}').diagnostics[0]?.message).toContain('not found')
	})
})

describe('what was written before', () => {
	it('has its keyword arguments written with `:`', () => {
		expect(now('(f 1 k=2)')).toBe('(f 1 k: 2)')
		expect(now('(f 1 k = 2)')).toBe('(f 1 k: 2)')
		expect(now('{a = 1 b = (f x=a [y = 1])}')).toBe('{a = 1 b = (f x: a [y = 1])}')
	})

	it('has what its paths go to by a key written as one', () => {
		expect(now('{width: 100 height: ./width area: (* ../width ../height)}')).toBe(
			'{width: 100 height: ./width: area: (* ../width: ../height:)}'
		)
		expect(now('{c = (+ 1 2 3) d = ./c/xs/1}')).toBe('{c = (+ 1 2 3) d = ./c/xs:/1}')
		expect(now('{z = @{a: 7} q = ./z/a q}')).toBe('{z = @{a: 7} q = ./z/a: q}')
	})

	it('leaves what goes by names and indices, and what is written now', () => {
		for (const source of ['{a = {b = [10 20]} c = /a/b/1}', '[1 ./0]', '{w: 1 h: ./w:}', '(f x: 1)']) {
			expect(now(source)).toBe(source)
		}
	})

	it('comes to what it came to', () => {
		const before = '{a = (take [1 2 3] n=2) b = ./a/n c = {w: 3 h: ../c/w} [b c]}'
		expect(valueOf(now(before)).value).toEqual([2, { w: 3, h: 3 }])
	})
})

describe('functions', () => {
	it('puts parameters in brackets and generics in braces', () => {
		expect(withFunctionsAsNow('(=> (x: number): number (* x x))')).toBe('(=> [x: number]: number (* x x))')
		expect(withFunctionsAsNow('(=> (T) (xs: [...T] i: number): T (xs i))')).toBe(
			'(=> {T} [xs: [...T] i: number]: T (xs i))'
		)
		expect(withFunctionsAsNow('(=> (F T) (x: (F T)): T x)')).toBe('(=> {F T} [x: (F T)]: T x)')
		expect(withFunctionsAsNow('(=> (number ...string): number)')).toBe('(=> [number ...string]: number)')
	})

	it('reaches a function in a function, and keeps what is around it', () => {
		const before = `{sq = ^{doc: "(=> (a) b)"} (=> (x: number): number (* x x))
 ; (=> (old: number): number)
 twice = (=> (f: (=> (x: number): number) x: number): number (f (f x)))
 (twice sq 3)}`
		const now = withFunctionsAsNow(before)
		expect(now).toBe(`{sq = ^{doc: "(=> (a) b)"} (=> [x: number]: number (* x x))
 ; (=> (old: number): number)
 twice = (=> [f: (=> [x: number]: number) x: number]: number (f (f x)))
 (twice sq 3)}`)
		expect(() => parse(now)).not.toThrow()
	})

	it('leaves what is written as now, or cannot be read, as it is', () => {
		for (const source of ['(=> {T} [x: T]: T x)', '(=> [x: number]: number x)', '"unclosed', '(f (g 1)']) {
			expect(withFunctionsAsNow(source)).toBe(source)
		}
	})
})

describe('fromOlderSyntax', () => {
	it('has functions written as now before it reads keywords and paths', () => {
		expect(now('{f = (=> (x: number k: number): number (+ x k)) (f 1 k=2)}')).toBe(
			'{f = (=> [x: number k: number]: number (+ x k)) (f 1 k: 2)}'
		)
	})
})
