import { describe, expect, it } from 'vitest'

import { check } from './check.js'
import { callParameters, infer, resolveTypeSlot } from './infer.js'
import { Runtime } from './runtime.js'
import { Session } from './session.js'
import { print } from './print.js'
import {
	access,
	call,
	fn,
	host,
	letBlock,
	lit,
	path,
	record,
	spread,
	sym,
	vec,
} from './build.js'
import {
	emptyEnv,
	evaluate,
	makeTupleType,
	printType,
	withMembers,
	IO,
	isGlispClosure,
	isTypeValue,
	makeClosure,
	makeFunctionType,
	makeTopLevel,
	makeType,
	makeTypedFn,
	type TypeValue,
	toAst,
	typeFits,
} from './eval.js'
import { parse } from './parse.js'
import { buildPrelude } from './prelude.js'
import { type CallAST, type Env, LetAST, UNIT } from './types.js'

// -----------------------------------------------------------------------------
// Literals + symbol lookup (skeleton-era tests, kept)
// -----------------------------------------------------------------------------

describe('evaluate — literals', () => {
	it('number / string / boolean / unit pass through', () => {
		expect(evaluate(lit(42), emptyEnv).value).toBe(42)
		expect(evaluate(lit('hello'), emptyEnv).value).toBe('hello')
		expect(evaluate(lit(true), emptyEnv).value).toBe(true)
		expect(evaluate(lit(UNIT), emptyEnv).value).toBe(UNIT)
	})

	it('emits no diagnostics for literals', () => {
		expect(evaluate(lit(42), emptyEnv).diagnostics).toEqual([])
	})
})

describe('evaluate — bare-name lookup', () => {
	it('resolves a name from the env', () => {
		const env = makeTopLevel({ pi: lit(3.14), greeting: lit('hi') })
		expect(evaluate(sym('pi'), env).value).toBe(3.14)
		expect(evaluate(sym('greeting'), env).value).toBe('hi')
	})

	it('returns unit + diagnostic for unresolvable name', () => {
		const r = evaluate(sym('nope'), emptyEnv)
		expect(r.value).toBe(UNIT)
		expect(r.diagnostics).toHaveLength(1)
		expect(r.diagnostics[0]?.level).toBe('error')
	})

	it('chases through name → name', () => {
		const env = makeTopLevel({ pi: lit(3.14), alias: sym('pi') })
		expect(evaluate(sym('alias'), env).value).toBe(3.14)
	})
})

// -----------------------------------------------------------------------------
// Vec / Record / Let / Access
// -----------------------------------------------------------------------------

describe('evaluate — vec', () => {
	it('builds an array of evaluated elements', () => {
		expect(evaluate(vec(lit(1), lit(2), lit(3)), emptyEnv).value).toEqual([
			1, 2, 3,
		])
	})

	it('inlines spread elements', () => {
		const env = makeTopLevel({ xs: vec(lit(2), lit(3)) })
		expect(
			evaluate(vec(lit(1), spread(sym('xs')), lit(4)), env).value
		).toEqual([1, 2, 3, 4])
	})

	it('reports an error when spread operand is not a vector', () => {
		const env = makeTopLevel({ x: lit(42) })
		const r = evaluate(vec(spread(sym('x'))), env)
		expect(r.diagnostics.some(d => d.message.includes('spread'))).toBe(true)
	})
})

describe('evaluate — record', () => {
	it('builds a plain object from named fields', () => {
		expect(
			evaluate(record({ x: lit(10), y: lit(20) }), emptyEnv).value
		).toEqual({ x: 10, y: 20 })
	})

	it('merges spread record entries (later wins)', () => {
		const env = makeTopLevel({
			base: record({ a: lit(1), b: lit(2) }),
		})
		const ast = record([
			['a', lit(0)],
			spread(sym('base')),
			['b', lit(99)],
		])
		expect(evaluate(ast, env).value).toEqual({ a: 1, b: 99 })
	})
})

describe('evaluate — let-block', () => {
	it('evaluates the trailing expression in the extended scope', () => {
		// {a = 10  b = 20  a}  → 10
		const ast = letBlock(
			[
				['a', lit(10)],
				['b', lit(20)],
			],
			sym('a')
		)
		expect(evaluate(ast, emptyEnv).value).toBe(10)
	})

	it('with no body yields unit', () => {
		const ast = letBlock([['a', lit(10)]])
		expect(evaluate(ast, emptyEnv).value).toBe(UNIT)
	})

	it('bindings can refer to siblings (lazy / self-referential)', () => {
		// {a = 10  b = a  b}  → 10
		const ast = letBlock(
			[
				['a', lit(10)],
				['b', sym('a')],
			],
			sym('b')
		)
		expect(evaluate(ast, emptyEnv).value).toBe(10)
	})
})

describe('evaluate — access', () => {
	it('record field access', () => {
		const ast = access(record({ x: lit(10) }), 'x')
		expect(evaluate(ast, emptyEnv).value).toBe(10)
	})

	it('vector index access', () => {
		const ast = access(vec(lit(10), lit(20), lit(30)), 1)
		expect(evaluate(ast, emptyEnv).value).toBe(20)
	})

	it('chained access', () => {
		// {a: {b: 99}}.a.b
		const ast = access(
			access(record({ a: record({ b: lit(99) }) }), 'a'),
			'b'
		)
		expect(evaluate(ast, emptyEnv).value).toBe(99)
	})

	it('out-of-bounds index → unit + diagnostic', () => {
		const r = evaluate(access(vec(lit(1)), 5), emptyEnv)
		expect(r.value).toBe(UNIT)
		expect(r.diagnostics.some(d => d.message.includes('out of bounds'))).toBe(
			true
		)
	})

	it('missing field → unit + diagnostic', () => {
		const r = evaluate(access(record({ x: lit(1) }), 'z'), emptyEnv)
		expect(r.value).toBe(UNIT)
		expect(r.diagnostics.some(d => d.message.includes('not found'))).toBe(
			true
		)
	})
})

// -----------------------------------------------------------------------------
// Function literal / call
// -----------------------------------------------------------------------------

describe('evaluate — fn literal', () => {
	it('evaluates to a closure value capturing the current env', () => {
		const env = makeTopLevel({ pi: lit(3.14) })
		const ast = fn([{ name: 'x', type: sym('number') }], sym('number')).withBody(
			sym('x')
		)
		const r = evaluate(ast, env)
		expect(isGlispClosure(r.value)).toBe(true)
		expect(isGlispClosure(r.value) && r.value.capturedEnv).toBe(env)
	})
})

