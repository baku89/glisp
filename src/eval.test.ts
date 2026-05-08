import { describe, expect, it } from 'vitest'

import { lit, sym } from './build.js'
import { emptyEnv, evaluate, makeTopLevel } from './eval.js'
import { UNIT } from './types.js'

describe('evaluate — literals', () => {
	it('number / string / boolean / unit pass through', () => {
		expect(evaluate(lit(42), emptyEnv).value).toBe(42)
		expect(evaluate(lit('hello'), emptyEnv).value).toBe('hello')
		expect(evaluate(lit(true), emptyEnv).value).toBe(true)
		expect(evaluate(lit(UNIT), emptyEnv).value).toBe(UNIT)
	})

	it('emits no diagnostics for literals', () => {
		expect(evaluate(lit(42), emptyEnv).diagnostics).toEqual([])
	})
})

describe('evaluate — bare-name lookup', () => {
	it('resolves a name from the env', () => {
		const env = makeTopLevel({
			pi: lit(3.14),
			greeting: lit('hi'),
		})
		expect(evaluate(sym('pi'), env).value).toBe(3.14)
		expect(evaluate(sym('greeting'), env).value).toBe('hi')
	})

	it('returns unit + diagnostic for unresolvable name', () => {
		const r = evaluate(sym('nope'), emptyEnv)
		expect(r.value).toBe(UNIT)
		expect(r.diagnostics).toHaveLength(1)
		expect(r.diagnostics[0]?.level).toBe('error')
		expect(r.diagnostics[0]?.message).toContain('nope')
	})

	it('looks up across multiple bindings', () => {
		const env = makeTopLevel({
			a: lit(1),
			b: lit(2),
			c: lit(3),
		})
		expect(evaluate(sym('b'), env).value).toBe(2)
	})

	it('chases through name → name (one level)', () => {
		// alias = pi, pi = 3.14   →   eval(alias) ≡ 3.14
		const env = makeTopLevel({
			pi: lit(3.14),
			alias: sym('pi'),
		})
		expect(evaluate(sym('alias'), env).value).toBe(3.14)
	})
})

describe('evaluate — placeholder for unimplemented forms', () => {
	it('reports a diagnostic when the AST kind is not yet handled', () => {
		// `(+ 1 2)` — call is not implemented in the skeleton
		const ast = { kind: 'call' as const, head: sym('+'), args: [lit(1), lit(2)] } as never
		const r = evaluate(ast, emptyEnv)
		expect(r.value).toBe(UNIT)
		expect(r.diagnostics[0]?.message).toContain('call')
	})
})
