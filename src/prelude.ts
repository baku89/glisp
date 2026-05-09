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

import { host, lit } from './build.js'
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
	OverloadValue,
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
 * Variant of `numberType` whose `default` is 1 — the multiplicative
 * identity. Used as the variadic-tail type for `*` and `/` so that any
 * argument that fails to evaluate to a number (e.g. `()`) coerces to 1
 * rather than 0, matching the operator's algebraic identity.
 */
const numberOneType: TypeValue = makeType(
	'number',
	v => typeof v === 'number',
	1
)

/**
 * `+` and `*` style: fold every arg through `op` starting from `identity`.
 * `(+) → 0`, `(+ x) → x`, `(+ a b c) → a+b+c`.
 *
 * `tailType` is the `numberType` variant whose default value matches the
 * operator's identity (0 for `+`, 1 for `*`) — keeps the per-arg fallback
 * coherent with the fold seed.
 */
function variadicNumFold(
	op: (a: number, b: number) => number,
	identity: number,
	tailType: TypeValue
): TypedHostFn {
	return makeTypedFn(
		[],
		numberType,
		(...args) => (args as number[]).reduce(op, identity),
		undefined,
		tailType
	)
}

/**
 * `-` and `/` style: the first arg is the seed; remaining args fold through
 * `op`. With a single arg, the operator's identity element seeds the fold
 * (so `(- x)` = `0 - x` = `-x` and `(/ x)` = `1 / x`). With zero args,
 * returns the identity element itself.
 */
