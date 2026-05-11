import { describe, expect, it } from 'vitest'

import { evaluate, IO, isTypeValue } from './eval.js'
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

	it('+ requires at least one arg', () => {
		const r = evaluate(parse('(+)'), env)
		expect(
			r.diagnostics.some(d => d.message.includes('missing argument'))
		).toBe(true)
		expect(evaluate(parse('(+ 7)'), env).value).toBe(7)
		expect(evaluate(parse('(+ 1 2 3 4 5)'), env).value).toBe(15)
	})

	it('* requires at least one arg', () => {
		const r = evaluate(parse('(*)'), env)
		expect(
			r.diagnostics.some(d => d.message.includes('missing argument'))
		).toBe(true)
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

	it('< chains pairwise; zero args is rejected', () => {
		expect(evaluate(parse('(< 1 2 3 4)'), env).value).toBe(true)
		expect(evaluate(parse('(< 1 3 2)'), env).value).toBe(false)
		expect(evaluate(parse('(< 5)'), env).value).toBe(true) // vacuously true (no pairs)
		const r = evaluate(parse('(<)'), env)
		expect(
			r.diagnostics.some(d => d.message.includes('missing argument'))
		).toBe(true)
	})

	it('== / != chain over arbitrary values', () => {
		expect(evaluate(parse('(== 1 1 1)'), env).value).toBe(true)
		expect(evaluate(parse('(== 1 1 2)'), env).value).toBe(false)
		expect(evaluate(parse('(!= 1 2 3)'), env).value).toBe(true)
		expect(evaluate(parse('(!= 1 2 2)'), env).value).toBe(false)
	})
})

describe('prelude — higher-order functions', () => {
	const env = buildPrelude()

	it('map applies fn elementwise', () => {
		const r = evaluate(
			parse('(map [1 2 3 4] (=> (x: number): number (* x x)))'),
			env
		)
		expect(r.value).toEqual([1, 4, 9, 16])
	})

	it('filter retains elements where pred is truthy', () => {
		const r = evaluate(
			parse('(filter [1 2 3 4 5] (=> (x: number): boolean (> x 2)))'),
			env
		)
		expect(r.value).toEqual([3, 4, 5])
	})

	it('reduce folds left-to-right with init', () => {
		const r = evaluate(
			parse(
				'(reduce [1 2 3 4 5] 0 (=> (a: number b: number): number (+ a b)))'
			),
			env
		)
		expect(r.value).toBe(15)
	})
})

describe('prelude — type constructors', () => {
	const env = buildPrelude()

	it('@ coerces an enum member through to its value', () => {
		;(evaluate(parse('(def "C" (enum "r" "g" "b"))'), env)
			.value as IO).run()
		expect(evaluate(parse('(@ C "g")'), env).value).toBe('g')
	})

	it('@ on a non-member falls back to the first listed value', () => {
		;(evaluate(parse('(def "C" (enum "r" "g" "b"))'), env)
			.value as IO).run()
		const r = evaluate(parse('(@ C "purple")'), env)
		expect(r.value).toBe('r')
		expect(
			r.diagnostics.some(d => d.message.includes("doesn't accept"))
		).toBe(true)
	})

	it('refine narrows base type via @', () => {
		;(evaluate(
			parse(
				'(def "Pos" (refine number 1 (=> (x: number): boolean (> x 0))))'
			),
			env
		).value as IO).run()
		expect(evaluate(parse('(@ Pos 5)'), env).value).toBe(5)
		const fail = evaluate(parse('(@ Pos -3)'), env)
		expect(fail.value).toBe(1) // declared default
		expect(
			fail.diagnostics.some(d => d.message.includes("doesn't accept"))
		).toBe(true)
	})
})

