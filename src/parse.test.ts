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
	splice,
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
		expect(parse('(f 1 k=2 m=3)')).toEqual(
			callKw(sym('f'), [lit(1)], { k: lit(2), m: lit(3) })
		)
	})

	it('rejects positional after keyword', () => {
		expect(() => parse('(f k=1 2)')).toThrow(ParseError)
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
	it('(=> (x: number y: number): number (+ x y))', () => {
		expect(parse('(=> (x: number y: number): number (+ x y))')).toEqual(
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
		expect(parse('(=> (a: number b: number): number)')).toEqual(
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
		expect(parse('(=> (T) (x: T): T x)')).toEqual(
			fn(
				[{ name: 'x', type: sym('T'), optional: false, variadic: false }],
				sym('T')
			)
				.withGenerics('T')
				.withBody(sym('x'))
		)
	})

	it('variadic + optional parameters', () => {
		const ast = parse(
			'(=> (init: number name?: string ...rest: number): number)'
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

describe('parse — quasiquote', () => {
	it('`x', () => {
		expect(parse('`x')).toEqual(quote(sym('x')))
	})

	it('~x', () => {
		expect(parse('~x')).toEqual(unquote(sym('x')))
	})

	it('...xs', () => {
		expect(parse('...xs')).toEqual(spread(sym('xs')))
	})

	it('...~xs', () => {
		expect(parse('...~xs')).toEqual(splice(sym('xs')))
	})

	it('`(+ 1 ~x ...~xs)', () => {
		expect(parse('`(+ 1 ~x ...~xs)')).toEqual(
			quote(
				call(sym('+'), lit(1), unquote(sym('x')), splice(sym('xs')))
			)
		)
	})

	it('`(~f ...xs)  — head unquoted, args plain spread', () => {
		expect(parse('`(~f ...xs)')).toEqual(
			quote(call(unquote(sym('f')), spread(sym('xs'))))
		)
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
			'(f 1 k=2 m=3)',
			'a.b.c',
			'arr.2',
			'[1 2 3]',
			'[]',
			'[1 ...xs 4]',
			'{x: 10 y: 20}',
			'{}',
			'{a = 10 b = 20 (+ a b)}',
			'(=> (x: number y: number): number (+ x y))',
			'(=> (a: number b: number): number)',
			'(=> (T) (x: T): T x)',
			'./foo',
			'../foo',
			'../../a',
			'../vec/0/name',
			'`x',
			'~x',
			'...xs',
			'...~xs',
			'`(+ 1 ~x ...~xs)',
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

	it('(@ T) with one arg parses (eval will reject)', () => {
		expect(parse('(@ number)').kind).toBe('call')
	})

	it('round-trips coerce form', () => {
		const src = '(@ number 42)'
		expect(roundTrip(src)).toBe(src)
	})

	it('round-trips IO-parametric form', () => {
		const src = '(IO number)'
		expect(roundTrip(src)).toBe(src)
	})
})
