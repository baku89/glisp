import { describe, expect, it } from 'vitest'

import {
	access,
	call,
	callKw,
	lit,
	meta,
	path,
	quote,
	record,
	splice,
	sym,
	unquote,
	vec,
} from './build.js'
import { isAccess, isCall, isLit, isMeta, isPath, isRecord, isVec, UNIT } from './types.js'

describe('AST builders', () => {
	it('lit returns LitAST with the given value', () => {
		expect(lit(42)).toEqual({ kind: 'lit', value: 42 })
		expect(lit('hi')).toEqual({ kind: 'lit', value: 'hi' })
		expect(lit(true)).toEqual({ kind: 'lit', value: true })
		expect(lit(UNIT)).toEqual({ kind: 'lit', value: UNIT })
	})

	it('sym returns SymAST with the given name', () => {
		expect(sym('+')).toEqual({ kind: 'sym', name: '+' })
		expect(sym('foo-bar')).toEqual({ kind: 'sym', name: 'foo-bar' })
	})

	it('call composes head and positional args', () => {
		// (+ 1 2)
		const ast = call(sym('+'), lit(1), lit(2))
		expect(isCall(ast)).toBe(true)
		expect(ast.head).toEqual(sym('+'))
		expect(ast.args).toHaveLength(2)
		expect(ast.kwargs).toBeUndefined()
	})

	it('callKw includes keyword arguments', () => {
		// (f 1 2 a=10 b=20)
		const ast = callKw(sym('f'), [lit(1), lit(2)], { a: lit(10), b: lit(20) })
		expect(ast.kwargs).toBeDefined()
		expect(ast.kwargs?.get('a')).toEqual(lit(10))
		expect(ast.kwargs?.get('b')).toEqual(lit(20))
	})

	it('access produces accessor sugar AST', () => {
		// point.x
		const ast = access(sym('point'), 'x')
		expect(isAccess(ast)).toBe(true)
		expect(ast.target).toEqual(sym('point'))
		expect(ast.key).toBe('x')

		// arr.2
		const idx = access(sym('arr'), 2)
		expect(idx.key).toBe(2)
	})

	it('access chains via nesting (left-associative)', () => {
		// x.key.bar
		const ast = access(access(sym('x'), 'key'), 'bar')
		expect(isAccess(ast)).toBe(true)
		expect(isAccess(ast.target)).toBe(true)
	})

	it('vec composes elements in order', () => {
		const ast = vec(lit(1), lit(2), lit(3))
		expect(isVec(ast)).toBe(true)
		expect(ast.elements).toHaveLength(3)
	})

	it('record preserves insertion order', () => {
		// {x: 10 y: 20}
		const ast = record({ x: lit(10), y: lit(20) })
		expect(isRecord(ast)).toBe(true)
		expect([...ast.fields.keys()]).toEqual(['x', 'y'])
		expect(ast.fields.get('x')).toEqual(lit(10))
	})

	it('path encodes segments including ".."', () => {
		// ./foo
		expect(path('foo').segments).toEqual(['foo'])
		// ../foo
		expect(path('..', 'foo').segments).toEqual(['..', 'foo'])
		// ../../a
		expect(path('..', '..', 'a').segments).toEqual(['..', '..', 'a'])
		// ./
		expect(path().segments).toEqual([])
		// ../vec/0  (mixed name and index)
		expect(path('..', 'vec', 0).segments).toEqual(['..', 'vec', 0])
	})

	it('quote, unquote, splice wrap an expression', () => {
		const x = sym('x')
		expect(quote(x)).toEqual({ kind: 'quote', expr: x })
		expect(unquote(x)).toEqual({ kind: 'unquote', expr: x })
		expect(splice(x)).toEqual({ kind: 'splice', expr: x })
	})

	it('meta wraps an expression with a metadata record', () => {
		const m = record({ label: lit('Width') })
		const ast = meta(m, lit(100))
		expect(isMeta(ast)).toBe(true)
		expect(ast.meta).toBe(m)
	})

	it('produces an AST equivalent to (+ 1 2) end-to-end', () => {
		const expected = {
			kind: 'call',
			head: { kind: 'sym', name: '+' },
			args: [
				{ kind: 'lit', value: 1 },
				{ kind: 'lit', value: 2 },
			],
		}
		expect(call(sym('+'), lit(1), lit(2))).toEqual(expected)
	})
})