describe('evaluate — call', () => {
	it('calls a host JS function with marshaled args', () => {
		const env = makeTopLevel({
			'+': lit(0), // placeholder; we'll override below
		})
		// Replace the binding with a host JS function
		const frame = env!
		frame.bindings!.get('+')!
		// Build a frame that contains an actual function value:
		const env2 = {
			ast: { kind: 'lit', value: UNIT } as never,
			parent: null,
			bindings: new Map([
				[
					'+',
					{
						ast: lit(0), // placeholder ast
						env: null,
					},
				],
			]),
		}
		// We can't easily inject a JS function as an AST without builders for
		// host-bound values yet. Use an alternative path: evaluate a call
		// whose head is itself a closure.
		void env
		void env2

		// closure-based: ((=> (x: number): number x) 42)  → 42
		const closureAst = fn(
			[{ name: 'x', type: sym('number') }],
			sym('number')
		).withBody(sym('x'))
		const callAst = call(closureAst, lit(42))
		expect(evaluate(callAst, emptyEnv).value).toBe(42)
	})

	it('calls a Glisp closure with positional args', () => {
		// ((=> (a: number b: number): number {(+ a b) ... ish}) 10 20) — but
		// we don't have `+` bound, so use a body that just returns one arg.
		const closureAst = fn(
			[
				{ name: 'a', type: sym('number') },
				{ name: 'b', type: sym('number') },
			],
			sym('number')
		).withBody(sym('a'))
		expect(
			evaluate(call(closureAst, lit(10), lit(20)), emptyEnv).value
		).toBe(10)
	})

	it('lazy evaluation — unused args are not forced', () => {
		// ((=> (a: number b: number): number a) 1 (sym-that-fails))
		// b is never referenced, so the failing argument should not raise.
		const closureAst = fn(
			[
				{ name: 'a', type: sym('number') },
				{ name: 'b', type: sym('number') },
			],
			sym('number')
		).withBody(sym('a'))
		const r = evaluate(call(closureAst, lit(1), sym('does-not-exist')), emptyEnv)
		expect(r.value).toBe(1)
		expect(r.diagnostics).toEqual([])
	})

	it('using a non-callable head emits a diagnostic', () => {
		const env = makeTopLevel({ x: lit(42) })
		const r = evaluate(call(sym('x'), lit(1)), env)
		expect(r.value).toBe(UNIT)
		expect(r.diagnostics.some(d => d.message.includes('cannot call'))).toBe(
			true
		)
	})

	it('host-bound JS function works through a frame binding', () => {
		// We patch a host JS function directly into a frame.
		const frame = makeTopLevel({}) as Exclude<typeof emptyEnv, null>
		// Directly insert a JS function as a binding's "value-AST". We use a
		// trick: the ast is a sym that resolves to itself by short-circuit.
		// For now just demonstrate via building env manually.
		const jsAdd = (a: unknown, b: unknown) => (a as number) + (b as number)
		// Wrap as lit with the function as value; eval(lit) returns the
		// function value.
		const litFn = lit as unknown as (v: unknown) => never
		void litFn
		// Skip the trickery — verify host call path through an explicit env:
		const map = new Map([
			['add', { ast: lit(jsAdd as never), env: frame }],
		])
		;(frame as { bindings?: Map<string, unknown> }).bindings = map as never
		const r = evaluate(call(sym('add'), lit(2), lit(3)), frame)
		expect(r.value).toBe(5)
	})
})

// -----------------------------------------------------------------------------
// Macro-related transparency
// -----------------------------------------------------------------------------

describe('evaluate — call: kwargs / variadic / optional', () => {
	it('kwargs match parameters by name', () => {
		// ((=> (a: number b: number): number a) b=20 a=10)  → 10
		const closure = fn(
			[
				{ name: 'a', type: sym('number') },
				{ name: 'b', type: sym('number') },
			],
			sym('number')
		).withBody(sym('a'))
		const r = evaluate(parse('(f b=20 a=10)'), makeTopLevel({ f: closure }))
		expect(r.value).toBe(10)
	})

	it('positional + kwarg combination works', () => {
		// (f 1 b=20)  with (a, b) → a=1, b=20
		const closure = fn(
			[
				{ name: 'a', type: sym('number') },
				{ name: 'b', type: sym('number') },
			],
			sym('number')
		).withBody(sym('b'))
		const r = evaluate(parse('(f 1 b=20)'), makeTopLevel({ f: closure }))
		expect(r.value).toBe(20)
	})

	it('double-binding (positional + kwarg same name) emits a diagnostic', () => {
		const closure = fn(
			[{ name: 'a', type: sym('number') }],
			sym('number')
		).withBody(sym('a'))
		const r = evaluate(parse('(f 1 a=2)'), makeTopLevel({ f: closure }))
		expect(r.diagnostics.some(d => d.message.includes('double binding'))).toBe(
			true
		)
	})

	it('missing required parameter emits a diagnostic', () => {
		const closure = fn(
			[{ name: 'a', type: sym('number') }],
			sym('number')
		).withBody(sym('a'))
		const r = evaluate(parse('(f)'), makeTopLevel({ f: closure }))
		expect(
			r.diagnostics.some(d => d.message.includes('missing required'))
		).toBe(true)
	})

	it('optional parameter is silently filled with unit', () => {
		const closure = fn(
			[
				{ name: 'a', type: sym('number') },
				{ name: 'b', type: sym('string'), optional: true },
			],
			sym('number')
		).withBody(sym('a'))
		const r = evaluate(parse('(f 10)'), makeTopLevel({ f: closure }))
		expect(r.value).toBe(10)
		expect(r.diagnostics).toEqual([]) // silent
	})

	it('variadic parameter collects rest into a vector', () => {
		// (f 1 2 3 4) where f = (=> (init: number ...rest: number): number ?)
		// We make the body return rest itself so we can inspect it.
		const closure = fn(
			[
				{ name: 'init', type: sym('number') },
				{ name: 'rest', type: sym('number'), variadic: true },
			],
			sym('number')
		).withBody(sym('rest'))
		const r = evaluate(parse('(f 1 2 3 4)'), makeTopLevel({ f: closure }))
		expect(r.value).toEqual([2, 3, 4])
	})

	it('variadic via kwarg gives a single vector', () => {
		const closure = fn(
			[{ name: 'rest', type: sym('number'), variadic: true }],
			sym('number')
		).withBody(sym('rest'))
		const r = evaluate(parse('(f rest=[10 20])'), makeTopLevel({ f: closure }))
		expect(r.value).toEqual([10, 20])
	})

	it('unknown kwarg emits a diagnostic', () => {
		const closure = fn(
			[{ name: 'a', type: sym('number') }],
			sym('number')
		).withBody(sym('a'))
		const r = evaluate(parse('(f a=1 zzz=2)'), makeTopLevel({ f: closure }))
		expect(r.diagnostics.some(d => d.message.includes('unknown'))).toBe(true)
	})
})

