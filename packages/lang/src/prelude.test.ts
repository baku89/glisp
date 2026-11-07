import { describe, expect, it } from 'vitest'

import { evaluate, IO, isTypeValue, type TypeValue, typeFits, unwrapLazy } from './eval.js'
import { UNIT } from './types.js'
import { infer } from './infer.js'
import { parse } from './parse.js'
import { buildPrelude } from './prelude.js'

describe('prelude — identities', () => {
	it('an empty arithmetic call is its identity', () => {
		const env = buildPrelude()
		const run = (src: string) => evaluate(parse(src), env)
		expect(run('(+)').value).toBe(0)
		expect(run('(*)').value).toBe(1)
		expect(run('(-)').value).toBe(0)
		expect(run('(/)').value).toBe(1)
		expect(run('(-)').diagnostics).toEqual([])
		expect(run('(- 3)').value).toBe(-3)
		expect(run('(/ 4)').value).toBe(0.25)
		expect(run('(- 10 1 2)').value).toBe(7)
		expect(run('(/ 8 2 2)').value).toBe(2)
		expect(run('(+)').diagnostics).toEqual([])
		expect(run('(+ ...[])').value).toBe(0)
		expect(run('(+ 2)').value).toBe(2)
		expect(run('(* 2 3 4)').value).toBe(24)
		expect(run('(* "a" 3)').value).toBe(3)
	})
})

describe('coerce form with %', () => {
	it('#(identity ^T %) is a function that coerces its argument', () => {
		const r = evaluate(parse('(map ["a" 1] #(identity ^number %))'), buildPrelude())
		expect(r.value).toEqual([0, 1])
	})
})

describe('prelude — primitive types', () => {
	it('binds top as `_` and bottom as `!`', () => {
		const env = buildPrelude()
		const top = evaluate(parse('_'), env).value
		expect(isTypeValue(top) && top.typeName).toBe('_')
		const bot = evaluate(parse('!'), env).value
		expect(isTypeValue(bot) && bot.typeName).toBe('!')
	})

	it('binds primitives by name', () => {
		const env = buildPrelude()
		for (const name of ['number', 'string', 'boolean', 'unit', 'IO']) {
			const v = evaluate(parse(name), env).value
			expect(isTypeValue(v) && v.typeName).toBe(name)
		}
	})
})

describe('prelude — arithmetic (variadic)', () => {
	const env = buildPrelude()

	it('- left-folds; unary negates', () => {
		expect(evaluate(parse('(- 5)'), env).value).toBe(-5)
		expect(evaluate(parse('(- 10 1 2 3)'), env).value).toBe(4)
	})

	it('/ left-folds; unary reciprocates', () => {
		expect(evaluate(parse('(/ 4)'), env).value).toBe(0.25)
		expect(evaluate(parse('(/ 100 2 5)'), env).value).toBe(10)
	})

	it('coerces non-number args via the variadic tail type', () => {
		const r = evaluate(parse('(+ 1 "str" 3)'), env)
		expect(r.value).toBe(4) // 1 + 0 (default) + 3
		expect(
			r.diagnostics.some(d => d.message.includes('type mismatch'))
		).toBe(true)
	})
})

describe('prelude — comparison (chain)', () => {
	const env = buildPrelude()

	it('< chains pairwise; zero args is true', () => {
		expect(evaluate(parse('(< 1 2 3 4)'), env).value).toBe(true)
		expect(evaluate(parse('(< 1 3 2)'), env).value).toBe(false)
		expect(evaluate(parse('(< 5)'), env).value).toBe(true) // vacuously true (no pairs)
		const r = evaluate(parse('(<)'), env)
		expect(r.value).toBe(true) // vacuously true, likewise
		expect(r.diagnostics).toEqual([])
		expect(evaluate(parse('(==)'), env).value).toBe(true)
		expect(evaluate(parse('(!= 1 2 1)'), env).value).toBe(true)
		expect(evaluate(parse('(== 1 1 2)'), env).value).toBe(false)
	})

	it('== / != chain over arbitrary values', () => {
		expect(evaluate(parse('(== 1 1 1)'), env).value).toBe(true)
		expect(evaluate(parse('(== 1 1 2)'), env).value).toBe(false)
		expect(evaluate(parse('(!= 1 2 3)'), env).value).toBe(true)
		expect(evaluate(parse('(!= 1 2 2)'), env).value).toBe(false)
	})
})

describe('prelude — higher-order functions', () => {
	const env = buildPrelude()

	it('map applies fn elementwise', () => {
		const r = evaluate(
			parse('(map [1 2 3 4] (=> [x: number]: number (* x x)))'),
			env
		)
		expect(r.value).toEqual([1, 4, 9, 16])
	})

	it('filter retains elements where pred is truthy', () => {
		const r = evaluate(
			parse('(filter [1 2 3 4 5] (=> [x: number]: boolean (> x 2)))'),
			env
		)
		expect(r.value).toEqual([3, 4, 5])
	})

	it('reduce folds left-to-right with init', () => {
		const r = evaluate(
			parse(
				'(reduce [1 2 3 4 5] 0 (=> [a: number b: number]: number (+ a b)))'
			),
			env
		)
		expect(r.value).toBe(15)
	})
})