describe('prelude — standard library', () => {
	const env = buildPrelude()

	it('range generates ascending and descending sequences', () => {
		expect(evaluate(parse('(range 0 5)'), env).value).toEqual([0, 1, 2, 3, 4])
		expect(evaluate(parse('(range 5 0)'), env).value).toEqual([5, 4, 3, 2, 1])
	})

	it('size dispatches between vector and string', () => {
		expect(evaluate(parse('(size [1 2 3])'), env).value).toBe(3)
		expect(evaluate(parse('(size "hello")'), env).value).toBe(5)
	})

	it('concat is variadic over both vectors and strings', () => {
		expect(evaluate(parse('(concat [1 2] [3 4] [5])'), env).value).toEqual([
			1, 2, 3, 4, 5,
		])
		expect(evaluate(parse('(concat "foo" "bar")'), env).value).toBe('foobar')
	})

	it('slice over vectors and strings', () => {
		expect(
			evaluate(parse('(slice [10 20 30 40 50] 1 4)'), env).value
		).toEqual([20, 30, 40])
		expect(evaluate(parse('(slice "abcdef" 2 5)'), env).value).toBe('cde')
	})

	it('math primitives', () => {
		expect(evaluate(parse('(mod 10 3)'), env).value).toBe(1)
		expect(evaluate(parse('(pow 2 10)'), env).value).toBe(1024)
		expect(evaluate(parse('(sqrt 16)'), env).value).toBe(4)
		expect(evaluate(parse('(floor 3.7)'), env).value).toBe(3)
		expect(evaluate(parse('(ceil 3.2)'), env).value).toBe(4)
		expect(evaluate(parse('pi'), env).value).toBe(Math.PI)
	})

	it('record ops', () => {
		expect(evaluate(parse('(keys {x: 1 y: 2})'), env).value).toEqual([
			'x',
			'y',
		])
		expect(evaluate(parse('(values {x: 1 y: 2})'), env).value).toEqual([
			1, 2,
		])
		expect(evaluate(parse('(merge {x: 1} {y: 2})'), env).value).toEqual({
			x: 1,
			y: 2,
		})
	})

	it('string ops', () => {
		expect(
			evaluate(parse('(starts-with "hello world" "hello")'), env).value
		).toBe(true)
		expect(evaluate(parse('(split "a,b,c" ",")'), env).value).toEqual([
			'a',
			'b',
			'c',
		])
		expect(evaluate(parse('(join ["a" "b" "c"] "-")'), env).value).toBe(
			'a-b-c'
		)
	})
})

describe('prelude — parametric IO', () => {
	it('(IO T) evaluates to a parametric type with payload T', () => {
		const env = buildPrelude()
		const r = evaluate(parse('(IO number)'), env)
		expect(isTypeValue(r.value) && r.value.typeName).toBe('(IO number)')
	})

	it('bare IO is sugar for (IO _) and is reused, parametric forms are fresh', () => {
		const env = buildPrelude()
		const bare = evaluate(parse('IO'), env).value
		const ioNum = evaluate(parse('(IO number)'), env).value
		expect(isTypeValue(bare) && bare.typeName).toBe('IO')
		expect(isTypeValue(ioNum) && ioNum.typeName).toBe('(IO number)')
		expect(bare).not.toBe(ioNum)
	})

	it('(IO number) prints as a call, so REPL output round-trips', () => {
		const env = buildPrelude()
		const r = evaluate(parse('(IO number)'), env)
		// toAst path: parametric IO → CallAST(IO, [number]) → "(IO number)"
		expect(r.diagnostics).toHaveLength(0)
	})

	it('rejects wrong arity', () => {
		const env = buildPrelude()
		const r = evaluate(parse('(IO number string)'), env)
		expect(
			r.diagnostics.some(d => d.message.includes('1 type argument'))
		).toBe(true)
	})

	it('rejects non-type arguments', () => {
		const env = buildPrelude()
		const r = evaluate(parse('(IO 42)'), env)
		expect(
			r.diagnostics.some(d => d.message.includes('expects type arguments'))
		).toBe(true)
	})
})

describe('prelude — :type signature display via infer', () => {
	const env = buildPrelude()

	it('infer(+) yields a function-type with required first arg + variadic tail', () => {
		const t = infer(parse('+'), env)
		expect(t?.typeName).toBe('(=> (first: number ...rest: number): number)')
	})

	it('infer(==) returns boolean-typed predicate', () => {
		const t = infer(parse('=='), env)
		expect(t?.typeName).toBe('(=> (first: _ ...rest: _): boolean)')
	})

	it('infer of a fn literal renders its signature', () => {
		const t = infer(parse('(=> (n: number): number (* n 2))'), env)
		expect(t?.typeName).toBe('(=> (n: number): number)')
	})
})
