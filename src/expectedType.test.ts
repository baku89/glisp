import { describe, expect, it } from 'vitest'

import { evaluate, IO } from './eval.js'
import { expectedTypeAt } from './expectedType.js'
import { parse } from './parse.js'
import { buildPrelude } from './prelude.js'
import type { CallAST, FnAST } from './types.js'

describe('expectedTypeAt — call positions', () => {
	const env = buildPrelude()

	it('positional arg of a typed host fn', () => {
		const call = parse('(+ 1 2)') as CallAST
		const t = expectedTypeAt(call, 0, env)
		expect(t?.typeName).toBe('number')
	})

	it('variadic tail beyond declared params', () => {
		// `+` has empty paramTypes and variadicTail = number.
		// Slot 5 should still report `number`.
		const call = parse('(+ 1 2)') as CallAST
		const t = expectedTypeAt(call, 5, env)
		expect(t?.typeName).toBe('number')
	})

	it('kwarg name resolves to its declared type', () => {
		// `not` has paramNames undefined → no kwarg slot. Use a closure
		// where param names are intrinsic.
		const call = parse(
			'((=> (a: number b: string): _ a) 1 b="x")'
		) as CallAST
		const tA = expectedTypeAt(call, 'a', env)
		expect(tA?.typeName).toBe('number')
		const tB = expectedTypeAt(call, 'b', env)
		expect(tB?.typeName).toBe('string')
	})

	it('cast through a TypeValue: slot 0 is the type itself', () => {
		const call = parse('(number 42)') as CallAST
		const t = expectedTypeAt(call, 0, env)
		expect(t?.typeName).toBe('number')
	})
})

describe('expectedTypeAt — fn signature slots', () => {
	const env = buildPrelude()

	it('return slot', () => {
		const fn = parse('(=> (n: number): string (show n))') as FnAST
		const t = expectedTypeAt(fn, 'return', env)
		expect(t?.typeName).toBe('string')
	})

	it('param slot', () => {
		const fn = parse('(=> (n: number m: string): _ ())') as FnAST
		const t0 = expectedTypeAt(fn, 'param:0', env)
		const t1 = expectedTypeAt(fn, 'param:1', env)
		expect(t0?.typeName).toBe('number')
		expect(t1?.typeName).toBe('string')
	})
})

describe('expectedTypeAt — edge cases', () => {
	const env = buildPrelude()

	it('out-of-range positional slot returns null (non-variadic head)', () => {
		// `not` has paramTypes [boolean] and no variadic tail. Slot 5 is null.
		const call = parse('(not true)') as CallAST
		expect(expectedTypeAt(call, 5, env)).toBeNull()
	})

	it('unknown kwarg name returns null', () => {
		const call = parse(
			'((=> (a: number): _ a) 1 b="x")'
		) as CallAST
		expect(expectedTypeAt(call, 'nope', env)).toBeNull()
	})

	it('out-of-range fn param:N returns null', () => {
		const fn = parse('(=> (n: number): _ n)') as FnAST
		expect(expectedTypeAt(fn, 'param:99', env)).toBeNull()
		expect(expectedTypeAt(fn, 'param:invalid', env)).toBeNull()
	})

	it('vec / record parents have no type context', () => {
		const v = parse('[1 2 3]')
		expect(expectedTypeAt(v, 0, env)).toBeNull()
		const r = parse('{x: 1}')
		expect(expectedTypeAt(r, 'x', env)).toBeNull()
	})

	it('overload head: no per-variant routing yet (returns null)', () => {
		const env2 = buildPrelude()
		const def = parse(
			'(def "f" (overload (=> (n: number): _ n) (=> (s: string): _ s)))'
		)
		;(evaluate(def, env2).value as IO).run()
		const call = parse('(f 1)') as CallAST
		expect(expectedTypeAt(call, 0, env2)).toBeNull()
	})
})
