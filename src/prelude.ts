/**
 * Prelude: the standard env that every Glisp program starts in.
 *
 * Built once and returned as a top-level frame. The REPL uses this directly;
 * embedding hosts can layer more bindings on top with `g.def` / `g.extern`.
 *
 * Currently bound:
 * - primitive types: `number`, `string`, `boolean`, `unit`, `_` (top),
 *   `!` (bottom), `IO`
 * - arithmetic (variadic): `+`, `-`, `*`, `/`
 * - comparison (chain): `<`, `>`, `<=`, `>=`, `==`, `!=`
 * - utilities: `not`, `identity`, `show`, `first`, `last`, `count`
 *
 * Spec: docs/spec/host-api.md
 */

import { lit } from './build.js'
import {
	type Env,
	UNIT,
} from './types.js'
import {
	evaluate,
	IOAction,
	isGlispClosure,
	isTypeValue,
	makeFunctionType,
	makeTopLevel,
	makeType,
	makeTypedFn,
	type TypedHostFn,
	type TypeValue,
} from './eval.js'
import { parse } from './parse.js'

// -----------------------------------------------------------------------------
// Primitive types
// -----------------------------------------------------------------------------

export const numberType: TypeValue = makeType(
	'number',
	v => typeof v === 'number',
	0
)
export const stringType: TypeValue = makeType(
	'string',
	v => typeof v === 'string',
	''
)
export const booleanType: TypeValue = makeType(
	'boolean',
	v => typeof v === 'boolean',
	false
)
export const unitType: TypeValue = makeType('unit', v => v === UNIT, UNIT)
export const topType: TypeValue = makeType('_', () => true, UNIT)
export const bottomType: TypeValue = makeType('!', () => false, UNIT)
export const ioType: TypeValue = makeType(
	'IO',
	v => v instanceof IOAction,
	UNIT
)

// -----------------------------------------------------------------------------
// Operator helpers — variadic by default
// -----------------------------------------------------------------------------

/**
 * `+` and `*` style: fold every arg through `op` starting from `identity`.
 * `(+) → 0`, `(+ x) → x`, `(+ a b c) → a+b+c`.
 */
function variadicNumFold(
	op: (a: number, b: number) => number,
	identity: number
): TypedHostFn {
	return makeTypedFn(
		[],
		numberType,
		(...args) => (args as number[]).reduce(op, identity),
		undefined,
		numberType
	)
}

/**
 * `-` and `/` style: the first arg is the seed; remaining args fold through
 * `op`. With a single arg, `unary(x)` is returned (negation / reciprocal).
 * With zero args, falls back to `zeroResult`.
 */
function variadicNumLeftFold(
	op: (a: number, b: number) => number,
	unary: (x: number) => number,
	zeroResult: number
): TypedHostFn {
	return makeTypedFn(
		[],
		numberType,
		(...args) => {
			const ns = args as number[]
			if (ns.length === 0) return zeroResult
			if (ns.length === 1) return unary(ns[0]!)
			return ns.slice(1).reduce(op, ns[0]!)
		},
		undefined,
		numberType
	)
}

/**
 * `<` / `<=` / `>` / `>=` style: pairwise chain — true iff every adjacent
 * pair satisfies `op`. With fewer than two args, vacuously true.
 */
function chainCmp(op: (a: number, b: number) => boolean): TypedHostFn {
	return makeTypedFn(
		[],
		booleanType,
		(...args) => {
			const ns = args as number[]
			for (let i = 0; i + 1 < ns.length; i++) {
				if (!op(ns[i]!, ns[i + 1]!)) return false
			}
			return true
		},
		undefined,
		numberType
	)
}

/**
 * `==` / `!=` chain over arbitrary values. `==` = all adjacent pairs equal,
 * `!=` = all adjacent pairs distinct (not "all distinct from each other").
 */
function chainEq(want: boolean): TypedHostFn {
	return makeTypedFn(
		[],
		booleanType,
		(...args) => {
			for (let i = 0; i + 1 < args.length; i++) {
				if ((args[i] === args[i + 1]) !== want) return false
			}
			return true
		},
		undefined,
		topType
	)
}

// -----------------------------------------------------------------------------
// buildPrelude — build a fresh top-level env populated with the prelude
// -----------------------------------------------------------------------------