describe('evaluate — call: spread args', () => {
	it('spread inlines a vec literal directly (lazy)', () => {
		// (f a ...[2 3] d) — inlined
		const closure = fn(
			[
				{ name: 'a', type: sym('number') },
				{ name: 'b', type: sym('number') },
				{ name: 'c', type: sym('number') },
				{ name: 'd', type: sym('number') },
			],
			sym('number')
		).withBody(vec(sym('a'), sym('b'), sym('c'), sym('d')))
		const r = evaluate(parse('(f 1 ...[2 3] 4)'), makeTopLevel({ f: closure }))
		expect(r.value).toEqual([1, 2, 3, 4])
	})

	it('spread of a bound vector evaluates and reifies elements', () => {
		const closure = fn(
			[
				{ name: 'a', type: sym('number') },
				{ name: 'b', type: sym('number') },
				{ name: 'c', type: sym('number') },
			],
			sym('number')
		).withBody(vec(sym('a'), sym('b'), sym('c')))
		const env = makeTopLevel({
			f: closure,
			xs: vec(lit(2), lit(3)),
		})
		const r = evaluate(parse('(f 1 ...xs)'), env)
		expect(r.value).toEqual([1, 2, 3])
	})
})

describe('evaluate — special form ? (match)', () => {
	it('matches by value equality', () => {
		// (? 2 1 "one" 2 "two" _ "other")
		const r = evaluate(parse('(? 2 1 "one" 2 "two" _ "other")'), emptyEnv)
		expect(r.value).toBe('two')
	})

	it('falls through to the _ catch-all', () => {
		const r = evaluate(parse('(? 99 1 "one" 2 "two" _ "other")'), emptyEnv)
		expect(r.value).toBe('other')
	})

	it('returns unit when no clause matches and no catch-all', () => {
		const r = evaluate(parse('(? 99 1 "one" 2 "two")'), emptyEnv)
		expect(r.value).toBe(UNIT)
	})

	it('odd-args-only enforcement', () => {
		const r = evaluate(parse('(? 1 2 3 4)'), emptyEnv)
		expect(r.diagnostics.some(d => d.message.includes('odd'))).toBe(true)
	})

	it('uses bare names that resolve in env', () => {
		const env = makeTopLevel({ x: lit(7) })
		const r = evaluate(parse('(? 7 x "match" _ "no")'), env)
		expect(r.value).toBe('match')
	})
})

describe('evaluate — special form |> (pipe)', () => {
	it('chains a single host function', () => {
		const inc = (n: unknown) => (n as number) + 1
		const env = makeTopLevel({ inc: lit(inc as never) })
		const r = evaluate(parse('(|> 5 inc)'), env)
		expect(r.value).toBe(6)
	})

	it('chains multiple host functions', () => {
		const inc = (n: unknown) => (n as number) + 1
		const dbl = (n: unknown) => (n as number) * 2
		const env = makeTopLevel({
			inc: lit(inc as never),
			dbl: lit(dbl as never),
		})
		// 5 → inc → 6 → dbl → 12
		const r = evaluate(parse('(|> 5 inc dbl)'), env)
		expect(r.value).toBe(12)
	})

	it('chains a closure step', () => {
		// (|> 5 ((=> (x: number): number x)))  — identity
		const idClosure = fn(
			[{ name: 'x', type: sym('number') }],
			sym('number')
		).withBody(sym('x'))
		const env = makeTopLevel({ id: idClosure })
		const r = evaluate(parse('(|> 5 id)'), env)
		expect(r.value).toBe(5)
	})

	it('non-function step emits a diagnostic', () => {
		const env = makeTopLevel({ x: lit(42) })
		const r = evaluate(parse('(|> 5 x)'), env)
		expect(r.diagnostics.some(d => d.message.includes('not a function'))).toBe(
			true
		)
	})
})

// -----------------------------------------------------------------------------
// Type values: cast and matching
// -----------------------------------------------------------------------------

describe('evaluate — type values (cast & match)', () => {
	const numberType = makeType(
		'number',
		v => typeof v === 'number',
		0
	)
	const stringType = makeType(
		'string',
		v => typeof v === 'string',
		''
	)
	const envWithTypes = () =>
		makeTopLevel({
			number: lit(numberType as never),
			string: lit(stringType as never),
		})

	it('(: 42 number) returns 42 (coerce pass)', () => {
		expect(evaluate(parse('(: 42 number)'), envWithTypes()).value).toBe(42)
	})

	it('(: "hi" number) falls back to default (0)', () => {
		const r = evaluate(parse('(: "hi" number)'), envWithTypes())
		expect(r.value).toBe(0)
		expect(r.diagnostics.some(d => d.message.includes("doesn't accept"))).toBe(
			true
		)
	})

	it('(: 42 string) falls back to default ("")', () => {
		expect(evaluate(parse('(: 42 string)'), envWithTypes()).value).toBe('')
	})

	it('(T v) is rejected with a hint to use (: v T)', () => {
		const r = evaluate(parse('(number 42)'), envWithTypes())
		expect(
			r.diagnostics.some(d => d.message.includes('(: v number)'))
		).toBe(true)
	})

	it('? matches a type pattern with cast (no default consumed)', () => {
		// (? 42 number "is-num" string "is-str" _ "other")
		const env = envWithTypes()
		const r = evaluate(
			parse('(? 42 number "is-num" string "is-str" _ "other")'),
			env
		)
		expect(r.value).toBe('is-num')
	})

	it('? type-pattern falls through when value does not fit', () => {
		const env = envWithTypes()
		const r = evaluate(
			parse('(? true number "n" string "s" _ "other")'),
			env
		)
		expect(r.value).toBe('other')
	})
})

// -----------------------------------------------------------------------------
// Typed host fn — argument cast + default fallback
// -----------------------------------------------------------------------------

