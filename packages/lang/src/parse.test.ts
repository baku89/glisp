import { type AST, type LetAST, MetaAST } from './types.js'
import { describe, expect, it } from 'vitest'

import { hide, isHidden, isPinned, unhide } from './build.js'
import { print } from './print.js'

import {
	access,
	call,
	callKw,
	fn,
	isPinned,
	letBlock,
	lit,
	meta,
	path,
	spread,
	sym,
	unquote,
	vec,
} from './build.js'
import { parse, ParseError } from './parse.js'
import { print } from './print.js'
import { RecordAST, UNIT } from './types.js'

/**
 * Round-trip helper: parse → AST → print should give back the same source
 * (up to default whitespace).
 */
function roundTrip(src: string): string {
	return print(parse(src))
}

describe('#_', () => {
	const structural = (ast: AST) => ast.printStructural()
	const again = (src: string) => print(parse(src))

	it('is metadata, and prints back', () => {
		expect(again('#_a')).toBe('#_a')
		expect(isHidden(parse('#_a'))).toBe(true)
		expect(isHidden(parse('a'))).toBe(false)
		expect(again('{a = #_(+ 1 2)}')).toBe('{a = #_(+ 1 2)}')
	})

	it('joins other metadata, and @', () => {
		for (const src of ['#_@a', '^{label: "L"} #_a', '^{label: "L"} @a', '^{label: "L"} #_@a']) {
			expect(structural(parse(src))).toBe(src)
		}
		expect(isPinned(parse('@#_a')) && isHidden(parse('@#_a'))).toBe(true)
		expect(structural(unhide(parse('^{label: "L"} #_@a')))).toBe('^{label: "L"} @a')
		expect(print(unhide(parse('#_a')))).toBe('a')
		expect(print(hide(parse('@a')))).toBe('#_@a')
	})

	it('is not for writing twice, or as a key, and # is kept', () => {
		expect(() => parse('#_#_a')).toThrow()
		expect(() => parse('^{#_: true} a')).toThrow()
		expect(() => parse('#f00')).toThrow()
		expect(() => parse('#a')).toThrow()
	})
})

describe('@', () => {
	const roundTrip = (src: string) => {
		const ast = parse(src)
		return ast.kind === 'meta' ? new MetaAST(ast.metadata, ast.expr).print() : ast.print()
	}

	it('pins what follows it, as metadata', () => {
		for (const src of ['@a', '@10', '@(+ 1 2)', '@[1 2]']) {
			const ast = parse(src)
			expect(ast.kind).toBe('meta')
			expect(isPinned(ast)).toBe(true)
			expect(roundTrip(src)).toBe(src)
		}
		expect(isPinned(parse('^{label: "L"} a'))).toBe(false)
	})

	it('joins other metadata, written either way', () => {
		for (const src of ['^{label: "L"} @a', '@^{label: "L"} a']) {
			const ast = parse(src) as MetaAST
			expect(isPinned(ast)).toBe(true)
			expect(ast.expr.kind).toBe('sym')
			expect(roundTrip(src)).toBe('^{label: "L"} @a')
		}
	})

	it('is written once, and not as a key', () => {
		expect(() => parse('@@a')).toThrow()
		expect(() => parse('^{@: true} a')).toThrow()
		expect(() => parse('a@b')).toThrow()
	})
})

describe('parse — atoms', () => {
	it('numbers', () => {
		expect(parse('42')).toEqual(lit(42))
		expect(parse('-7')).toEqual(lit(-7))
		expect(parse('3.14')).toEqual(lit(3.14))
		expect(parse('1e5')).toEqual(lit(100000))
	})

	it('strings', () => {
		expect(parse('"hello"')).toEqual(lit('hello'))
		expect(parse('"a\\nb"')).toEqual(lit('a\nb'))
	})

	it('booleans', () => {
		expect(parse('true')).toEqual(lit(true))
		expect(parse('false')).toEqual(lit(false))
	})

	it('unit, top, bottom', () => {
		expect(parse('()')).toEqual(lit(UNIT))
		expect(parse('_')).toEqual(sym('_'))
		expect(parse('!')).toEqual(sym('!'))
	})

	it('symbols', () => {
		expect(parse('foo')).toEqual(sym('foo'))
		expect(parse('+')).toEqual(sym('+'))
		expect(parse('>=')).toEqual(sym('>='))
	})
})

