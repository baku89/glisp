import { describe, expect, it } from 'vitest'

import { evaluate, IO } from './eval.js'
import { expand, expandLadder } from './expand.js'
import { parse } from './parse.js'
import { print } from './print.js'
import { buildPrelude } from './prelude.js'

describe('expand — naive substitution (no quasiquote)', () => {
	const env = buildPrelude()
	const def = (src: string): void => {
		const r = evaluate(parse(src), env)
		;(r.value as IO).run()
	}

	it('returns ast unchanged when not a call', () => {
		const ast = parse('42')
		expect(expand(ast, env)).toBe(ast)
	})

	it('returns ast unchanged when head is not a closure', () => {
		const ast = parse('(+ 1 2)') // + is a typed host fn, not a closure
		expect(expand(ast, env)).toBe(ast)
	})

	it('substitutes positional params in the body at level 0', () => {
		def('(def "double" (=> (n: number): number (+ n n)))')
		const expanded = expand(parse('(double 7)'), env)
		expect(print(expanded)).toBe('(+ 7 7)')
	})

	it('preserves nesting and recurses into sub-asts', () => {
		def('(def "addmul" (=> (a: number b: number): number (+ a (* b 2))))')
		const expanded = expand(parse('(addmul 3 4)'), env)
		expect(print(expanded)).toBe('(+ 3 (* 4 2))')
	})

	it('does not expand reserved special forms', () => {
		const ast = parse('(? 1 _ 2)')
		expect(expand(ast, env)).toBe(ast)
	})
})

describe('expand — quasiquote / unquote', () => {
	const env = buildPrelude()
	const def = (src: string): void => {
		const r = evaluate(parse(src), env)
		;(r.value as IO).run()
	}

	it('keeps a quoted body as a template, substituting at level 0', () => {
		// double's body: `\`(* 2 ~x)` — the `*` and `2` are data, `~x` evaluates
		def('(def "twice" (=> (x: number): _ `(* 2 ~x)))')
		// (twice 5) expands to: `(* 2 5)
		const expanded = expand(parse('(twice 5)'), env)
		expect(print(expanded)).toBe('`(* 2 5)')
	})

	it('eval(expand(ast, env), env) === eval(ast, env)', () => {
		// Quote/unquote are transparent during eval per spec, so both
		// sides reduce to the same numeric value via standard evaluation.
		def('(def "twice" (=> (x: number): number `(* 2 ~x)))')
		const lhs = evaluate(expand(parse('(twice 5)'), env), env).value
		const rhs = evaluate(parse('(twice 5)'), env).value
		expect(lhs).toBe(rhs)
		expect(lhs).toBe(10)
	})

	it('splice (...~) flattens a vector arg into the surrounding vec', () => {
		def('(def "wrap" (=> (xs: _): _ `[0 ...~xs 99]))')
		const expanded = expand(parse('(wrap [1 2 3])'), env)
		// Splice path lowers to a SpreadAST around a vec literal; eval flattens.
		const v = evaluate(expanded, env).value
		expect(v).toEqual([0, 1, 2, 3, 99])
	})

	it('nested quasiquote (level 2): one expand step decrements unquote depth by one', () => {
		// Body: ``[~~x] — two layers of quote, two layers of unquote.
		// One expand step peels one level: the outer ` stays as a literal
		// QuoteAST, the inner unquote at level 1 evaluates the substituted
		// x and reifies. The outer (level-2) unquote remains as a wrapper.
		def('(def "two" (=> (x: number): _ ``[~~x]))')
		const expanded = expand(parse('(two 5)'), env)
		expect(print(expanded)).toBe('``[~5]')
	})

	it('missing positional arg substitutes as unit literal', () => {
		def('(def "tail" (=> (a: number b: number): _ `(+ ~a ~b)))')
		const expanded = expand(parse('(tail 7)'), env)
		// `b` was missing — substitution binds it to the unit literal so
		// the body shape is preserved.
		expect(print(expanded)).toBe('`(+ 7 ())')
	})

	it('inner fn-literal shadows outer params during substitution', () => {
		// outer x and inner x are independent — the inner closure must
		// not pick up the outer caller's substitution.
		def(
			'(def "outerp" (=> (x: number): _ `(+ ~x ((=> (x: number): number x) 99))))'
		)
		const expanded = expand(parse('(outerp 7)'), env)
		// `~x` should become 7; the inner `x` reference inside the lambda
		// body must remain bare (shadowed by inner param).
		expect(print(expanded)).toBe(
			'`(+ 7 ((=> (x: number): number x) 99))'
		)
	})
})

describe('expand — ladder', () => {
	const env = buildPrelude()
	const def = (src: string): void => {
		const r = evaluate(parse(src), env)
		;(r.value as IO).run()
	}

	it('expandLadder reaches a fixed point and stops', () => {
		def('(def "double" (=> (n: number): number (+ n n)))')
		const ladder = expandLadder(parse('(double 7)'), env)
		expect(ladder.length).toBeGreaterThan(1)
		// Last entry is fixed: expand(last) === last.
		const last = ladder[ladder.length - 1]!
		expect(expand(last, env)).toBe(last)
	})

	it('expandLadder respects maxSteps', () => {
		def('(def "double" (=> (n: number): number (+ n n)))')
		const ladder = expandLadder(parse('(double 7)'), env, { maxSteps: 1 })
		expect(ladder.length).toBeLessThanOrEqual(2)
	})
})