export function buildPrelude(): Env {
	const env = makeTopLevel({
		// types
		number: lit(numberType as never),
		string: lit(stringType as never),
		boolean: lit(booleanType as never),
		unit: lit(unitType as never),
		_: lit(topType as never),
		'!': lit(bottomType as never),
		IO: lit(ioType as never),

		// arithmetic
		'+': lit(variadicNumFold((a, b) => a + b, 0) as never),
		'*': lit(variadicNumFold((a, b) => a * b, 1) as never),
		'-': lit(variadicNumLeftFold((a, b) => a - b, x => -x, 0) as never),
		'/': lit(variadicNumLeftFold((a, b) => a / b, x => 1 / x, 1) as never),

		// comparison
		'<': lit(chainCmp((a, b) => a < b) as never),
		'>': lit(chainCmp((a, b) => a > b) as never),
		'<=': lit(chainCmp((a, b) => a <= b) as never),
		'>=': lit(chainCmp((a, b) => a >= b) as never),
		'==': lit(chainEq(true) as never),
		'!=': lit(chainEq(false) as never),

		// utilities
		not: lit(makeTypedFn([booleanType], booleanType, a => !a) as never),
		identity: lit(makeTypedFn([topType], topType, a => a) as never),
		show: lit(
			makeTypedFn([topType], stringType, v => showValue(v)) as never
		),
		first: lit(
			((xs: unknown) =>
				Array.isArray(xs) ? xs[0] : UNIT) as unknown as never
		),
		last: lit(
			((xs: unknown) =>
				Array.isArray(xs) ? xs[xs.length - 1] : UNIT) as unknown as never
		),
		count: lit(
			((xs: unknown) =>
				Array.isArray(xs) ? xs.length : 0) as unknown as never
		),

		// higher-order
		map: lit(makeMap() as never),
		filter: lit(makeFilter() as never),
		reduce: lit(makeReduce() as never),

		// type constructors
		enum: lit(makeEnum() as never),
		refine: lit(makeRefine() as never),
	})

	// Glisp-defined helpers — run a small bootstrap script of `def` actions.
	// They use the host primitives above (`+`, `*`, `map`, `reduce`, etc.)
	// to produce convenience bindings written in the language itself.
	const bootstrap = [
		'(def "inc" (=> (n: number): number (+ n 1)))',
		'(def "dec" (=> (n: number): number (- n 1)))',
		'(def "neg" (=> (n: number): number (- n)))',
		'(def "abs" (=> (n: number): number (? (< n 0) true (- n) _ n)))',
		'(def "min" (=> (a: number b: number): number (? (< a b) true a _ b)))',
		'(def "max" (=> (a: number b: number): number (? (> a b) true a _ b)))',
		'(def "sum" (=> (xs: _): number (reduce xs 0 +)))',
		'(def "product" (=> (xs: _): number (reduce xs 1 *)))',
	]
	for (const src of bootstrap) {
		const r = evaluate(parse(src), env)
		if (r.value instanceof IOAction) r.value.run()
	}

	return env
}

// -----------------------------------------------------------------------------
// Higher-order functions over vectors
// -----------------------------------------------------------------------------

/**
 * `map` — apply a unary callable to every element of a vector. The callable
 * is either a Glisp closure (callable as a JS fn per host-api.md) or a
 * plain host JS function.
 */
function makeMap(): TypedHostFn {
	const vecType = makeType('vector', Array.isArray, [])
	const fnType = makeFunctionType([topType], topType, { paramNames: ['x'] })
	return makeTypedFn(
		[vecType, fnType],
		vecType,
		(xs, fn) =>
			(xs as unknown[]).map(x => (fn as (a: unknown) => unknown)(x)),
		['xs', 'f']
	)
}

function makeFilter(): TypedHostFn {
	const vecType = makeType('vector', Array.isArray, [])
	const predType = makeFunctionType([topType], booleanType, {
		paramNames: ['x'],
	})
	return makeTypedFn(
		[vecType, predType],
		vecType,
		(xs, p) =>
			(xs as unknown[]).filter(x =>
				Boolean((p as (a: unknown) => unknown)(x))
			),
		['xs', 'p']
	)
}

function makeReduce(): TypedHostFn {
	const vecType = makeType('vector', Array.isArray, [])
	const fnType = makeFunctionType([topType, topType], topType, {
		paramNames: ['acc', 'x'],
	})
	return makeTypedFn(
		[vecType, topType, fnType],
		topType,
		(xs, init, fn) =>
			(xs as unknown[]).reduce(
				(acc, x) => (fn as (a: unknown, b: unknown) => unknown)(acc, x),
				init
			),
		['xs', 'init', 'f']
	)
}

// -----------------------------------------------------------------------------
// Type constructors — enum, refine
// -----------------------------------------------------------------------------

/**
 * `(enum v0 v1 ...)` — produce a finite-set type whose values are exactly
 * those listed. The default is the first listed value (or unit if empty).
 */
function makeEnum(): TypedHostFn {
	return makeTypedFn(
		[],
		topType,
		(...vs) => {
			const set = new Set(vs)
			const name = `(enum ${vs.map(showValue).join(' ')})`
			const fallback = vs.length > 0 ? vs[0] : UNIT
			return makeType(name, v => set.has(v), fallback, {
				kind: 'enum',
				values: set,
			})
		},
		undefined,
		topType
	)
}

/**
 * `(refine base default pred)` — narrow `base` to the subset for which
 * `pred(v)` returns truthy. The default is provided by the caller (since
 * `base.default` may not satisfy `pred`).
 *
 * `pred` accepts either a Glisp closure or a host JS function — both are
 * callable JS values per host-api.md.
 */
function makeRefine(): TypedHostFn {
	return makeTypedFn(
		[topType, topType, topType],
		topType,
		(base, defaultV, pred) => {
			if (!isTypeValue(base)) return base
			const predicate =
				typeof pred === 'function'
					? (pred as (x: unknown) => unknown)
					: () => false
			const name = `(refine ${base.typeName})`
			return makeType(
				name,
				v => base.fits(v) && Boolean(predicate(v)),
				defaultV,
				{ kind: 'refine', base }
			)
		},
		['base', 'default', 'pred']
	)
}

// -----------------------------------------------------------------------------
// showValue — uncolored stringification for `show`
// -----------------------------------------------------------------------------

function showValue(v: unknown): string {
	if (v === UNIT) return '()'
	if (v === null) return 'null'
	if (v === undefined) return 'undefined'
	if (typeof v === 'string') return JSON.stringify(v)
	if (typeof v === 'number' || typeof v === 'boolean') return String(v)
	if (Array.isArray(v)) return `[${v.map(showValue).join(' ')}]`
	if (v instanceof IOAction) return `<IO ${v.description}>`
	if (isTypeValue(v)) return v.typeName
	if (isGlispClosure(v)) return '<closure>'
	if (typeof v === 'function') return '<host-fn>'
	if (typeof v === 'object') {
		const entries = Object.entries(v as Record<string, unknown>).map(
			([k, x]) => `${k}: ${showValue(x)}`
		)
		return `{${entries.join(' ')}}`
	}
	return String(v)
}
