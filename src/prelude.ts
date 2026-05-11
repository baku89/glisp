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

import { host, lit, meta } from './build.js'
import {
	type Env,
	UNIT,
} from './types.js'
import {
	evaluate,
	IO,
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

// Bare `IO` is `(IO _)`. `fits` cannot inspect the payload (would require
// running the action), so any IO instance fits any (IO T); structural
// compatibility between two parametric IOs flows through typeFits.
const DEFAULT_IO = new IO('default IO', () => [])
const ioCache: WeakMap<TypeValue, TypeValue> = new WeakMap()

function makeIOType(payload: TypeValue): TypeValue {
	const cached = ioCache.get(payload)
	if (cached !== undefined) return cached
	const name = payload.typeName === '_' ? 'IO' : `(IO ${payload.typeName})`
	const t: TypeValue = {
		__glispType: true,
		typeName: name,
		fits: v => v instanceof IO,
		default: DEFAULT_IO,
		shape: { kind: 'io', payload },
		apply: typeArgs => {
			if (typeArgs.length !== 1) {
				return {
					error: `IO expects 1 type argument, got ${typeArgs.length}`,
				}
			}
			return makeIOType(typeArgs[0]!)
		},
	}
	ioCache.set(payload, t)
	return t
}

export const ioType: TypeValue = makeIOType(topType)

/**
 * `vector` (the host-side type used for prelude-provided vector
 * operations). Shape `vector` with element `_` so it accepts any
 * vector — both inferred tuples (`[number number number]`) and
 * homogeneous vectors fit it through `typeFits`.
 */
const vectorType: TypeValue = makeType('vector', Array.isArray, [], {
	kind: 'vector',
	element: topType,
})

const recordType: TypeValue = makeType(
	'record',
	v =>
		v !== null &&
		typeof v === 'object' &&
		!Array.isArray(v) &&
		typeof v !== 'function',
	{},
	{ kind: 'record', fields: new Map(), optional: new Set() }
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
	// `bind(name, doc, ast)` wraps the binding in `^{doc: "..."} expr`.
	// Eval is transparent through meta, so behavior is unchanged; a host
	// querying the binding's AST can read the doc plus any other fields.
	const bind = (doc: string, ast: import('./types.js').AST, extra?: Record<string, string | number | boolean>): import('./types.js').AST => {
		const m: Record<string, string | number | boolean> = { doc }
		if (extra) Object.assign(m, extra)
		return meta(m, ast)
	}

	const fn1 = (
		t: TypeValue,
		ret: TypeValue,
		f: (a: unknown) => unknown,
		name = 'x'
	): TypedHostFn => makeTypedFn([t], ret, a => f(a), [name])

	const fn2 = (
		ta: TypeValue,
		tb: TypeValue,
		ret: TypeValue,
		f: (a: unknown, b: unknown) => unknown,
		names: [string, string] = ['a', 'b']
	): TypedHostFn => makeTypedFn([ta, tb], ret, (a, b) => f(a, b), names)

	const numUnary = (f: (n: number) => number, name = 'x'): TypedHostFn =>
		fn1(numberType, numberType, n => f(n as number), name)

	const env = makeTopLevel({
		// -----------------------------------------------------------------
		// Types
		// -----------------------------------------------------------------
		number: bind('The base numeric type. Default `0`.', host(numberType)),
		string: bind('The base string type. Default `""`.', host(stringType)),
		boolean: bind('The base boolean type. Default `false`.', host(booleanType)),
		unit: bind('The unit type; sole inhabitant is `()`.', host(unitType)),
		_: bind('Top type. Accepts every value. Default `()`.', host(topType)),
		'!': bind('Bottom type. Accepts no value. Default `()`.', host(bottomType)),
		IO: bind(
			'Deferred host effect. Parametric: `(IO T)` produces a `T` when forced.',
			host(ioType)
		),

		// -----------------------------------------------------------------
		// Arithmetic — `+ -` seed with 0; `* /` seed with 1.
		// -----------------------------------------------------------------
		'+': bind(
			'Variadic sum. `(+) → 0`. Non-numeric args coerce to 0 with a diagnostic.',
			host(variadicNumFold((a, b) => a + b, 0, numberType))
		),
		'*': bind(
			'Variadic product. `(*) → 1`. Non-numeric args coerce to 1.',
			host(variadicNumFold((a, b) => a * b, 1, numberOneType))
		),
		'-': bind(
			'Left-fold subtraction. `(- x)` negates; `(- a b c)` = a−b−c.',
			host(variadicNumLeftFold((a, b) => a - b, 0, numberType))
		),
		'/': bind(
			'Left-fold division. `(/ x)` reciprocates; `(/ a b c)` = a/b/c.',
			host(variadicNumLeftFold((a, b) => a / b, 1, numberOneType))
		),
		mod: bind(
			'Remainder of `a / b` with the JS `%` semantics.',
			host(fn2(numberType, numberType, numberType, (a, b) =>
				(a as number) % (b as number)
			))
		),
		pow: bind(
			'`base` raised to the `exp` power.',
			host(fn2(numberType, numberType, numberType, (a, b) =>
				Math.pow(a as number, b as number), ['base', 'exp']
			))
		),
		sqrt: bind('Square root. Negative input yields NaN.', host(numUnary(Math.sqrt))),
		abs: bind('Absolute value of `x`.', host(numUnary(Math.abs))),
		sign: bind('Sign of `x` (−1, 0, or 1).', host(numUnary(Math.sign))),
		floor: bind('Round `x` down to the nearest integer.', host(numUnary(Math.floor))),
		ceil: bind('Round `x` up to the nearest integer.', host(numUnary(Math.ceil))),
		round: bind('Round `x` to the nearest integer.', host(numUnary(Math.round))),
		exp: bind('e raised to `x`.', host(numUnary(Math.exp))),
		log: bind('Natural log of `x`.', host(numUnary(Math.log))),
		log2: bind('Base-2 log of `x`.', host(numUnary(Math.log2))),
		log10: bind('Base-10 log of `x`.', host(numUnary(Math.log10))),

		// -----------------------------------------------------------------
		// Trigonometry — radians.
		// -----------------------------------------------------------------
		sin: bind('Sine of `x` (radians).', host(numUnary(Math.sin))),
		cos: bind('Cosine of `x` (radians).', host(numUnary(Math.cos))),
		tan: bind('Tangent of `x` (radians).', host(numUnary(Math.tan))),
		asin: bind('Arcsine of `x`; result in radians.', host(numUnary(Math.asin))),
		acos: bind('Arccosine of `x`; result in radians.', host(numUnary(Math.acos))),
		atan: bind('Arctangent of `x`; result in radians.', host(numUnary(Math.atan))),
		atan2: bind(
			'Angle (radians) of the vector `(x, y)`, in `(-π, π]`.',
			host(fn2(numberType, numberType, numberType, (y, x) =>
				Math.atan2(y as number, x as number), ['y', 'x']
			))
		),

		// -----------------------------------------------------------------
		// Constants
		// -----------------------------------------------------------------
		pi: bind('π ≈ 3.14159', lit(Math.PI)),
		tau: bind('τ = 2π ≈ 6.28318. One full turn in radians.', lit(Math.PI * 2)),
		'half-pi': bind('π / 2 ≈ 1.5708', lit(Math.PI / 2)),
		'quarter-pi': bind('π / 4 ≈ 0.7854', lit(Math.PI / 4)),
		e: bind('e ≈ 2.71828, the base of the natural log.', lit(Math.E)),
		inf: bind('Positive infinity.', lit(Infinity)),

		// -----------------------------------------------------------------
		// Comparison & boolean
		// -----------------------------------------------------------------
		'<': bind('Pairwise less-than chain. `(<) → true`.', host(chainCmp((a, b) => a < b))),
		'>': bind('Pairwise greater-than chain.', host(chainCmp((a, b) => a > b))),
		'<=': bind('Pairwise less-or-equal chain.', host(chainCmp((a, b) => a <= b))),
		'>=': bind('Pairwise greater-or-equal chain.', host(chainCmp((a, b) => a >= b))),
		'==': bind('All adjacent arguments are equal.', host(chainEq(true))),
		'!=': bind('All adjacent arguments are distinct.', host(chainEq(false))),
		not: bind('Boolean negation.', host(fn1(booleanType, booleanType, a => !a))),
		and: bind(
			'Variadic logical AND. `(and) → true`. Non-booleans coerce to true.',
			host(
				makeTypedFn(
					[],
					booleanType,
					(...args) => (args as boolean[]).every(Boolean),
					undefined,
					makeType('boolean', v => typeof v === 'boolean', true)
				)
			)
		),
		or: bind(
			'Variadic logical OR. `(or) → false`. Non-booleans coerce to false.',
			host(
				makeTypedFn(
					[],
					booleanType,
					(...args) => (args as boolean[]).some(Boolean),
					undefined,
					booleanType
				)
			)
		),

		// -----------------------------------------------------------------
		// Vectors — element access / shape / order
		// -----------------------------------------------------------------
		first: bind(
			'First element of a vector; `()` if empty.',
			host(fn1(vectorType, topType, xs => (Array.isArray(xs) ? xs[0] ?? UNIT : UNIT), 'xs'))
		),
		last: bind(
			'Last element of a vector; `()` if empty.',
			host(
				fn1(vectorType, topType, xs =>
					Array.isArray(xs) ? xs[xs.length - 1] ?? UNIT : UNIT, 'xs'
				)
			)
		),
		count: bind(
			'Number of elements in a vector.',
			host(fn1(vectorType, numberType, xs => (Array.isArray(xs) ? xs.length : 0), 'xs'))
		),
		take: bind(
			'First `n` elements of `xs` (or all if `n` exceeds length).',
			host(
				fn2(vectorType, numberType, vectorType, (xs, n) =>
					Array.isArray(xs) ? xs.slice(0, Math.max(0, n as number)) : [],
					['xs', 'n']
				)
			)
		),
		drop: bind(
			'`xs` without its first `n` elements.',
			host(
				fn2(vectorType, numberType, vectorType, (xs, n) =>
					Array.isArray(xs) ? xs.slice(Math.max(0, n as number)) : [],
					['xs', 'n']
				)
			)
		),

		// -----------------------------------------------------------------
		// Higher-order over vectors
		// -----------------------------------------------------------------
		map: bind(
			'Apply `f` to each element of `xs`; returns a new vector.',
			host(makeMap())
		),
		filter: bind(
			'Keep elements of `xs` where `p` returns true.',
			host(makeFilter())
		),
		reduce: bind(
			'Left-fold `xs` through `f` starting from `init`.',
			host(makeReduce())
		),

		// -----------------------------------------------------------------
		// Strings
		// -----------------------------------------------------------------
		'starts-with': bind(
			'Whether `str` begins with `prefix`.',
			host(
				makeTypedFn(
					[stringType, stringType], booleanType,
					(s, p) => (s as string).startsWith(p as string),
					['str', 'prefix']
				)
			)
		),
		'ends-with': bind(
			'Whether `str` ends with `suffix`.',
			host(
				makeTypedFn(
					[stringType, stringType], booleanType,
					(s, p) => (s as string).endsWith(p as string),
					['str', 'suffix']
				)
			)
		),
		lowercase: bind(
			'Convert `str` to lowercase.',
			host(fn1(stringType, stringType, s => (s as string).toLowerCase(), 'str'))
		),
		uppercase: bind(
			'Convert `str` to uppercase.',
			host(fn1(stringType, stringType, s => (s as string).toUpperCase(), 'str'))
		),
		trim: bind(
			'Strip leading and trailing whitespace from `str`.',
			host(fn1(stringType, stringType, s => (s as string).trim(), 'str'))
		),
		split: bind(
			'Split `str` on each `sep` occurrence.',
			host(
				makeTypedFn(
					[stringType, stringType],
					vectorType,
					(s, sep) => (s as string).split(sep as string),
					['str', 'sep']
				)
			)
		),
		join: bind(
			'Concatenate `xs` (any values, stringified) with `sep` between.',
			host(
				makeTypedFn(
					[vectorType, stringType],
					stringType,
					(xs, sep) =>
						(xs as unknown[])
							.map(v => (typeof v === 'string' ? v : showValue(v)))
							.join(sep as string),
					['xs', 'sep']
				)
			)
		),

		// -----------------------------------------------------------------
		// Records
		// -----------------------------------------------------------------
		keys: bind(
			'Vector of `rec`\'s field names in declaration order.',
			host(
				fn1(recordType, vectorType, rec =>
					rec !== null && typeof rec === 'object' && !Array.isArray(rec)
						? Object.keys(rec)
						: [],
					'rec'
				)
			)
		),
		values: bind(
			'Vector of `rec`\'s field values in declaration order.',
			host(
				fn1(recordType, vectorType, rec =>
					rec !== null && typeof rec === 'object' && !Array.isArray(rec)
						? Object.values(rec)
						: [],
					'rec'
				)
			)
		),
		merge: bind(
			'Right-biased record merge: `(merge a b)` = a ∪ b, b wins on collision.',
			host(
				makeTypedFn(
					[recordType, recordType],
					recordType,
					(a, b) =>
						a !== null &&
						typeof a === 'object' &&
						!Array.isArray(a) &&
						b !== null &&
						typeof b === 'object' &&
						!Array.isArray(b)
							? { ...a, ...b }
							: a,
					['a', 'b']
				)
			)
		),

		// -----------------------------------------------------------------
		// Type constructors
		// -----------------------------------------------------------------
		enum: bind(
			'`(enum v1 v2 ...)`: a type whose inhabitants are exactly those values. Default = first member.',
			host(makeEnum())
		),
		refine: bind(
			'`(refine T default pred)`: a subset of `T` satisfying `pred`, with an explicit fallback.',
			host(makeRefine())
		),

		// -----------------------------------------------------------------
		// Misc
		// -----------------------------------------------------------------
		identity: bind(
			'Returns its argument unchanged. Useful as a pass-through callback.',
			host(fn1(topType, topType, a => a))
		),
		show: bind(
			'Idempotent printing of any value as its Glisp source.',
			host(fn1(topType, stringType, v => showValue(v)))
		),
		range: bind(
			'`(range start end)` → `[start start+1 ... end-1]` (or descending if `start > end`).',
			host(makeRange())
		),
		reverse: bind('Reverse the elements of a vector.', host(makeReverse())),
		slice: bind(
			'Sub-sequence of a vector or string between `start` and `end`.',
			host(makeSliceOverload())
		),
		size: bind(
			'Number of elements (vector) or characters (string).',
			host(makeSizeOverload())
		),
		concat: bind(
			'Variadic concatenation: all vectors / all strings.',
			host(makeConcatOverload())
		),
	})

	// Glisp-defined helpers — run a small bootstrap script of `def` actions.
	// They use the host primitives above (`+`, `*`, `map`, `reduce`, etc.)
	// to produce convenience bindings written in the language itself.
	const bootstrap = [
		// integer step / sign helpers
		'(def "inc" ^{doc: "`(inc n)` = n + 1."} (=> (n: number): number (+ n 1)))',
		'(def "dec" ^{doc: "`(dec n)` = n − 1."} (=> (n: number): number (- n 1)))',
		'(def "neg" ^{doc: "Negation. `(neg n)` = −n."} (=> (n: number): number (- n)))',

		// 2-arg min / max
		'(def "min" ^{doc: "Smaller of `a` and `b`."} (=> (a: number b: number): number (? (< a b) true a _ b)))',
		'(def "max" ^{doc: "Larger of `a` and `b`."} (=> (a: number b: number): number (? (> a b) true a _ b)))',

		// reductions over a vector
		'(def "sum" ^{doc: "Sum every element of a numeric vector."} (=> (xs: _): number (reduce xs 0 +)))',
		'(def "product" ^{doc: "Product of every element of a numeric vector."} (=> (xs: _): number (reduce xs 1 *)))',

		// angle conversion — Glisp's trig is radians; these are the bridges
		'(def "to-deg" ^{doc: "Convert radians to degrees."} (=> (rad: number): number (/ (* rad 180) pi)))',
		'(def "to-rad" ^{doc: "Convert degrees to radians."} (=> (deg: number): number (/ (* deg pi) 180)))',
		'(def "to-turn" ^{doc: "Convert radians to turns (1 turn = 2π rad)."} (=> (rad: number): number (/ rad tau)))',
		'(def "turn" ^{doc: "Convert turns to radians."} (=> (t: number): number (* t tau)))',

		// range remapping — staples for design / motion code
		'(def "lerp" ^{doc: "Linear interpolation: `(lerp a b t)` = a + (b−a)·t."} (=> (a: number b: number t: number): number (+ a (* (- b a) t))))',
		'(def "mix" ^{doc: "Alias for `lerp`."} (=> (a: number b: number t: number): number (lerp a b t)))',
		'(def "clamp" ^{doc: "Clamp `x` to `[lo, hi]`."} (=> (lo: number hi: number x: number): number (min hi (max lo x))))',
		'(def "clamp01" ^{doc: "Clamp `x` to `[0, 1]`."} (=> (x: number): number (clamp 0 1 x)))',
		'(def "fit" ^{doc: "Map `x` from `[omin, omax]` to `[nmin, nmax]` linearly."} (=> (omin: number omax: number nmin: number nmax: number x: number): number (+ nmin (* (- nmax nmin) (/ (- x omin) (- omax omin))))))',
		'(def "fit01" ^{doc: "Map `x` (in [0, 1]) to `[lo, hi]` linearly."} (=> (lo: number hi: number x: number): number (lerp lo hi x)))',
		'(def "fit11" ^{doc: "Map `x` (in [-1, 1]) to `[lo, hi]` linearly."} (=> (lo: number hi: number x: number): number (lerp lo hi (* 0.5 (+ x 1)))))',
		'(def "step" ^{doc: "0 if x < edge, otherwise 1. (GLSL-style step.)"} (=> (edge: number x: number): number (? (< x edge) true 0 _ 1)))',

		// Note: `?` is not an identifier character per spec, so the
		// Scheme-style predicate naming `even?` / `empty?` is unavailable.
	]
	for (const src of bootstrap) {
		const r = evaluate(parse(src), env)
		if (r.value instanceof IO) r.value.run()
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
	const vecType = vectorType
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
	const vecType = vectorType
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
	const vecType = vectorType
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
	if (v instanceof IO) return `<IO ${v.description}>`
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
