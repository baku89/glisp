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
	IOAction,
	makeTopLevel,
	makeType,
	makeTypedFn,
	type TypedHostFn,
	type TypeValue,
} from './eval.js'

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
	return makeTopLevel({
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
	})
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
	if (typeof v === 'function') {
		const fn = v as TypedHostFn
		if (fn.__glispTypedFn) return '<host-fn>'
		return '<host-fn>'
	}
	if (typeof v === 'object') {
		const entries = Object.entries(v as Record<string, unknown>).map(
			([k, x]) => `${k}: ${showValue(x)}`
		)
		return `{${entries.join(' ')}}`
	}
	return String(v)
}
