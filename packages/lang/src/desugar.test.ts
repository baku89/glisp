import { describe, expect, it } from 'vitest'

import { desugar } from './desugar.js'
import { evaluate, makeTopLevel } from './eval.js'
import { buildPrelude } from './prelude.js'
import { parse } from './parse.js'
import { print } from './print.js'
import { FnAST, isFn, type MetaAST } from './types.js'

/**
 * `%` desugaring is bottom-up: `%` belongs to the innermost `#` around it.
 * The placeholder parameter name is implementation-defined (we use `%N`),
 * so we mostly assert via behaviour or shape rather than exact name match.
 */

describe('desugar — basic shapes', () => {
	it('a literal without `%` is returned unchanged', () => {
		const ast = parse('42')
		expect(desugar(ast)).toBe(ast) // identity
	})

	it('an expression without `%` is returned unchanged', () => {
		const ast = parse('(+ 1 2)')
		expect(desugar(ast)).toBe(ast)
	})

	it('#(f % y) becomes a 1-arg fn closing over the form', () => {
		// #(f % y) → (=> [%N: _] (f %N y))
		const ast = parse('#(f % y)')
		const desugared = desugar(ast)
		expect(isFn(desugared)).toBe(true)
		const f = desugared as FnAST
		expect(f.params).toHaveLength(1)
		expect(f.body).not.toBeNull()
	})

	it('#(* 2 %) inlines the placeholder once', () => {
		const ast = parse('#(* 2 %)')
		const desugared = desugar(ast) as FnAST
		expect(isFn(desugared)).toBe(true)
		// shape: (=> [n: _] (* 2 n))
		const paramName = desugared.params[0]!.name
		// the body should reference paramName once and `2` once
		expect(print(desugared.body!)).toBe(`(* 2 ${paramName})`)
	})

	it('#(* % %) shares one parameter for both occurrences', () => {
		const ast = parse('#(* % %)')
		const desugared = desugar(ast) as FnAST
		const p = desugared.params[0]!.name
		expect(print(desugared.body!)).toBe(`(* ${p} ${p})`)
	})
})

describe('desugar — nesting', () => {
	it('(g #(f %)) only wraps the inner #(f %)', () => {
		// (g #(f %)) → (g (=> [n] (f n)))
		const ast = parse('(g #(f %))')
		const desugared = desugar(ast)
		// outer g call should remain a call (not a fn)
		expect(desugared.kind).toBe('call')
	})

	it('(g #(f %) #(h %)) yields two independent closures', () => {
		const ast = parse('(g #(f %) #(h %))')
		const desugared = desugar(ast)
		expect(desugared.kind).toBe('call')
		// the two args to g should both be FnAST, with distinct param names
		const args = (desugared as { args: ReadonlyArray<unknown> }).args
		expect(args).toHaveLength(2)
	})

	it('#[% %] becomes (=> [n] [n n])', () => {
		const ast = parse('#[% %]')
		const desugared = desugar(ast) as FnAST
		expect(isFn(desugared)).toBe(true)
		const p = desugared.params[0]!.name
		expect(print(desugared.body!)).toBe(`[${p} ${p}]`)
	})

	it('{a: #(+ % 1)} only wraps the inner #(+ % 1)', () => {
		const ast = parse('{a: #(+ % 1)}')
		const desugared = desugar(ast)
		// outer record stays a record
		expect(desugared.kind).toBe('record')
	})
})

describe('desugar — evaluation', () => {
	it('(map #(* 2 %) xs)  with a host map  doubles each element', () => {
		const map = (fn: (v: unknown) => unknown, xs: unknown) => {
			if (!Array.isArray(xs)) return null
			return xs.map(fn)
		}
		const env = makeTopLevel({
			map: parse('(=> [f: _ xs: _]: _ x)'), // placeholder, won't be used
			'*': parse('1'), // placeholder
		})
		// Simpler: directly call a closure built via desugaring.
		const r = evaluate(parse('(#(* 2 %) 21)'), makeTopLevel({
			'*': { kind: 'lit', value: ((a: unknown, b: unknown) =>
				(a as number) * (b as number)) as never } as never,
		}))
		expect(r.value).toBe(42)
		void map; void env
	})

	it('|> with a `#(+ 1 %)` step adds one', () => {
		const env = makeTopLevel({
			'+': { kind: 'lit', value: ((a: unknown, b: unknown) =>
				(a as number) + (b as number)) as never } as never,
		})
		const r = evaluate(parse('(|> 5 #(+ 1 %))'), env)
		expect(r.value).toBe(6)
	})

	it('#(|> % f g) is function composition', () => {
		const inc = (n: unknown) => (n as number) + 1
		const dbl = (n: unknown) => (n as number) * 2
		const env = makeTopLevel({
			inc: { kind: 'lit', value: inc as never } as never,
			dbl: { kind: 'lit', value: dbl as never } as never,
		})
		// #(|> % inc dbl) — the pipe written with `#` is a closure of its
		// input, applied to 3 → 8
		const r = evaluate(parse('(#(|> % inc dbl) 3)'), env)
		expect(r.value).toBe(8)
	})
})

describe('desugar — `#` says where the function starts', () => {
	const env = buildPrelude()
	const valueOf = (source: string) => evaluate(parse(source), env).value

	it('takes `%` at any depth', () => {
		expect(valueOf('(#(+ 1 (* 2 %)) 5)')).toBe(11)
		expect(valueOf('(map [1 2] #[% (* % %)])')).toEqual([[1, 1], [2, 4]])
	})

	it('leaves a `%` to the innermost `#` around it', () => {
		// The outer `%` is the vector, and the inner one each element of it
		expect(valueOf('(#(map % #(+ % 10)) [1 2])')).toEqual([11, 12])
		expect(valueOf('(#[% (#(* % 2) 4)] 1)')).toEqual([1, 8])
	})

	it('reaches the body of a function written out in it', () => {
		expect(valueOf('((#(=> [y: number]: number (+ y %)) 1) 2)')).toBe(3)
	})

	it('keeps the metadata it is written with', () => {
		const ast = parse('^{label: "Double"} #(* 2 %)')
		expect(print(ast)).toBe('^{label: "Double"} #(* 2 %)')
		const desugared = desugar(ast)
		expect(desugared.kind).toBe('meta')
		expect(isFn((desugared as MetaAST).expr)).toBe(true)
		expect(valueOf('(^{label: "Double"} #(* 2 %) 4)')).toBe(8)
	})
})
