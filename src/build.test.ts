import { describe, expect, it } from 'vitest'

import {
	access,
	call,
	callKw,
	fn,
	g,
	letBlock,
	lit,
	meta,
	path,
	quote,
	record,
	splice,
	spread,
	sym,
	unquote,
	vec,
} from './build.js'
import {
	isAccess,
	isCall,
	isFn,
	isLet,
	isLit,
	isMeta,
	isPath,
	isRecord,
	isVec,
	UNIT,
} from './types.js'

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
		expect(ast.fields.map(([k]) => k)).toEqual(['x', 'y'])
		expect(ast.get('x')).toEqual(lit(10))
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

	it('quote, unquote, spread, splice wrap an expression', () => {
		const x = sym('x')
		expect(quote(x)).toEqual({ kind: 'quote', expr: x })
		expect(unquote(x)).toEqual({ kind: 'unquote', expr: x })
		expect(spread(x)).toEqual({ kind: 'spread', expr: x })
		expect(splice(x)).toEqual({ kind: 'splice', expr: x })
	})

	it('meta wraps an expression with a metadata record', () => {
		// new shape: meta takes content directly, auto-lifting primitives
		const ast = meta({ label: 'Width', default: 100 }, lit(100))
		expect(isMeta(ast)).toBe(true)
		expect(ast.metadata.get('label')).toEqual(lit('Width'))
		expect(ast.metadata.get('default')).toEqual(lit(100))
	})

	it('expr.meta(content) is the fluent equivalent', () => {
		const ast = lit(100).meta({ label: 'Width', default: 100 })
		expect(isMeta(ast)).toBe(true)
		expect(ast.metadata.get('label')).toEqual(lit('Width'))
		expect(ast.expr).toEqual({ kind: 'lit', value: 100 })
	})

	it('.meta() method does not appear in toEqual comparisons (non-enumerable)', () => {
		// builder-constructed AST should still equal a plain literal
		expect(lit(42)).toEqual({ kind: 'lit', value: 42 })
		expect(sym('+')).toEqual({ kind: 'sym', name: '+' })
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

	it('letBlock holds bindings and an optional body', () => {
		// {a = 10 b = 20 (+ a b)}
		const ast = letBlock(
			[
				['a', lit(10)],
				['b', lit(20)],
			],
			call(sym('+'), sym('a'), sym('b'))
		)
		expect(isLet(ast)).toBe(true)
		expect(ast.bindings).toHaveLength(2)
		expect(ast.bindings[0]).toEqual(['a', lit(10)])
		expect(ast.body).toEqual(call(sym('+'), sym('a'), sym('b')))

		// {a = 10}  (no trailing expression)
		const noBody = letBlock([['a', lit(10)]])
		expect(noBody.body).toBeNull()
	})

	it('fn builds a function literal AST', () => {
		// (=> (x: number y: number): number (+ x y))
		const ast = fn(
			[
				{ name: 'x', type: sym('number') },
				{ name: 'y', type: sym('number') },
			],
			sym('number'),
			call(sym('+'), sym('x'), sym('y'))
		)
		expect(isFn(ast)).toBe(true)
		expect(ast.params).toHaveLength(2)
		expect(ast.returnType).toEqual(sym('number'))
		expect(ast.body).toEqual(call(sym('+'), sym('x'), sym('y')))
		expect(ast.generics).toEqual([])
	})

	it('fn with no body is a function-type expression', () => {
		const ast = fn(
			[{ name: 'x', type: sym('number') }],
			sym('number'),
			null
		)
		expect(ast.body).toBeNull()
	})

	it('fn supports generics', () => {
		// (=> (T) (xs: [...T] i: number): T (xs i))
		const xsType = vec(spread(sym('T')))
		const ast = fn(
			[
				{ name: 'xs', type: xsType },
				{ name: 'i', type: sym('number') },
			],
			sym('T'),
			call(sym('xs'), sym('i')),
			{ generics: ['T'] }
		)
		expect(ast.generics).toEqual(['T'])
	})

	it('g namespace exposes "let" via property access', () => {
		const ast = g.let([['a', g.lit(10)]], g.sym('a'))
		expect(isLet(ast)).toBe(true)
	})
})

describe('Edge cases', () => {
	it('lit stores strings verbatim, escaping only happens at print', () => {
		const s = lit('a\nb\tc')
		expect(s.value).toBe('a\nb\tc') // raw, with actual newline / tab
		expect(s.print()).toBe('"a\\nb\\tc"') // escaped at print
	})

	it('lit preserves backslash and quote characters', () => {
		const s = lit('back\\slash and "quote"')
		expect(s.value).toBe('back\\slash and "quote"')
		expect(s.print()).toBe('"back\\\\slash and \\"quote\\""')
	})

	it('lit handles unicode and control chars', () => {
		const s = lit('')
		expect(s.value).toBe('')
		expect(s.print()).toBe('"\\u0001\\u0007"')
	})

	it('sym performs no validation — invalid identifiers still build an AST', () => {
		// Builders are pure shape constructors; lint/parser handles validity.
		expect(sym('').name).toBe('')
		expect(sym('123').name).toBe('123')
		expect(sym('has space').name).toBe('has space')
		expect(sym('?').name).toBe('?')
		// Their printed output may be invalid Glisp source — that's the host's
		// responsibility to prevent at the input layer.
	})

	it('record collapses duplicates when built from an object literal', () => {
		// Object form goes through JS's last-wins; only one entry survives.
		const obj: Record<string, AST> = {}
		obj.x = lit(1)
		obj.x = lit(2)
		const ast = record(obj)
		expect(ast.fields).toHaveLength(1)
		expect(ast.get('x')).toEqual(lit(2))
	})

	it('record preserves duplicates when built from an array of pairs', () => {
		// Array form retains the source's repetition so eval can apply
		// last-wins + emit a diagnostic per spec.
		const ast = record([
			['x', lit(1)],
			['x', lit(2)],
		])
		expect(ast.fields).toHaveLength(2)
		expect(ast.fields[0]).toEqual(['x', lit(1)])
		expect(ast.fields[1]).toEqual(['x', lit(2)])
		expect(ast.get('x')).toEqual(lit(2)) // last-wins via .get()
	})

	it('letBlock with duplicate names: both bindings preserved at AST level', () => {
		// Duplicates in array form are kept as-is; eval applies last-wins
		// semantics + emits a diagnostic (per syntax.md).
		const ast = letBlock(
			[
				['a', lit(1)],
				['a', lit(2)],
			],
			sym('a')
		)
		expect(ast.bindings).toHaveLength(2)
		expect(ast.bindings[0]).toEqual(['a', lit(1)])
		expect(ast.bindings[1]).toEqual(['a', lit(2)])
	})

	it('vec with no elements builds an empty vector AST', () => {
		expect(vec().elements).toHaveLength(0)
		expect(vec().print()).toBe('[]')
	})

	it('record with no fields builds an empty record AST', () => {
		expect(record({}).fields).toHaveLength(0)
		expect(record({}).print()).toBe('{}')
	})

	it('access can chain (left-associative) without limits', () => {
		const ast = access(access(access(sym('a'), 'b'), 'c'), 'd')
		expect(ast.print()).toBe('a.b.c.d')
	})

	it('path with mixed names and indices preserves segment kinds', () => {
		const ast = path('..', 'vec', 0, 'name')
		expect(ast.segments).toEqual(['..', 'vec', 0, 'name'])
		expect(ast.print()).toBe('../vec/0/name')
	})
})
