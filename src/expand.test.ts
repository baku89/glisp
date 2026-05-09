import { describe, expect, it } from 'vitest'

import { evaluate, IO } from './eval.js'
import { expand } from './expand.js'
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
})