function variadicNumLeftFold(
	op: (a: number, b: number) => number,
	identity: number,
	tailType: TypeValue
): TypedHostFn {
	return makeTypedFn(
		[],
		numberType,
		(...args) => {
			const ns = args as number[]
			if (ns.length === 0) return identity
			if (ns.length === 1) return op(identity, ns[0]!)
			return ns.slice(1).reduce(op, ns[0]!)
		},
		undefined,
		tailType
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
		number: host(numberType),
		string: host(stringType),
		boolean: host(booleanType),
		unit: host(unitType),
		_: host(topType),
		'!': host(bottomType),
		IO: host(ioType),

		// arithmetic — `+ -` use 0 as both fold seed and per-arg default;
		// `* /` use 1.
		'+': host(variadicNumFold((a, b) => a + b, 0, numberType)),
		'*': host(variadicNumFold((a, b) => a * b, 1, numberOneType)),
		'-': host(variadicNumLeftFold((a, b) => a - b, 0, numberType)),
		'/': host(variadicNumLeftFold((a, b) => a / b, 1, numberOneType)),

		// comparison
		'<': host(chainCmp((a, b) => a < b)),
		'>': host(chainCmp((a, b) => a > b)),
		'<=': host(chainCmp((a, b) => a <= b)),
		'>=': host(chainCmp((a, b) => a >= b)),
		'==': host(chainEq(true)),
		'!=': host(chainEq(false)),

		// utilities
		not: host(makeTypedFn([booleanType], booleanType, a => !a)),
		identity: host(makeTypedFn([topType], topType, a => a)),
		show: host(makeTypedFn([topType], stringType, v => showValue(v))),
		first: host((xs: unknown) =>
			Array.isArray(xs) ? xs[0] : UNIT
		),
		last: host((xs: unknown) =>
			Array.isArray(xs) ? xs[xs.length - 1] : UNIT
		),
		count: host((xs: unknown) =>
			Array.isArray(xs) ? xs.length : 0
		),

		// higher-order
		map: host(makeMap()),
		filter: host(makeFilter()),
		reduce: host(makeReduce()),

		// type constructors
		enum: host(makeEnum()),
		refine: host(makeRefine()),

		// math primitives
		pi: host(Math.PI),
		e: host(Math.E),
		mod: host(
			makeTypedFn(
				[numberType, numberType],
				numberType,
				(a, b) => (a as number) % (b as number),
				['a', 'b']
			)
		),
		pow: host(
			makeTypedFn(
				[numberType, numberType],
				numberType,
				(a, b) => Math.pow(a as number, b as number),
				['base', 'exp']
			)
		),
		sqrt: host(
			makeTypedFn([numberType], numberType, n => Math.sqrt(n as number))
		),
		floor: host(
			makeTypedFn([numberType], numberType, n => Math.floor(n as number))
		),
		ceil: host(
			makeTypedFn([numberType], numberType, n => Math.ceil(n as number))
		),
		round: host(
			makeTypedFn([numberType], numberType, n => Math.round(n as number))
		),

		// vector / string ops
		range: host(makeRange()),
		reverse: host(makeReverse()),
		slice: host(makeSliceOverload()),
		size: host(makeSizeOverload()),
		concat: host(makeConcatOverload()),
		'starts-with': host(
			makeTypedFn(
				[stringType, stringType],
				booleanType,
				(s, p) => (s as string).startsWith(p as string),
				['str', 'prefix']
			)
		),
		split: host(
			makeTypedFn(
				[stringType, stringType],
				makeType('vector', Array.isArray, []),
				(s, sep) => (s as string).split(sep as string),
				['str', 'sep']
			)
		),
		join: host(
			makeTypedFn(
				[makeType('vector', Array.isArray, []), stringType],
				stringType,
				(xs, sep) =>
					(xs as unknown[])
						.map(v => (typeof v === 'string' ? v : showValue(v)))
						.join(sep as string),
				['xs', 'sep']
			)
		),

		// record ops
		keys: host(
			((rec: unknown) =>
				rec !== null && typeof rec === 'object' && !Array.isArray(rec)
					? Object.keys(rec)
					: []) as (rec: unknown) => unknown[]
		),
		values: host(
			((rec: unknown) =>
				rec !== null && typeof rec === 'object' && !Array.isArray(rec)
					? Object.values(rec)
					: []) as (rec: unknown) => unknown[]
		),
		merge: host(
			((a: unknown, b: unknown) =>
				a !== null &&
				typeof a === 'object' &&
				!Array.isArray(a) &&
				b !== null &&
				typeof b === 'object' &&
				!Array.isArray(b)
					? { ...a, ...b }
					: a) as (a: unknown, b: unknown) => unknown
		),
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
// Standard library: vectors, strings, records
// -----------------------------------------------------------------------------

const vectorType = makeType('vector', Array.isArray, [])

function makeRange(): TypedHostFn {
	return makeTypedFn(
		[numberType, numberType],
		vectorType,
		(start, end) => {
			const a = start as number
			const b = end as number
			const out: number[] = []
			if (a <= b) {
				for (let i = a; i < b; i++) out.push(i)
			} else {
				for (let i = a; i > b; i--) out.push(i)
			}
			return out
		},
		['start', 'end']
	)
}

function makeReverse(): TypedHostFn {
	return makeTypedFn([vectorType], vectorType, xs =>
		(xs as unknown[]).slice().reverse()
	)
}

/** `slice` overload: works on strings and vectors. */
function makeSliceOverload(): OverloadValue {
	const sliceVec = makeTypedFn(
		[vectorType, numberType, numberType],
		vectorType,
		(xs, a, b) =>
			(xs as unknown[]).slice(a as number, b as number),
		['xs', 'start', 'end']
	)
	const sliceStr = makeTypedFn(
		[stringType, numberType, numberType],
		stringType,
		(s, a, b) => (s as string).slice(a as number, b as number),
		['str', 'start', 'end']
	)
	return new OverloadValue([sliceVec, sliceStr])
}

/** `size` overload: vector length / string length / record arity. */
function makeSizeOverload(): OverloadValue {
	const sizeVec = makeTypedFn(
		[vectorType],
		numberType,
		xs => (xs as unknown[]).length
	)
	const sizeStr = makeTypedFn(
		[stringType],
		numberType,
		s => (s as string).length
	)
	return new OverloadValue([sizeVec, sizeStr])
}

/** `concat` overload: strings or vectors, variadic. */
function makeConcatOverload(): OverloadValue {
	const concatVec = makeTypedFn(
		[],
		vectorType,
		(...args) =>
			(args as unknown[][]).reduce<unknown[]>(
				(acc, xs) => acc.concat(xs),
				[]
			),
		undefined,
		vectorType
	)
	const concatStr = makeTypedFn(
		[],
		stringType,
		(...args) => (args as string[]).join(''),
		undefined,
		stringType
	)
	return new OverloadValue([concatVec, concatStr])
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
