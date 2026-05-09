import { describe, expect, it } from 'vitest'

import { evaluate, isTypeValue } from './eval.js'
import { infer } from './infer.js'
import { parse } from './parse.js'
import { buildPrelude } from './prelude.js'

describe('prelude — primitive types', () => {
	it('binds top as `_` and bottom as `!`', () => {
		const env = buildPrelude()
		const top = evaluate(parse('_'), env).value
		expect(isTypeValue(top) && top.typeName).toBe('_')
		const bot = evaluate(parse('!'), env).value
		expect(isTypeValue(bot) && bot.typeName).toBe('!')
	})

	it('binds primitives by name', () => {
		const env = buildPrelude()
		for (const name of ['number', 'string', 'boolean', 'unit', 'IO']) {
			const v = evaluate(parse(name), env).value
			expect(isTypeValue(v) && v.typeName).toBe(name)
		}
	})
})

describe('prelude — arithmetic (variadic)', () => {
	const env = buildPrelude()

	it('+ folds with identity 0', () => {
		expect(evaluate(parse('(+)'), env).value).toBe(0)
		expect(evaluate(parse('(+ 7)'), env).value).toBe(7)
		expect(evaluate(parse('(+ 1 2 3 4 5)'), env).value).toBe(15)
	})

	it('* folds with identity 1', () => {
		expect(evaluate(parse('(*)'), env).value).toBe(1)
		expect(evaluate(parse('(* 5)'), env).value).toBe(5)
		expect(evaluate(parse('(* 2 3 4)'), env).value).toBe(24)
	})

	it('- left-folds; unary negates', () => {
		expect(evaluate(parse('(- 5)'), env).value).toBe(-5)
		expect(evaluate(parse('(- 10 1 2 3)'), env).value).toBe(4)
	})

	it('/ left-folds; unary reciprocates', () => {
		expect(evaluate(parse('(/ 4)'), env).value).toBe(0.25)
		expect(evaluate(parse('(/ 100 2 5)'), env).value).toBe(10)
	})

	it('coerces non-number args via the variadic tail type', () => {
		const r = evaluate(parse('(+ 1 "str" 3)'), env)
		expect(r.value).toBe(4) // 1 + 0 (default) + 3
		expect(
			r.diagnostics.some(d => d.message.includes('type mismatch'))
		).toBe(true)
	})
})

describe('prelude — comparison (chain)', () => {
	const env = buildPrelude()

	it('< chains pairwise', () => {
		expect(evaluate(parse('(< 1 2 3 4)'), env).value).toBe(true)
		expect(evaluate(parse('(< 1 3 2)'), env).value).toBe(false)
		expect(evaluate(parse('(<)'), env).value).toBe(true)
	})

	it('== / != chain over arbitrary values', () => {
		expect(evaluate(parse('(== 1 1 1)'), env).value).toBe(true)
		expect(evaluate(parse('(== 1 1 2)'), env).value).toBe(false)
		expect(evaluate(parse('(!= 1 2 3)'), env).value).toBe(true)
		expect(evaluate(parse('(!= 1 2 2)'), env).value).toBe(false)
	})
})

describe('prelude — :type signature display via infer', () => {
	const env = buildPrelude()

	it('infer(+) yields a function-type with variadic tail', () => {
		const t = infer(parse('+'), env)
		expect(t?.typeName).toBe('(=> (...rest: number): number)')
	})

	it('infer(==) returns boolean-typed predicate', () => {
		const t = infer(parse('=='), env)
		expect(t?.typeName).toBe('(=> (...rest: _): boolean)')
	})

	it('infer of a fn literal renders its signature', () => {
		const t = infer(parse('(=> (n: number): number (* n 2))'), env)
		expect(t?.typeName).toBe('(=> (n: number): number)')
	})
})
