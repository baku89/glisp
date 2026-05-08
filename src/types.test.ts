import { describe, expect, it } from 'vitest'

import {
	type AST,
	isCall,
	isLit,
	isSym,
	UNIT,
} from './types.js'

describe('AST types — smoke', () => {
	it('discriminates by kind', () => {
		const lit: AST = { kind: 'lit', value: 42 }
		const sym: AST = { kind: 'sym', name: 'x' }
		const call: AST = {
			kind: 'call',
			head: { kind: 'sym', name: '+' },
			args: [
				{ kind: 'lit', value: 1 },
				{ kind: 'lit', value: 2 },
			],
		}

		expect(isLit(lit)).toBe(true)
		expect(isSym(lit)).toBe(false)

		expect(isSym(sym)).toBe(true)
		expect(isCall(sym)).toBe(false)

		expect(isCall(call)).toBe(true)
		if (isCall(call)) {
			expect(call.args).toHaveLength(2)
		}
	})

	it('UNIT is a stable Symbol across module boundaries', () => {
		expect(UNIT).toBe(Symbol.for('glisp.unit'))
		expect(typeof UNIT).toBe('symbol')
	})

	it('lit accepts number, string, boolean, and unit', () => {
		const n: AST = { kind: 'lit', value: 42 }
		const s: AST = { kind: 'lit', value: 'hello' }
		const b: AST = { kind: 'lit', value: true }
		const u: AST = { kind: 'lit', value: UNIT }

		for (const x of [n, s, b, u]) {
			expect(isLit(x)).toBe(true)
		}
	})
})
