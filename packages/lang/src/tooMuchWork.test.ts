import { describe, expect, it } from 'vitest'

import { buildPrelude, evaluate, parse } from './index.js'

const env = buildPrelude()
const doubling = (n: number) =>
	`{f = (=> [n: number]: number (? (== n 0) true 1 _ (+ (f (- n 1)) (f (- n 1)))))  (f ${n})}`
const messages = (src: string) => evaluate(parse(src), env).diagnostics.map(({ message }) => message)

describe('a recursion that branches', () => {
	it('works out as usual, while there is not too much of it', () => {
		expect(evaluate(parse(doubling(10)), env).value).toBe(1024)
		expect(messages(doubling(10))).toEqual([])
	})

	it('comes to nothing, rather than going on for longer than anyone can wait', () => {
		const ast = parse(doubling(60))
		const { value, diagnostics } = evaluate(ast, env)
		expect(typeof value).toBe('symbol')
		expect(diagnostics.map(({ message }) => message)).toEqual(['too much to work out'])
		// Not by finding it out again.
		expect(evaluate(ast, env).value).toBe(value)
	})

	it('leaves what comes after it to work out', () => {
		evaluate(parse(doubling(60)), env)
		expect(evaluate(parse(doubling(10)), env).value).toBe(1024)
		expect(evaluate(parse('{a = b  b = 1  a}'), env).value).toBe(1)
	})
})
