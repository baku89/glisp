import { describe, expect, it } from 'vitest'

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