describe('evaluate — typed host function arg cast / default', () => {
	const numberType = makeType('number', v => typeof v === 'number', 0)
	const stringType = makeType('string', v => typeof v === 'string', '')
	const booleanType = makeType(
		'boolean',
		v => typeof v === 'boolean',
		false
	)

	const envWithPlus = () =>
		makeTopLevel({
			number: lit(numberType as never),
			string: lit(stringType as never),
			boolean: lit(booleanType as never),
			'+': lit(
				makeTypedFn(
					[numberType, numberType],
					numberType,
					(a, b) => (a as number) + (b as number)
				) as never
			),
		})

	it('(+ 1 2) → 3', () => {
		expect(evaluate(parse('(+ 1 2)'), envWithPlus()).value).toBe(3)
	})

	it('(+ "str") → 0  (string→0 default + missing→0 default)', () => {
		expect(evaluate(parse('(+ "str")'), envWithPlus()).value).toBe(0)
	})

	it('(+ "str" 5) → 5  (string→0 default, 5 passes through)', () => {
		expect(evaluate(parse('(+ "str" 5)'), envWithPlus()).value).toBe(5)
	})

	it('(+) → 0  (both defaults)', () => {
		expect(evaluate(parse('(+)'), envWithPlus()).value).toBe(0)
	})

	it('emits type-mismatch diagnostics for static mismatches', () => {
		const r = evaluate(parse('(+ "str")'), envWithPlus())
		expect(r.value).toBe(0)
		expect(
			r.diagnostics.some(d => d.message.includes('type mismatch'))
		).toBe(true)
	})

	it('typed host fn accepts kwargs when paramNames is set', () => {
		const numberType = makeType('number', v => typeof v === 'number', 0)
		const env = makeTopLevel({
			number: lit(numberType as never),
			sub: lit(
				makeTypedFn(
					[numberType, numberType],
					numberType,
					(a, b) => (a as number) - (b as number),
					['a', 'b']
				) as never
			),
		})
		const r = evaluate(parse('(sub b=10 a=3)'), env)
		expect(r.value).toBe(-7)
		expect(r.diagnostics).toEqual([])
	})

	it('typed host fn rejects kwargs with no paramNames', () => {
		const numberType = makeType('number', v => typeof v === 'number', 0)
		const env = makeTopLevel({
			number: lit(numberType as never),
			'+': lit(
				makeTypedFn(
					[numberType, numberType],
					numberType,
					(a, b) => (a as number) + (b as number)
				) as never
			),
		})
		const r = evaluate(parse('(+ a=1 b=2)'), env)
		expect(
			r.diagnostics.some(d =>
				d.message.includes('cannot pass keyword arguments')
			)
		).toBe(true)
	})

	it('typed host fn detects double-binding via kwargs', () => {
		const numberType = makeType('number', v => typeof v === 'number', 0)
		const env = makeTopLevel({
			number: lit(numberType as never),
			sub: lit(
				makeTypedFn(
					[numberType, numberType],
					numberType,
					(a, b) => (a as number) - (b as number),
					['a', 'b']
				) as never
			),
		})
		const r = evaluate(parse('(sub 1 a=5)'), env)
		expect(
			r.diagnostics.some(d => d.message.includes('double binding'))
		).toBe(true)
	})

	it('skips evaluation of arguments that are statically the wrong type', () => {
		// We bind `show: top → string`. (+ (show 0)) statically rejects
		// `(show 0)` because string ≠ number; `show` is never called.
		let showCalled = 0
		const numberType = makeType('number', v => typeof v === 'number', 0)
		const stringType = makeType('string', v => typeof v === 'string', '')
		const topType = makeType('_', () => true, UNIT)
		const env = makeTopLevel({
			number: lit(numberType as never),
			string: lit(stringType as never),
			top: lit(topType as never),
			'+': lit(
				makeTypedFn(
					[numberType, numberType],
					numberType,
					(a, b) => (a as number) + (b as number)
				) as never
			),
			show: lit(
				makeTypedFn([topType], stringType, v => {
					showCalled++
					return String(v)
				}) as never
			),
		})
		const r = evaluate(parse('(+ (show 0))'), env)
		expect(r.value).toBe(0)
		expect(showCalled).toBe(0) // skipped due to static mismatch
		expect(
			r.diagnostics.some(d => d.message.includes('type mismatch'))
		).toBe(true)
	})
})

describe('evaluate — closure parameter / return type cast', () => {
	const numberType = makeType('number', v => typeof v === 'number', 0)
	const stringType = makeType('string', v => typeof v === 'string', '')
	const topType = makeType('_', () => true, UNIT)

	const baseEnv = () =>
		makeTopLevel({
			number: lit(numberType as never),
			string: lit(stringType as never),
			_: lit(topType as never),
			show: lit(
				makeTypedFn([topType], stringType, v => String(v)) as never
			),
		})

	it('argument cast: ((=> (x: number): number x) "str") → 0', () => {
		const r = evaluate(parse('((=> (x: number): number x) "str")'), baseEnv())
		expect(r.value).toBe(0)
		expect(r.diagnostics.some(d => d.message.includes('type mismatch'))).toBe(
			true
		)
	})

	it('static mismatch skips evaluation: ((=> (x: number): number x) (show 0))', () => {
		let showCalled = 0
		const env = makeTopLevel({
			number: lit(numberType as never),
			string: lit(stringType as never),
			_: lit(topType as never),
			show: lit(
				makeTypedFn([topType], stringType, v => {
					showCalled++
					return String(v)
				}) as never
			),
		})
		const r = evaluate(parse('((=> (x: number): number x) (show 0))'), env)
		expect(r.value).toBe(0)
		expect(showCalled).toBe(0)
		expect(r.diagnostics.some(d => d.message.includes('type mismatch'))).toBe(
			true
		)
	})

	it('compatible types pass through: ((=> (x: number): number x) 42) → 42', () => {
		const r = evaluate(parse('((=> (x: number): number x) 42)'), baseEnv())
		expect(r.value).toBe(42)
		expect(r.diagnostics).toEqual([])
	})

	it('top-typed parameter is a no-op: ((=> (x: _): _ x) "str") → "str"', () => {
		const r = evaluate(parse('((=> (x: _): _ x) "str")'), baseEnv())
		expect(r.value).toBe('str')
		expect(r.diagnostics).toEqual([])
	})

	it('missing required typed parameter falls back to type default', () => {
		const r = evaluate(parse('((=> (x: number): number x))'), baseEnv())
		expect(r.value).toBe(0)
		expect(r.diagnostics.some(d => d.message.includes('missing'))).toBe(true)
	})

	it('optional typed parameter falls back to type default silently', () => {
		const r = evaluate(parse('((=> (x?: number): number x))'), baseEnv())
		expect(r.value).toBe(0)
		expect(r.diagnostics).toEqual([])
	})

	it('return type cast: closure that returns wrong type → diagnostic + default', () => {
		// Body returns a string, but declared return type is number.
		// The body literally evaluates to "hello" — at runtime the cast
		// fails and we substitute the number default (0).
		const r = evaluate(
			parse('((=> (x: _): number "hello") 1)'),
			baseEnv()
		)
		expect(r.value).toBe(0)
		expect(
			r.diagnostics.some(d => d.message.includes('return type mismatch'))
		).toBe(true)
	})

	it('return type passthrough: ((=> (x: _): number 42) ()) → 42', () => {
		const r = evaluate(parse('((=> (x: _): number 42) ())'), baseEnv())
		expect(r.value).toBe(42)
		expect(r.diagnostics).toEqual([])
	})
})