describe('parse — calls', () => {
	it('(+ 1 2)', () => {
		expect(parse('(+ 1 2)')).toEqual(call(sym('+'), lit(1), lit(2)))
	})

	it('nested calls', () => {
		expect(parse('(* (+ 1 2) 3)')).toEqual(
			call(sym('*'), call(sym('+'), lit(1), lit(2)), lit(3))
		)
	})

	it('calls with kwargs', () => {
		expect(parse('(f 1 k: 2 m: 3)')).toEqual(
			callKw(sym('f'), [lit(1)], { k: lit(2), m: lit(3) })
		)
	})

	it('rejects positional after keyword', () => {
		expect(() => parse('(f k: 1 2)')).toThrow(ParseError)
	})

	it('rejects empty application', () => {
		expect(() => parse('( )')).toThrow(ParseError)
	})
})

describe('parse — accessor', () => {
	it('a.b', () => {
		expect(parse('a.b')).toEqual(access(sym('a'), 'b'))
	})

	it('a.b.c', () => {
		expect(parse('a.b.c')).toEqual(access(access(sym('a'), 'b'), 'c'))
	})

	it('arr.2', () => {
		expect(parse('arr.2')).toEqual(access(sym('arr'), 2))
	})

	it('(make-point).x', () => {
		expect(parse('(make-point).x')).toEqual(
			access(call(sym('make-point')), 'x')
		)
	})
})

describe('parse — vectors', () => {
	it('[1 2 3]', () => {
		expect(parse('[1 2 3]')).toEqual(vec(lit(1), lit(2), lit(3)))
	})

	it('empty vector', () => {
		expect(parse('[]')).toEqual(vec())
	})

	it('vector with spread', () => {
		expect(parse('[1 ...xs 4]')).toEqual(
			vec(lit(1), spread(sym('xs')), lit(4))
		)
	})
})

describe('parse — records', () => {
	it('{x: 10 y: 20}', () => {
		expect(parse('{x: 10 y: 20}')).toEqual(
			new RecordAST([
				['x', lit(10)],
				['y', lit(20)],
			])
		)
	})

	it('empty record', () => {
		expect(parse('{}')).toEqual(new RecordAST([]))
		expect(parse('{()}').kind).toBe('let')
		expect((parse('{()}') as LetAST).body).toBeNull()
		expect((parse('{a = 1 ()}') as LetAST).body?.kind).toBe('lit')
	})

	it('record with optional field', () => {
		const ast = parse('{x: number  y?: string}')
		expect(ast).toBeInstanceOf(RecordAST)
		const rec = ast as RecordAST
		expect(rec.fields).toEqual([
			['x', sym('number')],
			['y', sym('string')],
		])
		expect(rec.optional).toEqual(new Set(['y']))
	})

	it('record with spread', () => {
		expect(parse('{a: 1 ...rec b: 2}')).toEqual(
			new RecordAST([
				['a', lit(1)],
				spread(sym('rec')),
				['b', lit(2)],
			])
		)
	})
})

describe('parse — let-blocks', () => {
	it('{a = 10 b = 20 (+ a b)}', () => {
		expect(parse('{a = 10 b = 20 (+ a b)}')).toEqual(
			letBlock(
				[
					['a', lit(10)],
					['b', lit(20)],
				],
				call(sym('+'), sym('a'), sym('b'))
			)
		)
	})

	it('let-block with no trailing expression', () => {
		expect(parse('{a = 10 b = 20}')).toEqual(
			letBlock(
				[
					['a', lit(10)],
					['b', lit(20)],
				],
				null
			)
		)
	})

	it('rejects multiple trailing expressions', () => {
		expect(() => parse('{a = 10 (foo) (+ a 1)}')).toThrow(ParseError)
	})
})

