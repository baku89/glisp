import { describe, expect, it } from 'vitest'

import {
	access,
	call,
	callKw,
	fn,
	letBlock,
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
import { print } from './print.js'
import { UNIT } from './types.js'

describe('print', () => {
	it('prints number, string, boolean, unit literals', () => {
		expect(print(lit(42))).toBe('42')
		expect(print(lit(3.14))).toBe('3.14')
		expect(print(lit('hello'))).toBe('"hello"')
		expect(print(lit(true))).toBe('true')
		expect(print(lit(false))).toBe('false')
		expect(print(lit(UNIT))).toBe('()')
	})

	it('escapes strings per spec', () => {
		expect(print(lit('a\nb'))).toBe('"a\\nb"')
		expect(print(lit('with "quotes"'))).toBe('"with \\"quotes\\""')
		expect(print(lit('back\\slash'))).toBe('"back\\\\slash"')
		expect(print(lit('\t'))).toBe('"\\t"')
	})

	it('prints symbols verbatim', () => {
		expect(print(sym('+'))).toBe('+')
		expect(print(sym('foo-bar'))).toBe('foo-bar')
	})

	it('prints applications', () => {
		expect(print(call(sym('+'), lit(1), lit(2)))).toBe('(+ 1 2)')
		expect(print(call(sym('f')))).toBe('(f)')
		expect(
			print(call(sym('*'), call(sym('+'), lit(1), lit(2)), lit(3)))
		).toBe('(* (+ 1 2) 3)')
	})

	it('prints applications with kwargs', () => {
		expect(
			print(callKw(sym('f'), [lit(1)], { k: lit(2), m: lit(3) }))
		).toBe('(f 1 k=2 m=3)')
	})

	it('prints accessor sugar', () => {
		expect(print(access(sym('point'), 'x'))).toBe('point.x')
		expect(print(access(sym('arr'), 2))).toBe('arr.2')
		// chain x.key.bar
		expect(print(access(access(sym('x'), 'key'), 'bar'))).toBe('x.key.bar')
	})

	it('prints vectors', () => {
		expect(print(vec(lit(1), lit(2), lit(3)))).toBe('[1 2 3]')
		expect(print(vec())).toBe('[]')
	})

	it('prints records (insertion order)', () => {
		expect(print(record({ x: lit(10), y: lit(20) }))).toBe('{x: 10 y: 20}')
		expect(print(record({}))).toBe('{}')
	})

	it('prints let-blocks', () => {
		expect(
			print(
				letBlock(
					[
						['a', lit(10)],
						['b', lit(20)],
					],
					call(sym('+'), sym('a'), sym('b'))
				)
			)
		).toBe('{a = 10 b = 20 (+ a b)}')

		// no body
		expect(print(letBlock([['a', lit(10)]]))).toBe('{a = 10}')
	})

	it('prints function literals', () => {
		const ast = fn(
			[
				{ name: 'x', type: sym('number') },
				{ name: 'y', type: sym('number') },
			],
			sym('number'),
			call(sym('+'), sym('x'), sym('y'))
		)
		expect(print(ast)).toBe('(=> (x: number y: number): number (+ x y))')
	})

	it('prints function types (no body)', () => {
		const ast = fn(
			[{ name: 'x', type: sym('number') }],
			sym('number'),
			null
		)
		expect(print(ast)).toBe('(=> (x: number): number)')
	})

	it('prints generic functions', () => {
		const ast = fn(
			[{ name: 'x', type: sym('T') }],
			sym('T'),
			sym('x'),
			{ generics: ['T'] }
		)
		expect(print(ast)).toBe('(=> (T) (x: T): T x)')
	})

	it('prints variadic and optional parameters', () => {
		const ast = fn(
			[
				{ name: 'init', type: sym('number') },
				{ name: 'name', type: sym('string'), optional: true },
				{ name: 'rest', type: sym('number'), variadic: true },
			],
			sym('number'),
			null
		)
		expect(print(ast)).toBe(
			'(=> (init: number name?: string ...rest: number): number)'
		)
	})

	it('prints paths', () => {
		expect(print(path('foo'))).toBe('./foo')
		expect(print(path('..', 'foo'))).toBe('../foo')
		expect(print(path('..', '..', 'a'))).toBe('../../a')
		expect(print(path('..', 'vec', 0))).toBe('../vec/0')
		expect(print(path())).toBe('./')
		expect(print(path('..'))).toBe('../')
	})

	it('prints quasiquote / unquote / spread', () => {
		expect(print(quote(sym('x')))).toBe('`x')
		expect(print(unquote(sym('x')))).toBe('~x')
		// spread (outside quote): ...xs
		expect(print(splice(sym('xs')))).toBe('...xs')
		// inside quote: ...~xs
		expect(print(quote(call(sym('+'), splice(sym('xs')))))).toBe(
			'`(+ ...~xs)'
		)
	})

	it('prints metadata', () => {
		expect(print(meta({ label: lit('Width') }, lit(100)))).toBe(
			'^{label: "Width"} 100'
		)
	})

	it('prints metadata via fluent .meta() with auto-lit', () => {
		expect(print(lit(100).meta({ label: 'Width', default: 100 }))).toBe(
			'^{label: "Width" default: 100} 100'
		)
	})

	it('exposes .print() as a method on every AST node', () => {
		expect(lit(42).print()).toBe('42')
		expect(sym('foo').print()).toBe('foo')
		expect(call(sym('+'), lit(1), lit(2)).print()).toBe('(+ 1 2)')
		expect(vec(lit(1), lit(2)).print()).toBe('[1 2]')
		expect(record({ x: lit(10) }).print()).toBe('{x: 10}')
		expect(path('..', 'foo').print()).toBe('../foo')
	})

	it('round-trips a moderately nested expression', () => {
		// (=> (n: number): number {a = (* n 2) (+ a 1)})
		const ast = fn(
			[{ name: 'n', type: sym('number') }],
			sym('number'),
			letBlock(
				[['a', call(sym('*'), sym('n'), lit(2))]],
				call(sym('+'), sym('a'), lit(1))
			)
		)
		expect(print(ast)).toBe(
			'(=> (n: number): number {a = (* n 2) (+ a 1)})'
		)
	})
})