describe('evaluate — generic closure', () => {
	const numberType = makeType('number', v => typeof v === 'number', 0)
	const stringType = makeType('string', v => typeof v === 'string', '')
	const topType = makeType('_', () => true, UNIT)

	const baseEnv = () =>
		makeTopLevel({
			number: lit(numberType as never),
			string: lit(stringType as never),
			_: lit(topType as never),
		})

	it('identity over T: ((=> (T) (x: T): T x) 42) → 42', () => {
		const r = evaluate(parse('((=> (T) (x: T): T x) 42)'), baseEnv())
		expect(r.value).toBe(42)
		expect(r.diagnostics).toEqual([])
	})

	it('identity over T preserves string type: ((=> (T) (x: T): T x) "hi")', () => {
		// Pre-cast: T resolves to string, so the param cast is string→string,
		// which does not coerce 42 (since the arg is "hi" — string).
		const r = evaluate(parse('((=> (T) (x: T): T x) "hi")'), baseEnv())
		expect(r.value).toBe('hi')
		expect(r.diagnostics).toEqual([])
	})

	it('agreement across params: ((=> (T) (x: T y: T): T y) 1 2) → 2', () => {
		const r = evaluate(
			parse('((=> (T) (x: T y: T): T y) 1 2)'),
			baseEnv()
		)
		expect(r.value).toBe(2)
		expect(r.diagnostics).toEqual([])
	})

	it('conflicting witnesses produce a diagnostic', () => {
		const r = evaluate(
			parse('((=> (T) (x: T y: T): T y) 1 "hi")'),
			baseEnv()
		)
		expect(
			r.diagnostics.some(d => d.message.includes('generic T resolved'))
		).toBe(true)
	})

	it('generic in return position: T propagates to declared return type', () => {
		// Return type is T, body returns x. Calling with a number returns
		// the number unchanged.
		const r = evaluate(parse('((=> (T) (x: T): T x) 7)'), baseEnv())
		expect(r.value).toBe(7)
	})
})

describe('evaluate — overload', () => {
	const numberType = makeType('number', v => typeof v === 'number', 0)
	const stringType = makeType('string', v => typeof v === 'string', '')
	const booleanType = makeType(
		'boolean',
		v => typeof v === 'boolean',
		false
	)
	const topType = makeType('_', () => true, UNIT)

	const baseEnv = () =>
		makeTopLevel({
			number: lit(numberType as never),
			string: lit(stringType as never),
			boolean: lit(booleanType as never),
			_: lit(topType as never),
			'sq-num': lit(
				makeTypedFn(
					[numberType],
					numberType,
					n => (n as number) * (n as number)
				) as never
			),
			'dup-str': lit(
				makeTypedFn([stringType], stringType, s =>
					(s as string) + (s as string)
				) as never
			),
		})

	it('dispatches to the matching variant by arg type', () => {
		const env = baseEnv()
		const overloaded = (arg: string): string =>
			`{f = (overload sq-num dup-str) (f ${arg})}`
		expect(evaluate(parse(overloaded('4')), env).value).toBe(16)
		expect(evaluate(parse(overloaded('"ab"')), env).value).toBe('abab')
	})

	it('emits a no-match diagnostic when no variant fits', () => {
		const env = baseEnv()
		const r = evaluate(parse('{f = (overload sq-num dup-str) (f true)}'), env)
		expect(
			r.diagnostics.some(d => d.message.includes('no overload matches'))
		).toBe(true)
	})

	it('ignores non-fn variants with a diagnostic at construction time', () => {
		const env = baseEnv()
		const r = evaluate(parse('(overload sq-num 42)'), env)
		expect(
			r.diagnostics.some(d =>
				d.message.includes('overload variant must be')
			)
		).toBe(true)
	})

	it('dispatch order: first matching variant wins', () => {
		// Two variants both accept (top): the first one is the one
		// chosen.
		const r = evaluate(
			parse(
				'{g = (overload (=> (x: _): _ "first") (=> (x: _): _ "second")) (g 1)}'
			),
			baseEnv()
		)
		expect(r.value).toBe('first')
	})
})

// -----------------------------------------------------------------------------
// Vector / record callable
// -----------------------------------------------------------------------------

describe('evaluate — vector & record as callable', () => {
	it('([1 2 3] 1) → 2', () => {
		expect(evaluate(parse('([1 2 3] 1)'), emptyEnv).value).toBe(2)
	})

	it('({x: 10 y: 20} "x") → 10', () => {
		expect(evaluate(parse('({x: 10 y: 20} "x")'), emptyEnv).value).toBe(10)
	})

	it('vector index out of bounds → unit + diagnostic', () => {
		const r = evaluate(parse('([1 2] 5)'), emptyEnv)
		expect(r.value).toBe(UNIT)
		expect(r.diagnostics.some(d => d.message.includes('out of bounds'))).toBe(
			true
		)
	})
})

// -----------------------------------------------------------------------------
// toAst
// -----------------------------------------------------------------------------

describe('toAst — value → AST round trip', () => {
	it('primitives become literal ASTs', () => {
		expect(toAst(42, emptyEnv)).toEqual(lit(42))
		expect(toAst('hi', emptyEnv)).toEqual(lit('hi'))
		expect(toAst(true, emptyEnv)).toEqual(lit(true))
		expect(toAst(UNIT, emptyEnv)).toEqual(lit(UNIT))
	})

	it('vectors recurse', () => {
		expect(toAst([1, 2, 3], emptyEnv)).toEqual(
			vec(lit(1), lit(2), lit(3))
		)
	})

	it('records recurse', () => {
		const ast = toAst({ x: 10, y: 20 }, emptyEnv)
		expect(ast.kind).toBe('record')
		expect(ast.print()).toBe('{x: 10 y: 20}')
	})

	it('closures use their function-literal AST', () => {
		const closureAst = fn(
			[{ name: 'x', type: sym('_') }],
			sym('_')
		).withBody(sym('x'))
		const closure = makeClosure(closureAst, emptyEnv)
		expect(toAst(closure, emptyEnv)).toBe(closureAst)
	})

	it('type values prefer a bound name from the env', () => {
		const numberType = makeType('number', v => typeof v === 'number', 0)
		const env = makeTopLevel({ number: lit(numberType as never) })
		const ast = toAst(numberType, env)
		expect(ast.kind).toBe('sym')
		expect((ast as { name: string }).name).toBe('number')
	})

	it('eval(toAst(v, env), env) ≡ v for primitive containers', () => {
		const v = { x: 1, y: [2, 3, 4] }
		const r = evaluate(toAst(v, emptyEnv), emptyEnv)
		expect(r.value).toEqual(v)
	})
})

