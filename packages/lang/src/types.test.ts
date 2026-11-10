import { describe, expect, it } from 'vitest'

import {
	type AST,
	type Diagnostic,
	type Env,
	type Frame,
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

describe('Env / Frame — smoke', () => {
	it('null is a valid env (root sentinel)', () => {
		const env: Env = null
		expect(env).toBeNull()
	})

	it('frame chains through parent', () => {
		const root: Frame = {
			ast: { kind: 'lit', value: UNIT },
			parent: null,
		}
		const child: Frame = {
			ast: { kind: 'sym', name: 'x' },
			parent: root,
		}
		expect(child.parent).toBe(root)
		expect(root.parent).toBeNull()
	})
})

describe('Diagnostic — smoke', () => {
	it('carries level, message, and source evaluation node', () => {
		const ast: AST = { kind: 'sym', name: 'unknown' }
		const d: Diagnostic = {
			level: 'error',
			message: 'unresolvable name',
			source: { ast, env: null },
		}
		expect(d.level).toBe('error')
		expect(d.source.ast).toBe(ast)
	})
})

describe('a host type that takes the values of another as its own', () => {
	it('is fitted by that type, and not the other way', async () => {
		const { makeType, typeFits } = await import('./eval')
		class Box {}
		class Shape {}
		const box = makeType('box', v => v instanceof Box, new Box())
		const shape = { ...makeType('shape', v => v instanceof Shape || v instanceof Box, new Shape()), includes: () => [box] }
		expect(typeFits(box, shape)).toBe(true)
		expect(typeFits(shape, box)).toBe(false)
	})
})
