import { describe, expect, it } from 'vitest'

import { buildPrelude, evaluate, LetAST, parse, print } from './index.js'

const env = buildPrelude()
const valueOf = (src: string) => evaluate(parse(src), env)

/** As an edit leaves it, with the text it was written as gone. */
const printedAfresh = (src: string): string => {
	const ast = parse(src)
	return print(ast.kind === 'let' ? new LetAST(ast.bindings, ast.body) : ast)
}

describe('a vector with names in it', () => {
	it('is the block it is another way to write', () => {
		const written = parse('[a = 1 b = (+ a 1) 3]') as LetAST
		expect(written.kind).toBe('let')
		expect(written.bindings.map(([name]) => name)).toEqual(['a', 'b'])
		expect(print(written.body!)).toBe('[a b 3]')
		expect(printedAfresh('{a = 1 b = (+ a 1) [a b 3]}')).toBe('[a = 1 b = (+ a 1) 3]')
	})

	it('comes to an ordinary vector, whatever order the names are in', () => {
		expect(valueOf('[a = 1 b = (+ a 1) 3]').value).toEqual([1, 2, 3])
		expect(valueOf('[b = (+ a 1) a = 1]').value).toEqual([2, 1])
		expect(valueOf('[a = 1 b = (+ a 1) 3]').diagnostics).toEqual([])
	})

	it('nests, seeing the names around it', () => {
		expect(valueOf('{x = 2 [a = x g = [b = (+ a x)]]}').value).toEqual([2, [4]])
	})

	it('keeps what was written until it is edited', () => {
		expect(print(parse('{a = 1 [a]}'))).toBe('{a = 1 [a]}')
	})

	it('reads back as it is printed', () => {
		for (const source of [
			'[a = 1 2]',
			'[a = 1 a]',
			'[a = 1 2 b = (+ a 1)]',
			'{x = 2 [a = x]}',
			'[a = [b = 1] 2]',
			'[1 2]',
		]) {
			expect(printedAfresh(source)).toBe(source)
			expect(printedAfresh(printedAfresh(source))).toBe(source)
		}
	})

	it('is bound with the rest of the block it comes last in', () => {
		const block = parse('{x = 2 [a = x]}') as LetAST
		expect(block.bindings.map(([name]) => name)).toEqual(['x', 'a'])
		expect(print(block.body!)).toBe('[a]')
		expect(valueOf('{y = a [a = 2 y]}').value).toEqual([2, 2])
	})

	it('keeps what is only bound out of the vector, and in the block', () => {
		expect(printedAfresh('{a = 1 b = 2 [a]}')).toBe('{b = 2 [a = 1]}')
		expect(printedAfresh('{a = 1 [(+ a 1)]}')).toBe('{a = 1 [(+ a 1)]}')
	})

	it('stays apart from a block that binds the same name', () => {
		const block = parse('{a = 1 [a = 2 a]}') as LetAST
		expect(block.bindings.map(([name]) => name)).toEqual(['a'])
		expect(valueOf('{a = 1 [a = 2 a]}').value).toEqual([2, 2])
	})

	it('stays as it is where a name is said twice, as the last says what it is', () => {
		const source = '{a = 1 a = 2 [a a]}'
		expect(printedAfresh(source)).toBe(source)
		expect(valueOf(source).value).toEqual([2, 2])
	})
})