describe('parse — functions', () => {
	it('(=> [x: number y: number]: number (+ x y))', () => {
		expect(parse('(=> [x: number y: number]: number (+ x y))')).toEqual(
			fn(
				[
					{ name: 'x', type: sym('number'), optional: false, variadic: false },
					{ name: 'y', type: sym('number'), optional: false, variadic: false },
				],
				sym('number')
			).withBody(call(sym('+'), sym('x'), sym('y')))
		)
	})

	it('function-type expression (no body)', () => {
		expect(parse('(=> [a: number b: number]: number)')).toEqual(
			fn(
				[
					{ name: 'a', type: sym('number'), optional: false, variadic: false },
					{ name: 'b', type: sym('number'), optional: false, variadic: false },
				],
				sym('number')
			)
		)
	})

	it('generic function', () => {
		expect(parse('(=> {T} [x: T]: T x)')).toEqual(
			fn(
				[{ name: 'x', type: sym('T'), optional: false, variadic: false }],
				sym('T')
			)
				.withGenerics('T')
				.withBody(sym('x'))
		)
		expect(parse('(=> {T U} [x: T]: U x)').printStructural()).toBe('(=> {T U} [x: T]: U x)')
	})

	it('writes a function of `%` with `#`', () => {
		for (const src of ['#(* 2 %)', '#[% %]', '#{a: %}', '(map xs #(+ % 1))', '#(g #(f %) %)', '#_#(* 2 %)', '^{label: "D"} #(* 2 %)']) {
			expect(roundTrip(src), src).toBe(src)
		}
		expect(() => parse('(* 2 %)')).toThrow(/stands only in a function written with `#`/)
		expect(() => parse('%')).toThrow(ParseError)
		expect(() => parse('#(f 1)')).toThrow(/not in it/)
		expect(() => parse('#(f #(g %))')).toThrow(/not in it/)
		expect(() => parse('#x')).toThrow()
		expect(() => parse('# (f %)')).toThrow()
	})

	it('has its parameters in brackets, and its generics in braces', () => {
		expect(() => parse('(=> (x: number): number x)')).toThrow(/parameters go in `\[\.\.\.\]`/)
		expect(() => parse('(=> {T: Show} [x: T]: T x)')).toThrow(/not supported yet/)
		expect(() => parse('(=> {} [x: number]: number x)')).toThrow(ParseError)
		expect(() => parse('(=> {1} [x: number]: number x)')).toThrow(ParseError)
		expect(() => parse('(=> [x: number: number x)')).toThrow(ParseError)
		expect(() => parse('(=> []: number 1)')).toThrow(/at least one parameter/)
		expect(() => parse('(=> []: number)')).toThrow(ParseError)
	})

	it('variadic + optional parameters', () => {
		const ast = parse(
			'(=> [init: number name?: string ...rest: number]: number)'
		)
		expect(ast).toEqual(
			fn(
				[
					{ name: 'init', type: sym('number'), optional: false, variadic: false },
					{ name: 'name', type: sym('string'), optional: true, variadic: false },
					{ name: 'rest', type: sym('number'), optional: false, variadic: true },
				],
				sym('number')
			)
		)
	})
})

describe('parse — paths', () => {
	it('./foo', () => {
		expect(parse('./foo')).toEqual(path('foo'))
	})

	it('../foo', () => {
		expect(parse('../foo')).toEqual(path('..', 'foo'))
	})

	it('../../a', () => {
		expect(parse('../../a')).toEqual(path('..', '..', 'a'))
	})

	it('mixed segments', () => {
		expect(parse('../vec/0/name')).toEqual(path('..', 'vec', 0, 'name'))
	})
})

describe('parse — ~', () => {
	it('~x', () => {
		expect(parse('~x')).toEqual(unquote(sym('x')))
	})

	it('...xs', () => {
		expect(parse('...xs')).toEqual(spread(sym('xs')))
	})

	it('...~xs is a spread of ~xs', () => {
		expect(parse('...~xs')).toEqual(spread(unquote(sym('xs'))))
		expect(parse('...~xs').printStructural()).toBe('...~xs')
	})

	it('(+ 1 ~x ...~xs)', () => {
		expect(parse('(+ 1 ~x ...~xs)')).toEqual(
			call(sym('+'), lit(1), unquote(sym('x')), spread(unquote(sym('xs'))))
		)
	})

	it('backtick is not a token', () => {
		expect(() => parse('`x')).toThrow()
	})
})

describe('parse — metadata', () => {
	it('^{label: "Width"} 100', () => {
		expect(parse('^{label: "Width"} 100')).toEqual(
			meta({ label: lit('Width') }, lit(100))
		)
	})

	it('multiple metadata fields', () => {
		expect(parse('^{label: "x" default: 0} number')).toEqual(
			meta({ label: lit('x'), default: lit(0) }, sym('number'))
		)
	})

	it('rejects stacked metadata wraps', () => {
		// `^{a: 1} ^{b: 2} expr` — must be combined into one ^{...}
		expect(() => parse('^{a: 1} ^{b: 2} foo')).toThrow(ParseError)
	})
})