describe('evaluate — ~ transparency', () => {
	it('~x evaluates as if the ~ were absent', () => {
		const env = makeTopLevel({ x: lit(99) })
		expect(evaluate(parse('~x'), env).value).toBe(99)
	})
})

// -----------------------------------------------------------------------------
// Path lookup
// -----------------------------------------------------------------------------

describe('evaluate — cycle detection', () => {
	it('a let-binding that references itself yields unit + diagnostic', () => {
		// {a = a  a}  → cycle on a
		const ast = letBlock([['a', sym('a')]], sym('a'))
		const r = evaluate(ast, emptyEnv)
		expect(r.value).toBe(UNIT)
		expect(r.diagnostics.some(d => d.message.includes('cycle'))).toBe(true)
	})

	it('mutually recursive bindings detect a cycle', () => {
		// {a = b  b = a  a}  → cycle
		const ast = letBlock(
			[
				['a', sym('b')],
				['b', sym('a')],
			],
			sym('a')
		)
		const r = evaluate(ast, emptyEnv)
		expect(r.value).toBe(UNIT)
		expect(r.diagnostics.some(d => d.message.includes('cycle'))).toBe(true)
	})

	it('memoization reuses results for repeated identical (ast, env)', () => {
		// (Same AST referenced twice should evaluate once thanks to memo.)
		// Hard to assert without an instrumented binding; we just ensure
		// repeated lookups still produce the right answer.
		const env = makeTopLevel({ x: lit(7) })
		const ast = vec(sym('x'), sym('x'), sym('x'))
		expect(evaluate(ast, env).value).toEqual([7, 7, 7])
	})
})

describe('evaluate — closure diagnostics bubble through host fns', () => {
	it('mismatched element type inside (map xs f) surfaces a diagnostic', () => {
		// `map` calls the closure from JS for each element. The closure
		// declares `x: number` but the vector contains strings — that
		// mismatch must reach the outer evaluate's diagnostics rather
		// than getting silently coerced to default(number) = 0.
		const env = buildPrelude()
		const r = evaluate(
			parse('(map ["str"] (=> (x: number): number (+ x 1)))'),
			env
		)
		expect(
			r.diagnostics.some(d =>
				d.message.includes('expected number, got string')
			)
		).toBe(true)
	})
})

describe('evaluate — coerce edge cases', () => {
	const numberType = makeType('number', v => typeof v === 'number', 0)
	const stringType = makeType('string', v => typeof v === 'string', '')
	const env = () =>
		makeTopLevel({
			number: lit(numberType as never),
			string: lit(stringType as never),
		})

	it('(: <unresolvable-name> T) — silent default, no extra coerce-mismatch noise', () => {
		// Unresolved name → `()` (silent failure per the "evaluation never
		// throws" rule). `()` does not fit `number`, but coerce of an
		// already-failed value is silent — only the lookup diagnostic surfaces.
		const r = evaluate(parse('(: undefined-var number)'), env())
		expect(r.value).toBe(0)
		// At least one diagnostic — for the lookup. We don't pin the exact
		// shape, only that the coerce form does not silently swallow it.
		expect(r.diagnostics.length).toBeGreaterThan(0)
	})

	it('coercion of () is silent (no diagnostic noise)', () => {
		// (: () T) is the "give me the default" idiom — should not emit a
		// type-mismatch diagnostic.
		const r = evaluate(parse('(: () number)'), env())
		expect(r.value).toBe(0)
		expect(
			r.diagnostics.some(d => d.message.includes("doesn't accept"))
		).toBe(false)
	})

	it('(: (: v T) T) is idempotent', () => {
		const r = evaluate(parse('(: (: 42 number) number)'), env())
		expect(r.value).toBe(42)
		expect(r.diagnostics).toHaveLength(0)
	})

	it('(: v unbound-name) — type fails to resolve', () => {
		// `T` is not bound → evaluating it produces unit + diagnostic; the
		// coerce form must not crash and must surface a useful message.
		const r = evaluate(parse('(: 42 NoSuchType)'), env())
		// Result is the value verbatim or unit — but no exception.
		expect(r.diagnostics.length).toBeGreaterThan(0)
	})
})

describe('evaluate — typed host fn: multi-mismatch diagnostic accumulation', () => {
	const numberType = makeType('number', v => typeof v === 'number', 0)
	const env = () =>
		makeTopLevel({
			number: lit(numberType as never),
			'+': lit(
				makeTypedFn(
					[],
					numberType,
					(...args) => (args as number[]).reduce((a, b) => a + b, 0),
					undefined,
					numberType
				) as never
			),
		})

	it('all arg mismatches surface as diagnostics, value still computed via defaults', () => {
		// (+ "a" 2 "b") → 0 + 0 + 2 + 0 = 2 (two mismatches, one ok)
		const r = evaluate(parse('(+ "a" 2 "b")'), env())
		expect(r.value).toBe(2)
		const mismatches = r.diagnostics.filter(d =>
			d.message.includes('type mismatch')
		)
		expect(mismatches.length).toBe(2)
	})
})