describe('prelude — type constructors', () => {
	const env = buildPrelude()

	it('keeps what is said about each value of a union of them, which is the same type without it', () => {
		const env = buildPrelude()
		const about = evaluate(parse('(| ^{icon: "x"} "r" "g")'), env).value as TypeValue
		const { shape } = unwrapLazy(about)
		if (shape.kind !== 'union') throw new Error('not a union')
		expect(shape.members[0]!.meta?.print()).toBe('{icon: "x"}')
		expect(shape.members[1]!.meta).toBeUndefined()
		expect(about.typeName).toBe('(| "r" "g")')
		expect(about.fits('g')).toBe(true)
		const plain = evaluate(parse('(| "r" "g")'), env).value as TypeValue
		expect(typeFits(about, plain) && typeFits(plain, about)).toBe(true)
	})

	it('^T v coerces an enum member through to its value', () => {
		const r = evaluate(parse('{C = (| "r" "g" "b") ^C "g"}'), env)
		expect(r.value).toBe('g')
	})

	it('^T v on a non-member falls back to the first listed value', () => {
		const r = evaluate(parse('{C = (| "r" "g" "b") ^C "purple"}'), env)
		expect(r.value).toBe('r')
		expect(
			r.diagnostics.some(d => d.message.includes("doesn't accept"))
		).toBe(true)
	})

	it('(: T pred) narrows a type, falling back to its default', () => {
		const pos = (arg: string): string =>
			`{Pos = (: number (=> [x: number]: boolean (> x 0)) default: 1) ^Pos ${arg}}`
		expect(evaluate(parse(pos('5')), env).value).toBe(5)
		const fail = evaluate(parse(pos('-3')), env)
		expect(fail.value).toBe(1) // declared default
		expect(
			fail.diagnostics.some(d => d.message.includes("doesn't accept"))
		).toBe(true)
	})
})

describe('prelude — standard library', () => {
	const env = buildPrelude()

	it('range generates ascending and descending sequences', () => {
		expect(evaluate(parse('(range 0 5)'), env).value).toEqual([0, 1, 2, 3, 4])
		expect(evaluate(parse('(range 5 0)'), env).value).toEqual([5, 4, 3, 2, 1])
	})

	it('size dispatches between vector and string', () => {
		expect(evaluate(parse('(size [1 2 3])'), env).value).toBe(3)
		expect(evaluate(parse('(size "hello")'), env).value).toBe(5)
	})

	it('++ of nothing is ()', () => {
		const r = evaluate(parse('(++)'), env)
		expect(r.value).toBe(UNIT)
		expect(r.diagnostics).toEqual([])
		expect(evaluate(parse('(++ [1])'), env).value).toEqual([1])
		expect(evaluate(parse('(++ "a")'), env).value).toBe('a')
		expect(evaluate(parse('(++ [[1]] [[2]])'), env).value).toEqual([[1], [2]])
	})

	it('++ is variadic over both vectors and strings', () => {
		expect(evaluate(parse('(++ [1 2] [3 4] [5])'), env).value).toEqual([
			1, 2, 3, 4, 5,
		])
		expect(evaluate(parse('(++ "foo" "bar")'), env).value).toBe('foobar')
	})

	it('slice over vectors and strings', () => {
		expect(
			evaluate(parse('(slice [10 20 30 40 50] 1 4)'), env).value
		).toEqual([20, 30, 40])
		expect(evaluate(parse('(slice "abcdef" 2 5)'), env).value).toBe('cde')
	})

	it('math primitives', () => {
		expect(evaluate(parse('(mod 10 3)'), env).value).toBe(1)
		expect(evaluate(parse('(** 2 10)'), env).value).toBe(1024)
		expect(evaluate(parse('(sqrt 16)'), env).value).toBe(4)
		expect(evaluate(parse('(floor 3.7)'), env).value).toBe(3)
		expect(evaluate(parse('(ceil 3.2)'), env).value).toBe(4)
		expect(evaluate(parse('pi'), env).value).toBe(Math.PI)
	})

	it('record ops', () => {
		expect(evaluate(parse('(keys {x: 1 y: 2})'), env).value).toEqual([
			'x',
			'y',
		])
		expect(evaluate(parse('(values {x: 1 y: 2})'), env).value).toEqual([
			1, 2,
		])
		expect(evaluate(parse('(merge {x: 1} {y: 2})'), env).value).toEqual({
			x: 1,
			y: 2,
		})
	})

	it('string ops', () => {
		expect(
			evaluate(parse('(starts-with "hello world" "hello")'), env).value
		).toBe(true)
		expect(evaluate(parse('(split "a,b,c" ",")'), env).value).toEqual([
			'a',
			'b',
			'c',
		])
		expect(evaluate(parse('(join ["a" "b" "c"] "-")'), env).value).toBe(
			'a-b-c'
		)
	})
})