describe('parse — round-trip', () => {
	it('preserves source for canonical forms', () => {
		const examples = [
			'42',
			'-7',
			'3.14',
			'"hello"',
			'true',
			'()',
			'_',
			'!',
			'foo',
			'(+ 1 2)',
			'(* (+ 1 2) 3)',
			'(f 1 k: 2 m: 3)',
			'a.b.c',
			'arr.2',
			'[1 2 3]',
			'[]',
			'[1 ...xs 4]',
			'{x: 10 y: 20}',
			'{}',
			'{a = 10 b = 20 (+ a b)}',
			'(=> [x: number y: number]: number (+ x y))',
			'(=> [a: number b: number]: number)',
			'(=> {T} [x: T]: T x)',
			'./foo',
			'../foo',
			'../../a',
			'../vec/0/name',
			'~x',
			'...xs',
			'...~xs',
			'(+ 1 ~x ...~xs)',
			'^{label: "Width"} 100',
		]
		for (const src of examples) {
			expect(roundTrip(src)).toBe(src)
		}
	})
})

describe('parse — special forms (parser is permissive)', () => {
	// Special forms parse like ordinary calls — arity / well-formedness is
	// checked at evaluation time. These tests pin that contract so a
	// future tightening doesn't sneak in unnoticed.

	it('(?) with no scrutinee parses (eval will reject)', () => {
		const ast = parse('(?)')
		expect(ast.kind).toBe('call')
	})

	it('(? v) with no clauses parses', () => {
		expect(parse('(? 42)').kind).toBe('call')
	})

	it('(? v p1 r1 p2) — odd arity parses; eval will reject', () => {
		expect(parse('(? 1 _ "a" 2)').kind).toBe('call')
	})

	it('(|>) with no input or steps parses', () => {
		expect(parse('(|>)').kind).toBe('call')
	})

	it('(: v) with one arg parses (eval will reject)', () => {
		expect(parse('(: number)').kind).toBe('call')
	})

	it('round-trips coerce form', () => {
		const src = '(: 42 number)'
		expect(roundTrip(src)).toBe(src)
	})

	it('`:` is only a coerce head directly after `(`', () => {
		expect(() => parse('(x: number)')).toThrow()
		expect(() => parse('(f : number)')).toThrow()
		const fnAst = parse('(=> [x: number]: number (: x number))')
		expect(fnAst.kind).toBe('fn')
	})

	it('requires a separator between adjacent elements', () => {
		for (const src of [
			'(++ [][])',
			'[[1][2]]',
			'(f)(g)',
			'(+ 1 2)3',
			'[1 2][0]',
			'f(x)',
			'"a""b"',
			'{a: 1}{b: 2}',
			'[1(f)]',
			'[a...b]',
			'1/2',
			'20rad',
		]) {
			expect(() => parse(src), src).toThrow(ParseError)
		}
	})

	it('accepts adjacency that is not between elements', () => {
		for (const src of [
			'(++ [] [])',
			'[[1] [2]]',
			'((f) (g))',
			'[(f)]',
			'(make-point).x',
			'a.b.c',
			'(=> [x: number]: number x)',
			'(f k: (g))',
			'[...xs]',
			'(* ~x ...~xs)',
			'^{a: 1} x',
			'(/ 1 2)',
			'{x?: number}',
			'(f) ; comment',
		]) {
			expect(() => parse(src), src).not.toThrow()
		}
	})

	it('rejects paths in a function signature', () => {
		for (const src of [
			'(=> [x: ./0]: number)',
			'(=> {T} [x: ../T]: T 1)',
			'(=> [x: number]: ../r x)',
			'(=> [[./0]]: number)',
			'(=> [f: (=> [y: ./0]: number)]: number 1)',
		]) {
			expect(() => parse(src), src).toThrow(ParseError)
		}
		expect(() => parse('[1 (=> [x: number]: number ../0)]')).not.toThrow()
	})

	it('allows unnamed parameters in a function type only', () => {
		for (const src of [
			'(=> [number number]: number)',
			'(=> {T} [T [...T]]: T)',
			'(=> [a: number string]: number)',
			'(=> [number ...string]: number)',
		]) {
			expect(roundTrip(src), src).toBe(src)
			expect(parse(src).printStructural(), src).toBe(src)
		}
		expect(() => parse('(=> [number number]: number 1)')).toThrow(ParseError)
		expect(() => parse('(=> [a: number string]: number a)')).toThrow(ParseError)
	})

	it('round-trips IO-parametric form', () => {
		const src = '(IO number)'
		expect(roundTrip(src)).toBe(src)
	})
})

describe('a slash with nothing after it', () => {
	it('is division, as a name on its own', () => {
		expect(print(parse('/'))).toBe('/')
		expect(print(parse('(/ 4 /)'))).toBe('(/ 4 /)')
	})
})