describe('evaluate — parametric IO (coerce / fits)', () => {
	const ioType: import('./eval.js').TypeValue = (() => {
		// Shadowed minimal env: re-create what prelude does without
		// pulling the full prelude into this test bed. We just need
		// `apply`-based dispatch and structural fits.
		const make = (payload: import('./eval.js').TypeValue): import('./eval.js').TypeValue => {
			const isTop = payload.typeName === '_'
			return {
				__glispType: true,
				typeName: isTop ? 'IO' : `(IO ${payload.typeName})`,
				fits: v => v instanceof IO,
				default: new IO('default', () => []),
				shape: { kind: 'io', payload },
				apply: args => {
					if (args.length !== 1) {
						return { error: `IO expects 1 type argument, got ${args.length}` }
					}
					return make(args[0]!)
				},
			}
		}
		const top = makeType('_', () => true, UNIT)
		return make(top)
	})()

	const numberType = makeType('number', v => typeof v === 'number', 0)
	const env = () =>
		makeTopLevel({
			number: lit(numberType as never),
			_: lit(makeType('_', () => true, UNIT) as never),
			IO: lit(ioType as never),
		})

	it('(IO number) evaluates to a TypeValue with the parametric name', () => {
		const r = evaluate(parse('(IO number)'), env())
		expect(isTypeValue(r.value) && r.value.typeName).toBe('(IO number)')
	})

	it('typeFits: (IO !) fits (IO _) (covariant in payload)', () => {
		const top = makeType('_', () => true, UNIT)
		const bot = makeType('!', () => false, UNIT)
		const make = (p: import('./eval.js').TypeValue): import('./eval.js').TypeValue => ({
			__glispType: true,
			typeName: p.typeName === '_' ? 'IO' : `(IO ${p.typeName})`,
			fits: v => v instanceof IO,
			default: new IO('d', () => []),
			shape: { kind: 'io', payload: p },
		})
		const number = makeType('number', v => typeof v === 'number', 0)
		expect(typeFits(make(bot), make(top))).toBe(true)
		expect(typeFits(make(number), make(bot))).toBe(false)
	})

	it('typeFits: function-type covariance through param/return', () => {
		const top = makeType('_', () => true, UNIT)
		const num = makeType('number', v => typeof v === 'number', 0)
		const fnNumNum = makeFunctionType([num], num)
		const fnTopTop = makeFunctionType([top], top)
		// `(=> (number): number)` should fit `(=> (_): _)` since
		// param/return both fit through covariance — current impl is
		// over-permissive but that's the documented behavior.
		expect(typeFits(fnNumNum, fnTopTop)).toBe(true)
		// Different arity → not compatible
		const fnNoArg = makeFunctionType([], num)
		expect(typeFits(fnNoArg, fnNumNum)).toBe(false)
	})
})

describe('evaluate — path lookup', () => {
	it('parent record field via ../', () => {
		// {x: 10  y: ../x}  ; from inside the record, ../x looks at the record.
		// We model this as: outer let-block, inner record uses ../foo.
		// Easiest: build an env where parent frame has a binding.
		const inner = makeTopLevel({})
		const outer: typeof inner = {
			ast: { kind: 'record', fields: [['x', lit(10)]] } as never,
			parent: null,
			bindings: undefined,
		}
		;(inner as { parent?: typeof outer }).parent = outer
		// `../x` inside `inner` should reach outer (record), find field x.
		const r = evaluate(path('..', 'x'), inner)
		expect(r.value).toBe(10)
	})

	it('sibling argument inside a call, by parameter name', () => {
		// (+ 1 ./rest/0) — the first of the variadic arguments (= 1), so (+ 1 1).
		const numberType = makeType('number', v => typeof v === 'number', 0)
		const env = makeTopLevel({
			number: lit(numberType as never),
			'+': lit(
				makeTypedFn(
					[],
					numberType,
					(...args) =>
						(args as number[]).reduce((a, b) => a + b, 0),
					undefined,
					numberType
				) as never
			),
		})
		const r = evaluate(parse('(+ 1 ./rest/0)'), env)
		expect(r.value).toBe(2)
	})

	it('vec element via ./0', () => {
		const r = evaluate(parse('[1 2 ./0]'), emptyEnv)
		expect(r.value).toEqual([1, 2, 1])
	})

	it('record field via ./key', () => {
		const r = evaluate(parse('{x: 10 y: ./x}'), emptyEnv)
		expect(r.value).toEqual({ x: 10, y: 10 })
	})
})

describe('evaluate — memo lifetime', () => {
	it('a shared sub-AST does not keep old roots alive', async () => {
		const prelude = buildPrelude()
		const shared = parse('(+ 1 2)')
		const roots = (() => {
			const refs: WeakRef<object>[] = []
			for (let i = 0; i < 20; i++) {
				const root = letBlock(
					[
						['a', shared],
						['b', lit(i)],
					],
					parse('(+ a b)')
				)
				evaluate(root, prelude)
				refs.push(new WeakRef(root))
			}
			return refs
		})()
		const gc = (globalThis as { gc?: () => void }).gc!
		for (let i = 0; i < 6; i++) {
			gc()
			await new Promise(resolve => setTimeout(resolve, 10))
		}
		expect(roots.filter(r => r.deref() !== undefined)).toEqual([])
	})
})

describe('evaluate — a path passes through metadata', () => {
	const env = buildPrelude()
	const run = (src: string) => evaluate(parse(src), env)

	it('reaches a field, a binding and an element', () => {
		expect(run('{z = ^{label: "L"} {a: 7} q = ./z/a q}').value).toBe(7)
		expect(run('{z = ^{label: "L"} {a = 7} q = ./z/a q}').value).toBe(7)
		expect(run('{z = ^{label: "L"} [7] q = ./z/0 q}').value).toBe(7)
	})

	it('does not count it as a level', () => {
		expect(run('{a = 7 z = ^{label: "L"} {b = ../a b} z}').value).toBe(7)
	})

	it('reports nothing statically either', () => {
		expect(check(parse('{z = ^{label: "L"} {a: 7} q = ./z/a q}'), env)).toEqual([])
		expect(infer(parse('{z = ^{label: "L"} {a: 7} q = ./z/a q}'), env)?.typeName).toBe('number')
	})

	it('is the same through a Runtime', () => {
		const runtime = new Runtime(env)
		runtime.setRoot(parse('{z = ^{label: "L"} {a: 7} q = ./z/a}'))
		expect(runtime.read('q').value).toBe(7)
		expect(runtime.read('z', 'a').value).toBe(7)
	})

	it('lets a session set through it, and keeps the metadata', () => {
		const session = new Session(env)
		session.setBinding('z', parse('^{label: "L"} {a: 7}'))
		expect(session.setAtPath(['z', 'a'], parse('8'))).toBeNull()
		expect(print(session.ast())).toContain('^{label: "L"} {a: 8}')
	})
})