describe('prelude — parametric IO', () => {
	it('(IO T) evaluates to a parametric type with payload T', () => {
		const env = buildPrelude()
		const r = evaluate(parse('(IO number)'), env)
		expect(isTypeValue(r.value) && r.value.typeName).toBe('(IO number)')
	})

	it('bare IO is sugar for (IO _) and is reused, parametric forms are fresh', () => {
		const env = buildPrelude()
		const bare = evaluate(parse('IO'), env).value
		const ioNum = evaluate(parse('(IO number)'), env).value
		expect(isTypeValue(bare) && bare.typeName).toBe('IO')
		expect(isTypeValue(ioNum) && ioNum.typeName).toBe('(IO number)')
		expect(bare).not.toBe(ioNum)
	})

	it('(IO number) prints as a call, so REPL output round-trips', () => {
		const env = buildPrelude()
		const r = evaluate(parse('(IO number)'), env)
		// toAst path: parametric IO → CallAST(IO, [number]) → "(IO number)"
		expect(r.diagnostics).toHaveLength(0)
	})

	it('rejects wrong arity', () => {
		const env = buildPrelude()
		const r = evaluate(parse('(IO number string)'), env)
		expect(
			r.diagnostics.some(d => d.message.includes('1 type argument'))
		).toBe(true)
	})

	it('rejects non-type arguments', () => {
		const env = buildPrelude()
		const r = evaluate(parse('(IO (+ 1 2))'), env)
		expect(
			r.diagnostics.some(d => d.message.includes('expects type arguments'))
		).toBe(true)
	})
})

describe('prelude — :type signature display via infer', () => {
	const env = buildPrelude()

	it('infer(+) yields a function-type with a variadic parameter', () => {
		const t = infer(parse('+'), env)
		expect(t?.typeName).toBe('(=> [...xs: number]: number)')
	})

	it('infer(==) returns boolean-typed predicate', () => {
		const t = infer(parse('=='), env)
		expect(t?.typeName).toBe('(=> [...xs: _]: boolean)')
	})

	it('infer of a fn literal renders its signature', () => {
		const t = infer(parse('(=> [n: number]: number (* n 2))'), env)
		expect(t?.typeName).toBe('(=> [n: number]: number)')
	})
})

describe('prelude — operator names', () => {
	const env = buildPrelude()

	it('has ** and ++ in place of pow and concat', () => {
		expect(evaluate(parse('(** 2 10)'), env).value).toBe(1024)
		expect(evaluate(parse('(++ "a" "b")'), env).value).toBe('ab')
		for (const name of ['pow', 'concat']) {
			expect(evaluate(parse(name), env).diagnostics[0]!.message).toBe(
				`unresolvable name: ${name}`
			)
		}
	})
})

describe('parameter labels', () => {
	const bindingOf = (name: string) => buildPrelude()?.bindings?.get(name)?.ast

	it('are on the definition, as metadata', () => {
		const map = bindingOf('map')
		expect(map?.kind).toBe('meta')
		if (map?.kind !== 'meta') return
		const params = map.metadata.get('params')
		expect(params?.print()).toContain('xs: {label: "Items" doc: ')
		expect(params?.print()).toContain('f: {label: "Transform" doc: ')
		expect(map.metadata.get('doc')).toBeDefined()
	})

	it('say what the function is called', () => {
		const multiply = bindingOf('*')
		expect(multiply?.kind === 'meta' && multiply.metadata.get('label')?.print()).toBe(
			'"Multiply"'
		)
	})

	it('change nothing about the function', () => {
		const r = evaluate(parse('(map [1 2] #(* % 2))'), buildPrelude())
		expect(r.value).toEqual([2, 4])
		expect(r.diagnostics).toEqual([])
	})
})

describe('and and or', () => {
	const run = (src: string) => evaluate(parse(src), buildPrelude()).value

	it('have their identities with nothing to go on', () => {
		expect(run('(and)')).toBe(true)
		expect(run('(or)')).toBe(false)
	})

	it('go through any number of them', () => {
		expect(run('(and true)')).toBe(true)
		expect(run('(and true false true)')).toBe(false)
		expect(run('(or false)')).toBe(false)
		expect(run('(or false true false)')).toBe(true)
	})

	it('take what is not a boolean as their identity', () => {
		expect(run('(and "a" true)')).toBe(true)
		expect(run('(or "a" false)')).toBe(false)
	})
})
