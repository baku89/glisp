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
			sym('number')
		).withBody(call(sym('+'), sym('x'), sym('y')))
		expect(isFn(ast)).toBe(true)
		expect(ast.params).toHaveLength(2)
		expect(ast.returnType).toEqual(sym('number'))
		expect(ast.body).toEqual(call(sym('+'), sym('x'), sym('y')))
		expect(ast.generics).toEqual([])
	})

	it('fn with no body is a function-type expression', () => {
		const ast = fn([{ name: 'x', type: sym('number') }], sym('number'))
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
			sym('T')
		)
			.withGenerics('T')
			.withBody(call(sym('xs'), sym('i')))
		expect(ast.generics).toEqual(['T'])
	})

	it('g namespace exposes "let" via property access', () => {
		const ast = g.let([['a', g.lit(10)]], g.sym('a'))
		expect(isLet(ast)).toBe(true)
	})
})

describe('Value builders (type values)', () => {
	it('primitive type constants are bare symbols', () => {
		expect(g.number).toEqual(sym('number'))
		expect(g.string).toEqual(sym('string'))
		expect(g.boolean).toEqual(sym('boolean'))
		expect(g.unit).toEqual(sym('unit'))
		expect(g.top).toEqual(sym('_'))
		expect(g.bottom).toEqual(sym('!'))
		expect(g.ast).toEqual(sym('ast'))
	})

	it('primitive type constants print to lowercase names', () => {
		expect(g.number.print()).toBe('number')
		expect(g.string.print()).toBe('string')
		expect(g.top.print()).toBe('_')
		expect(g.bottom.print()).toBe('!')
		expect(g.ast.print()).toBe('ast')
	})

	it('vector(T) produces a [...T] AST', () => {
		expect(g.vector(g.number).print()).toBe('[...number]')
		expect(g.vector(g.vector(g.number)).print()).toBe('[...[...number]]')
	})

	it('enum(...vs) produces an (enum ...) call AST', () => {
		expect(g.enum('round', 'butt', 'square').print()).toBe(
			'(enum "round" "butt" "square")'
		)
		expect(g.enum(1, 2, 3).print()).toBe('(enum 1 2 3)')
	})

	it('fn() chain — object form for params', () => {
		// fn({a: number, b: number}, number) → function type value
		const ast = fn({ a: g.number, b: g.number }, g.number)
		expect(ast.params).toEqual([
			{ name: 'a', type: g.number },
			{ name: 'b', type: g.number },
		])
		expect(ast.body).toBeNull()
		expect(ast.print()).toBe('(=> (a: number b: number): number)')
	})

	it('fn() chain — .withBody() turns a type value into an AST', () => {
		const ty = fn({ a: g.number, b: g.number }, g.number)
		const ast = ty.withBody(call(sym('+'), sym('a'), sym('b')))
		expect(ast.body).toEqual(call(sym('+'), sym('a'), sym('b')))
		expect(ty.body).toBeNull() // original is unchanged
	})

	it('fn() chain — .withGenerics() adds generic params', () => {
		const ast = fn({ x: sym('T') }, sym('T')).withGenerics('T')
		expect(ast.generics).toEqual(['T'])
		expect(ast.print()).toBe('(=> (T) (x: T): T)')
	})

	it('fn() chain — full .withGenerics().withBody()', () => {
		const ast = fn({ x: sym('T') }, sym('T'))
			.withGenerics('T')
			.withBody(sym('x'))
		expect(ast.print()).toBe('(=> (T) (x: T): T x)')
	})

	it('value builders compose with fn for type-position use', () => {
		// (=> (xs: [...number] i: number): number ...)
		const ast = fn(
			[
				{ name: 'xs', type: g.vector(g.number) },
				{ name: 'i', type: g.number },
			],
			g.number
		)
		expect(ast.print()).toBe(
			'(=> (xs: [...number] i: number): number)'
		)
	})
})

describe('record overload — type vs runtime field content', () => {
	// Per host-api.md, `record({...})` works the same shape whether the
	// fields hold type values or runtime values; the distinction is at the
	// type-slot interpretation layer (eval), not the AST.

	it('all-type-value fields → record shape that reads as a record TYPE', () => {
		// {x: number y: number} — used in a type slot, this is a record type
		const ast = record({ x: g.number, y: g.number })
		expect(ast.print()).toBe('{x: number y: number}')
		expect(ast.get('x')).toEqual(g.number)
	})

	it('all-AST-value fields → record literal AST', () => {
		// {x: 10 y: 20} — runtime record
		const ast = record({ x: lit(10), y: lit(20) })
		expect(ast.print()).toBe('{x: 10 y: 20}')
		expect(ast.get('x')).toEqual(lit(10))
	})

	it('mixed (type values + runtime values) builds the same shape', () => {
		// {schema: {x: number} data: {x: 10}} — nesting type values inside a
		// runtime record. The AST shape is uniform.
		const schema = record({ x: g.number })
		const data = record({ x: lit(10) })
		const ast = record({ schema, data })
		expect(ast.print()).toBe(
			'{schema: {x: number} data: {x: 10}}'
		)
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

	it('record can contain spread entries', () => {
		// {a: 1 ...rec b: 2}
		const ast = record([
			['a', lit(1)],
			spread(sym('rec')),
			['b', lit(2)],
		])
		expect(ast.fields).toHaveLength(3)
		expect(ast.fields[1]).toBeInstanceOf(
			(spread(sym('x'))).constructor
		)
		// .get() ignores spread entries
		expect(ast.get('a')).toEqual(lit(1))
		expect(ast.get('b')).toEqual(lit(2))
		expect(ast.get('rec')).toBeUndefined()
		// print form
		expect(ast.print()).toBe('{a: 1 ...rec b: 2}')
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
