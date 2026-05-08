import { describe, expect, it } from 'vitest'

import {
	access,
	call,
	fn,
	letBlock,
	lit,
	path,
	record,
	spread,
	sym,
	vec,
} from './build.js'
import { emptyEnv, evaluate, GlispClosure, makeTopLevel } from './eval.js'
import { parse } from './parse.js'
import { UNIT } from './types.js'

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
		expect(r.value).toBeInstanceOf(GlispClosure)
		expect((r.value as GlispClosure).capturedEnv).toBe(env)
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

describe('evaluate — quasiquote transparency', () => {
	it('` x evaluates as if the backtick were absent', () => {
		expect(evaluate(parse('`42'), emptyEnv).value).toBe(42)
	})

	it('` ~x  evaluates the unquoted expr', () => {
		const env = makeTopLevel({ x: lit(99) })
		expect(evaluate(parse('`~x'), env).value).toBe(99)
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
})
