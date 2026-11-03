import { beforeEach, describe, expect, it } from 'vitest'

import { evaluate } from './eval.js'
import { expand, expandLadder } from './expand.js'
import { parse } from './parse.js'
import { buildPrelude } from './prelude.js'
import { print } from './print.js'
import { Session } from './session.js'
import type { Env } from './types.js'

describe('expand', () => {
	let session: Session
	let env: () => Env

	const define = (...sources: string[]): void => {
		for (const src of sources) session.evalSrc(src)
	}
	const step = (src: string): string =>
		print(expand(parse(src), env()))
	const ladder = (src: string): string[] =>
		expandLadder(parse(src), env()).map(print)

	const REPEAT =
		'repeat = (=> (T) (v: T n: number): [...T] (? (== n 0) true [] _ [v ...(repeat v (- n 1))]))'

	beforeEach(() => {
		session = new Session(buildPrelude())
		env = () => session.env
	})

	describe('function body as the next rung', () => {
		it('leaves non-calls and host calls as fixed points', () => {
			for (const src of ['42', '(+ 1 2)', '(: 1 number)']) {
				const ast = parse(src)
				expect(expand(ast, env())).toBe(ast)
			}
		})

		it('replaces parameters with the argument expressions', () => {
			define('sq = (=> (x: number): number (* x x))')
			expect(step('(sq (+ 1 1))')).toBe('(* (+ 1 1) (+ 1 1))')
		})

		it('follows a chain of abstractions down to the host call', () => {
			define(
				'ellipse = (=> (c: _ r: _): _ (path c r))',
				'circle = (=> (c: _ r: number): _ (ellipse c [r r]))'
			)
			expect(ladder('(circle [0 0] 10)')).toEqual([
				'(circle [0 0] 10)',
				'(ellipse [0 0] [10 10])',
				'(path [0 0] [10 10])',
			])
		})

		it('binds keyword, variadic, and missing arguments', () => {
			define(
				'sub = (=> (a: number b: number): number (- a b))',
				'sum = (=> (...xs: number): number (+ ...xs))'
			)
			expect(step('(sub b=1 a=5)')).toBe('(- 5 1)')
			expect(step('(sum 1 2 3)')).toBe('(+ ...[1 2 3])')
			expect(step('(sub 7)')).toBe('(- 7 ())')
		})
	})

	describe('? at the tail of a body', () => {
		it('resolves within the step', () => {
			define('pick = (=> (b: boolean): number (? b true 1 _ 2))')
			expect(step('(pick true)')).toBe('1')
			expect(step('(pick false)')).toBe('2')
		})

		it('steps a bare ? to its selected clause, or to unit', () => {
			expect(step('(? 1 string "s" number (+ 1 1))')).toBe('(+ 1 1)')
			expect(step('(? 1 string "s")')).toBe('()')
		})
	})

	describe('~', () => {
		it('~x forces the argument', () => {
			define('sq = (=> (x: number): number (* ~x ~x))')
			expect(step('(sq (+ 1 1))')).toBe('(* 2 2)')
		})

		it('computes the count and keeps the base as written', () => {
			define(
				REPEAT,
				'pow = (=> (x: number a: number): number (* ...~(repeat x a)))'
			)
			expect(ladder('(pow (+ 1 1) (+ 1 2))')).toEqual([
				'(pow (+ 1 1) (+ 1 2))',
				'(* (+ 1 1) (+ 1 1) (+ 1 1))',
			])
			expect(evaluate(parse('(pow (+ 1 1) (+ 1 2))'), env()).value).toBe(8)
		})

		it('hides recursion that the body would otherwise show', () => {
			define(
				REPEAT,
				'plainpow = (=> (x: number a: number): number (* ...(repeat x a)))'
			)
			expect(step('(plainpow 2 3)')).toBe('(* ...(repeat 2 3))')
		})

		it('computes values that a host function needs', () => {
			define(
				'segments = (=> (r: number): _ [[r 0] [0 (* r 2)]])',
				'shape = (=> (r: number): _ (path ...~(segments r)))'
			)
			expect(step('(shape (+ 1 1))')).toBe('(path [(+ 1 1) 0] [0 4])')
		})

		it('waits for a clause of a nested ? to be selected', () => {
			define('f = (=> (b: boolean): _ [(? b true ~(+ 1 1) _ 0)])')
			expect(step('(f true)')).toBe('[(? true true ~(+ 1 1) _ 0)]')
		})

		it('is transparent to evaluate, including ...~', () => {
			const value = (src: string): unknown => evaluate(parse(src), env()).value
			expect(value('~(+ 1 1)')).toBe(2)
			expect(value('[0 ...~[1 2] 3]')).toEqual([0, 1, 2, 3])
			expect(value('(+ ...~[1 2])')).toBe(3)
			expect(value('{a: 1 ...~{b: 2}}')).toEqual({ a: 1, b: 2 })
		})

		it('is transparent to paths', () => {
			expect(evaluate(parse('[10 ~./0]'), env()).value).toEqual([10, 10])
		})

		it('leaves a call unexpanded when ~ recurses without end', () => {
			define('loop = (=> (x: number): number [~(loop x)])')
			const ast = parse('(loop 1)')
			expect(expand(ast, env())).toBe(ast)
		})
	})

	describe('moving a body to the call site', () => {
		it('keeps a shadowed free name meaning its definition', () => {
			define('sq = (=> (x: number): number (* x x))')
			const program = parse('{* = (=> (a: number b: number): number 0) (sq 3)}')
			const inner = new Session(env())
			inner.setBinding('*', parse('(=> (a: number b: number): number 0)'))
			const next = expand(parse('(sq 3)'), inner.env)
			expect(evaluate(next, inner.env).value).toBe(9)
			expect(evaluate(program, env()).value).toBe(9)
		})

		it('renames a binder that would capture an argument', () => {
			define('g = (=> (x: number): number {y = 1 (+ x y)})')
			define('y = 100')
			const next = expand(parse('(g y)'), env())
			expect(print(next)).toBe('{y_1 = 1 (+ y y_1)}')
			expect(evaluate(next, env()).value).toBe(101)
		})

		it('does not replace a name rebound in the body', () => {
			define('h = (=> (x: number): number {x = 2 x})')
			expect(step('(h 1)')).toBe('{x = 2 x}')
		})

		it('keeps inner function parameters apart', () => {
			define('o = (=> (x: number): _ (+ x ((=> (x: number): number x) 99)))')
			expect(step('(o 7)')).toBe('(+ 7 ((=> (x: number): number x) 99))')
		})
	})

	describe('ladder', () => {
		it('agrees with evaluate on every rung', () => {
			define(
				REPEAT,
				'pow = (=> (x: number a: number): number (* ...~(repeat x a)))'
			)
			const rungs = expandLadder(parse('(pow 2 3)'), env())
			for (const rung of rungs) {
				expect(evaluate(rung, env()).value).toBe(8)
			}
		})

		it('respects maxSteps', () => {
			define('double = (=> (n: number): number (+ n n))')
			const rungs = expandLadder(parse('(double 7)'), env(), { maxSteps: 0 })
			expect(rungs).toHaveLength(1)
		})
	})
})