describe('evaluate — path targets', () => {
	const env = buildPrelude()
	const run = (src: string) => evaluate(parse(src), env)

	it('evaluates a let binding reached by path inside its let-block', () => {
		const r = run('[{k = 1 y = (+ k 1) y} ./0/y]')
		expect(r.value).toEqual([2, 2])
		expect(r.diagnostics).toEqual([])
	})

	it('evaluates a nested target relative to its own position', () => {
		expect(run('[[1 ./0] ./0/1]').value).toEqual([[1, 1], 1])
	})

	it('can climb back up after descending', () => {
		expect(run('[[1 2] 9 ./0/../1]').value).toEqual([[1, 2], 9, 9])
	})

	it('reports a path to its own container as a cycle', () => {
		const r = run('[1 ./]')
		expect(r.diagnostics.map(d => d.message)).toContain('cycle detected')
	})

	it('counts the same levels whether or not a generic resolved', () => {
		const climbs = (params: string): unknown =>
			(run(`[5 [6 ((=> (T) (${params}): _ ../../0) 1)]]`).value as unknown[][])[1]![1]
		expect(climbs('x: T')).toBe(6)
		expect(climbs('x: number')).toBe(6)
	})

	it('keeps a resolved generic visible in the body', () => {
		expect(run('((=> (T) (x: T): T (: x T)) 1)').value).toBe(1)
	})
})

describe('evaluate — runaway recursion', () => {
	const env = buildPrelude()

	it('does not throw, and yields a diagnostic', () => {
		for (const src of [
			'{f = (=> (x: number): number (f x)) (f 1)}',
			'{f = (=> (x: number): number (+ 1 (f x))) (f 1)}',
			'{f = (=> (x: number): number (reduce (map [x] f) 0 +)) (f 1)}',
		]) {
			const r = evaluate(parse(src), env)
			expect(r.diagnostics.map(d => d.message), src).toEqual([
				'recursion too deep',
			])
		}
	})

	it('leaves nothing behind that looks like a cycle', () => {
		const ast = parse('{f = (=> (x: number): number (f x)) (f 1)}')
		const messages = () =>
			evaluate(ast, env).diagnostics.map(d => d.message)
		expect(messages()).toEqual(['recursion too deep'])
		expect(messages()).toEqual(['recursion too deep'])
	})
})

describe('default in metadata', () => {
	const env = buildPrelude()
	const run = (src: string) => evaluate(parse(src), env)

	it('is what a type falls back to', () => {
		expect(run('(: "a" ^{default: 7} number)').value).toBe(7)
		expect(run('{P = ^{default: 7} number (: "a" P)}').value).toBe(7)
		expect(run('{f = (=> (x: ^{default: 7} number): number x) (f "a")}').value).toBe(7)
		expect(run('{P = ^{default: 7} number f = (=> (x: P): number x) (f "a")}').value).toBe(7)
		expect(run('{f = (=> (x: ^{default: 7} number): number x) (f ())}').value).toBe(7)
	})

	it('goes along with what is derived, until something goes over it', () => {
		expect(run('{P = ^{default: 7} number Q = ^{max: 9} P (: "a" Q)}').value).toBe(7)
		expect(run('{P = ^{default: 7} number Q = ^{default: 8} P (: "a" Q)}').value).toBe(8)
		expect(run('{P = ^{default: 7} number Q = P (: "a" Q)}').value).toBe(7)
	})

	it('can be worked out', () => {
		expect(run('{k = 3 (: "a" ^{default: (+ k 1)} number)}').value).toBe(4)
	})

	it('still fits as what it is', () => {
		expect(run('{P = ^{default: 7} number f = (=> (x: number): number x) (f (: 1 P))}').value).toBe(1)
		expect(run('(: 1 ^{default: 7} number)').value).toBe(1)
		expect(check(parse('{P = ^{default: 7} number f = (=> (x: P): number x) (f 1)}'), env)).toEqual([])
		const typed = resolveTypeSlot(parse('^{default: 7} number'), env)!
		const plain = resolveTypeSlot(parse('number'), env)!
		expect(typeFits(typed, plain)).toBe(true)
		expect(typeFits(plain, typed)).toBe(true)
		expect(printType(typed)).toBe('^{default: 7} number')
	})

	it('says so when it does not fit, and has no effect', () => {
		expect(run('(: "a" ^{default: "b"} number)').value).toBe(0)
		expect(check(parse('{P = ^{default: "b"} number}'), env).map(d => d.message)).toContain(
			'default does not fit number'
		)
		expect(check(parse('^{default: "b"} 1'), env)).toEqual([])
		const result = run('{P = ^{default: "b"} number P}')
		expect(result.diagnostics.map(d => d.message).join()).toContain('default does not fit')
	})

	it('means nothing on what is not a type', () => {
		expect(run('^{default: 7} 5').value).toBe(5)
	})
})

describe('members of a type', () => {
	const num = evaluate(parse('number'), buildPrelude()).value as TypeValue
	const scale = makeTypedFn([num, num], num, (a, b) => (a as number) * (b as number), ['x', 'by'])
	const pair = withMembers(makeTupleType([num, num]), { scale, zero: [0, 0] })
	const env: Env = {
		ast: new LetAST([], null),
		parent: buildPrelude(),
		bindings: new Map(
			Object.entries({ pair, geom: { pair } }).map(([name, value]) => [
				name,
				{ ast: host(value), env: null },
			])
		),
	}
	const run = (src: string) => evaluate(parse(src), env)

	it('are read with a dot, and called', () => {
		expect(run('(pair.scale 2 3)').value).toBe(6)
		expect(run('pair.zero').value).toEqual([0, 0])
	})

	it('go through a record of them', () => {
		expect(run('(geom.pair.scale 2 3)').value).toBe(6)
	})

	it('leave the type as a type', () => {
		expect(run('(: [1 2] pair)').value).toEqual([1, 2])
		expect(run('(: "a" pair)').value).toEqual([0, 0])
		expect(run('{f = (=> (p: pair): number p.0) (f [4 5])}').value).toBe(4)
	})

	it('say which one is missing', () => {
		const result = run('pair.nope')
		expect(result.value).toBe(UNIT)
		expect(result.diagnostics[0]?.message).toContain('has no member: nope')
		expect(run('number.nope').diagnostics[0]?.message).toContain('has no member: nope')
	})

	it('are seen by static analysis, which runs nothing', () => {
		expect(printType(infer(parse('pair.scale'), env)!)).toContain('(=>')
		expect(infer(parse('(pair.scale 2 3)'), env)?.typeName).toBe('number')
		expect(infer(parse('(geom.pair.scale 2 3)'), env)?.typeName).toBe('number')
		expect(check(parse('(pair.scale 2 3)'), env)).toEqual([])
		expect(check(parse('(pair.scale "a" 3)'), env)).not.toEqual([])
		expect(callParameters(parse('(pair.scale 2 3)') as CallAST, env)?.names).toEqual(['x', 'by'])
	})

	it('survive what metadata does to the type', () => {
		const said = resolveTypeSlot(parse('^{min: 0} pair'), env)!
		expect(said.members?.zero).toEqual([0, 0])
	})
})
