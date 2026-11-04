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
	LitAST,
	MetaAST,
	RecordAST,
	type AST,
	type Env,
	UNIT,
} from './types.js'
import {
	booleanType,
	type HostInverse,
	IO,
	isGlispClosure,
	isTypeValue,
	literalValue,
	withWritten,
	makeFunctionType,
	makeTopLevel,
	makeTupleType,
	makeType,
	makeTypedFn,
	makeTypeVar,
	numberType,
	OverloadValue,
	stringType,
	type TypedHostFn,
	type TypeValue,
	unitType,
	UNSET,
	withDoc,
	withExpansion,
	withInverse,
	withSignature,
} from './eval.js'
import { parse } from './parse.js'
import { isSeed, randomAt } from './random.js'

// -----------------------------------------------------------------------------
// Primitive types
// -----------------------------------------------------------------------------

export { booleanType, numberType, stringType, unitType }

// -----------------------------------------------------------------------------
// How arithmetic works backward. See `withInverse`.
// -----------------------------------------------------------------------------

const sumOf = (xs: readonly unknown[]): number =>
	xs.reduce<number>((sum, x) => sum + (x as number), 0)
const productOf = (xs: readonly unknown[]): number =>
	xs.reduce<number>((product, x) => product * (x as number), 1)
const without = (xs: readonly unknown[], index: number): unknown[] =>
	xs.filter((_, i) => i !== index)
const unlessZero = (divisor: number, value: () => number): number | undefined =>
	divisor === 0 ? undefined : value()

/** What to go through for each element to come out as wanted. The function stays. */
const invertMap: HostInverse = (index, result, [xs, f], { invert }) => {
	if (index !== 0 || !Array.isArray(result) || !Array.isArray(xs)) return undefined
	if (result.length !== xs.length) return undefined
	const needed = result.map((wanted, i) =>
		wanted === UNSET ? UNSET : invert(f, wanted, xs[i])
	)
	return needed.includes(undefined) ? undefined : needed
}

const invertAnd: HostInverse = (index, result, args) =>
	result === false
		? false
		: without(args, index).every(Boolean)
			? true
			: undefined

const invertOr: HostInverse = (index, result, args) =>
	result === true
		? true
		: without(args, index).some(Boolean)
			? undefined
			: false

const invertAdd: HostInverse = (index, result, args) =>
	(result as number) - sumOf(without(args, index))

const invertMultiply: HostInverse = (index, result, args) => {
	const others = productOf(without(args, index))
	return unlessZero(others, () => (result as number) / others)
}

const invertSubtract: HostInverse = (index, result, args) => {
	const wanted = result as number
	if (args.length === 1) return -wanted
	if (index === 0) return wanted + sumOf(args.slice(1))
	return (args[0] as number) - sumOf(without(args.slice(1), index - 1)) - wanted
}

const invertDivide: HostInverse = (index, result, args) => {
	const wanted = result as number
	if (args.length === 1) return unlessZero(wanted, () => 1 / wanted)
	if (index === 0) return wanted * productOf(args.slice(1))
	const others = productOf(without(args.slice(1), index - 1))
	return unlessZero(wanted * others, () => (args[0] as number) / (wanted * others))
}

const invertPower: HostInverse = (index, result, args) => {
	const wanted = result as number
	const [base, exponent] = args as [number, number]
	if (index === 0) return unlessZero(exponent, () => wanted ** (1 / exponent))
	return unlessZero(Math.log(base), () => Math.log(wanted) / Math.log(base))
}
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
 * `vector`: any vector. As a constructor, `(vector T)` is `[...T]`.
 */
const vectorType: TypeValue = makeTupleType([], topType)

/**
 * What `enum` and `refine` return. Calling one is a type expression, so a
 * checker reads the type itself rather than stopping at this.
 */
const typeType: TypeValue = makeType('type', isTypeValue, topType)

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
// Generic signatures
// -----------------------------------------------------------------------------

const T = makeTypeVar('T')
const U = makeTypeVar('U')
const A = makeTypeVar('A')
const vectorOf = (element: TypeValue): TypeValue => makeTupleType([], element)

/** `(=> (generics...) (name: type ...): returnType)`. */
function generic(
	generics: ReadonlyArray<string>,
	params: Readonly<Record<string, TypeValue>>,
	returnType: TypeValue
): TypeValue {
	return makeFunctionType(Object.values(params), returnType, {
		paramNames: Object.keys(params),
		generics,
	})
}

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
 * `+` and `*` style: fold every arg through `op`, starting from the operator's
 * identity, so `(+)` is 0 and `(*)` is 1.
 *
 * `identity` is the `numberType` variant whose default value is that identity.
 * It also applies when an argument fails to evaluate to a number.
 */
function variadicNumFold(
	op: (a: number, b: number) => number,
	identity: TypeValue
): TypedHostFn {
	return withSignature(
		makeTypedFn(
			[],
			numberType,
			(...xs) => (xs as number[]).reduce(op, identity.default as number),
			[],
			identity
		),
		makeFunctionType([], numberType, {
			variadicTail: identity,
			variadicName: 'xs',
		})
	)
}

/** `and` and `or` style: with nothing to go on, each gives its identity. */
function variadicBoolFold(
	fold: (xs: boolean[]) => boolean,
	identity: TypeValue
): TypedHostFn {
	return withSignature(
		makeTypedFn(
			[],
			booleanType,
			(...xs) => fold((xs as unknown[]).map(Boolean)),
			[],
			identity
		),
		makeFunctionType([], booleanType, {
			variadicTail: identity,
			variadicName: 'xs',
		})
	)
}

/**
 * `-` and `/` style: the first arg seeds, and the rest left-fold through `op`.
 * With fewer args, `identity` fills in: `(-)` is 0, `(- x)` is `0 - x`, `(/)`
 * is 1, and `(/ x)` is `1 / x`.
 */
function variadicNumLeftFold(
	op: (a: number, b: number) => number,
	identity: number,
	tailType: TypeValue
): TypedHostFn {
	return withSignature(
		makeTypedFn(
			[],
			numberType,
			(...args) => {
				const xs = args as number[]
				if (xs.length === 0) return identity
				if (xs.length === 1) return op(identity, xs[0]!)
				return xs.slice(1).reduce(op, xs[0]!)
			},
			[],
			tailType
		),
		makeFunctionType([], numberType, {
			variadicTail: tailType,
			variadicName: 'xs',
		})
	)
}

/**
 * A variadic predicate over adjacent pairs of `xs`. With fewer than two
 * arguments there is no pair to fail, so `(<)` and `(< x)` are true.
 */
function chain(
	elementType: TypeValue,
	holds: (a: unknown, b: unknown) => boolean
): TypedHostFn {
	return withSignature(
		makeTypedFn(
			[],
			booleanType,
			(...xs) => xs.every((x, i) => i === 0 || holds(xs[i - 1], x)),
			[],
			elementType
		),
		makeFunctionType([], booleanType, {
			variadicTail: elementType,
			variadicName: 'xs',
		})
	)
}

function chainCmp(op: (a: number, b: number) => boolean): TypedHostFn {
	return chain(numberType, (a, b) => op(a as number, b as number))
}

function chainEq(want: boolean): TypedHostFn {
	return chain(topType, (a, b) => (a === b) === want)
}

/** Past this, an expanded `**` would be too long to be worth looking at. */
const MAX_EXPANDED_POWER = 64

/**
 * `**`, which expands to `*` when the exponent is a small whole number:
 * `(** (+ 1 1) 3)` is `(* (+ 1 1) (+ 1 1) (+ 1 1))`.
 */
function makePower(multiply: TypedHostFn): TypedHostFn {
	return withExpansion(
		makeTypedFn(
			[numberType, numberType],
			numberType,
			(a, b) => Math.pow(a as number, b as number),
			['base', 'exp']
		),
		([base, exp], context) => {
			if (base === undefined || exp === undefined) return null
			const n = context.value(exp)
			const expands =
				typeof n === 'number' &&
				Number.isInteger(n) &&
				n >= 0 &&
				n <= MAX_EXPANDED_POWER
			return expands
				? context.call('*', multiply, new Array<AST>(n).fill(base))
				: null
		}
	)
}

// -----------------------------------------------------------------------------
// buildPrelude — build a fresh top-level env populated with the prelude
// -----------------------------------------------------------------------------

/**
 * What to call the parameters of a function, where the names in its signature are
 * for writing code in: `xs` and `f` are short to type, and say little on a label.
 * An editor reads them from `^{params: {...}}` on the definition. As with `doc`,
 * nothing here changes what the function does.
 */
const PARAMS: Readonly<
	Record<string, Readonly<Record<string, readonly [label: string, doc: string]>>>
> = {
	'+': { xs: ['Values', 'The numbers to add up.'] },
	'*': { xs: ['Values', 'The numbers to multiply.'] },
	and: { xs: ['Values', 'The booleans that all have to be true.'] },
	or: { xs: ['Values', 'The booleans of which one has to be true.'] },
	'-': { xs: ['Values', 'The number to start from, and those to take away from it.'] },
	'/': { xs: ['Values', 'The number to start from, and those to divide it by.'] },
	'<': { xs: ['Values', 'What to compare, each with the next.'] },
	'>': { xs: ['Values', 'What to compare, each with the next.'] },
	'<=': { xs: ['Values', 'What to compare, each with the next.'] },
	'>=': { xs: ['Values', 'What to compare, each with the next.'] },
	'==': { xs: ['Values', 'What should all be the same.'] },
	'!=': { xs: ['Values', 'What should not be the same.'] },
	'++': { xs: ['Values', 'What to put end to end.'] },
	'**': {
		base: ['Base', 'The number to raise.'],
		exp: ['Exponent', 'The power to raise it to.'],
	},
	first: { xs: ['Items', 'The vector to take it from.'] },
	last: { xs: ['Items', 'The vector to take it from.'] },
	count: { xs: ['Items', 'The vector to count.'] },
	take: {
		xs: ['Items', 'The vector to take them from.'],
		n: ['Count', 'How many to take.'],
	},
	drop: {
		xs: ['Items', 'The vector to drop them from.'],
		n: ['Count', 'How many to drop.'],
	},
	map: {
		xs: ['Items', 'The vector to go through.'],
		f: ['Transform', 'What to make of each element.'],
	},
	filter: {
		xs: ['Items', 'The vector to go through.'],
		p: ['Condition', 'Whether to keep an element.'],
	},
	reduce: {
		xs: ['Items', 'The vector to go through.'],
		init: ['Initial', 'What to start from.'],
		f: ['Combine', 'What to make of what there is so far and the next element.'],
	},
	join: {
		xs: ['Items', 'What to put together.'],
		sep: ['Separator', 'What goes between them.'],
	},
	slice: {
		xs: ['Items', 'The vector or string to cut from.'],
		start: ['Start', 'Where to begin.'],
		end: ['End', 'Where to stop, before that.'],
	},
	reverse: { xs: ['Items', 'The vector to turn around.'] },
}

/** What to call the functions, where their names are for writing code in. */
const FUNCTION_LABELS: Readonly<Record<string, string>> = {
	'+': 'Add',
	'*': 'Multiply',
	'-': 'Subtract',
	'/': 'Divide',
	'**': 'Power',
	'++': 'Concat',
	'<': 'Less Than',
	'>': 'Greater Than',
	'<=': 'At Most',
	'>=': 'At Least',
	'==': 'Equal',
	'!=': 'Not Equal',
	mod: 'Modulo',
	sqrt: 'Square Root',
	abs: 'Absolute',
	sign: 'Sign',
	floor: 'Floor',
	ceil: 'Ceiling',
	round: 'Round',
	exp: 'Exponential',
	log: 'Logarithm',
	sin: 'Sine',
	cos: 'Cosine',
	tan: 'Tangent',
	not: 'Not',
	and: 'And',
	or: 'Or',
	first: 'First',
	last: 'Last',
	count: 'Count',
	take: 'Take',
	drop: 'Drop',
	map: 'Map',
	filter: 'Filter',
	reduce: 'Reduce',
	join: 'Join',
	split: 'Split',
	range: 'Range',
	reverse: 'Reverse',
	slice: 'Slice',
	merge: 'Merge',
}

function withParamLabels(bindings: Record<string, AST>): Record<string, AST> {
	const labelled = { ...bindings }
	for (const name of new Set([
		...Object.keys(PARAMS),
		...Object.keys(FUNCTION_LABELS),
	])) {
		const ast = labelled[name]
		if (ast?.kind !== 'meta') continue
		const label = FUNCTION_LABELS[name]
		const params = PARAMS[name]
		labelled[name] = new MetaAST(
			new RecordAST([
				...ast.metadata.fields,
				...(label === undefined ? [] : [['label', new LitAST(label)] as const]),
				...(params === undefined
					? []
					: [
							[
								'params',
								new RecordAST(
									Object.entries(params).map(
										([param, [text, doc]]) =>
											[
												param,
												new RecordAST([
													['label', new LitAST(text)],
													['doc', new LitAST(doc)],
												]),
											] as const
									)
								),
							] as const,
						]),
			]),
			ast.expr
		)
	}
	return labelled
}

export function buildPrelude(): Env {
	const multiply = variadicNumFold((a, b) => a * b, numberOneType)

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

	const hostBindings: Record<string, AST> = {
		// -----------------------------------------------------------------
		// Types
		// -----------------------------------------------------------------
		number: bind('The base numeric type. Default `0`.', host(numberType)),
		string: bind('The base string type. Default `""`.', host(stringType)),
		boolean: bind('The base boolean type. Default `false`.', host(booleanType)),
		unit: bind('The type of `()`, which is its only value.', host(unitType)),
		_: bind('Top type. Accepts every value. Default `()`.', host(topType)),
		'!': bind('Bottom type. Accepts no value. Default `()`.', host(bottomType)),
		vector: bind(
			'Any vector. `(vector T)` is a vector of `T`, also written `[...T]`.',
			host(vectorType)
		),
		IO: bind(
			'Deferred host effect. Parametric: `(IO T)` produces a `T` when forced.',
			host(ioType)
		),

		// -----------------------------------------------------------------
		// Arithmetic
		// -----------------------------------------------------------------
		'+': bind(
			'Adds up `xs`. With nothing to add, it is 0.',
			host(withInverse(variadicNumFold((a, b) => a + b, numberType), invertAdd))
		),
		'*': bind(
			'Multiplies `xs` together. With nothing to multiply, it is 1.',
			host(withInverse(multiply, invertMultiply))
		),
		'-': bind(
			'Takes the rest of `xs` away from the first. With just one, it flips the sign.',
			host(withInverse(variadicNumLeftFold((a, b) => a - b, 0, numberType), invertSubtract))
		),
		'/': bind(
			'Divides the first of `xs` by the rest. With just one, it gives 1 over it.',
			host(withInverse(variadicNumLeftFold((a, b) => a / b, 1, numberOneType), invertDivide))
		),
		mod: bind(
			'What is left after dividing `a` by `b`.',
			host(fn2(numberType, numberType, numberType, (a, b) =>
				(a as number) % (b as number)
			))
		),
		'**': bind(
			'`base` raised to the power of `exp`.',
			host(withInverse(makePower(multiply), invertPower))
		),
		sqrt: bind('The square root of `x`. A negative number has none, and gives NaN.', host(withInverse(numUnary(Math.sqrt), (_, result) => (result as number) ** 2))),
		abs: bind('How far `x` is from 0.', host(numUnary(Math.abs))),
		sign: bind('−1, 0 or 1, by whether `x` is below, at or above 0.', host(numUnary(Math.sign))),
		floor: bind('Rounds `x` down to a whole number.', host(numUnary(Math.floor))),
		ceil: bind('Rounds `x` up to a whole number.', host(numUnary(Math.ceil))),
		round: bind('Rounds `x` to the nearest whole number.', host(numUnary(Math.round))),
		exp: bind('e raised to the power of `x`.', host(numUnary(Math.exp))),
		log: bind('The natural logarithm of `x`.', host(numUnary(Math.log))),
		log2: bind('The base-2 logarithm of `x`.', host(numUnary(Math.log2))),
		log10: bind('The base-10 logarithm of `x`.', host(numUnary(Math.log10))),

		// -----------------------------------------------------------------
		// Trigonometry — radians.
		// -----------------------------------------------------------------
		sin: bind('The sine of `x`, an angle in radians.', host(numUnary(Math.sin))),
		cos: bind('The cosine of `x`, an angle in radians.', host(numUnary(Math.cos))),
		tan: bind('The tangent of `x`, an angle in radians.', host(numUnary(Math.tan))),
		asin: bind('The angle in radians whose sine is `x`.', host(numUnary(Math.asin))),
		acos: bind('The angle in radians whose cosine is `x`.', host(numUnary(Math.acos))),
		atan: bind('The angle in radians whose tangent is `x`.', host(numUnary(Math.atan))),
		atan2: bind(
			'The angle in radians of the direction to `x`, `y`.',
			host(fn2(numberType, numberType, numberType, (y, x) =>
				Math.atan2(y as number, x as number), ['y', 'x']
			))
		),

		// -----------------------------------------------------------------
		// Constants
		// -----------------------------------------------------------------
		pi: bind('A half turn in radians, about 3.14159.', lit(Math.PI)),
		tau: bind('A full turn in radians, about 6.28318.', lit(Math.PI * 2)),
		'half-pi': bind('A quarter turn in radians, about 1.5708.', lit(Math.PI / 2)),
		'quarter-pi': bind('An eighth of a turn in radians, about 0.7854.', lit(Math.PI / 4)),
		e: bind('The base of the natural logarithm, about 2.71828.', lit(Math.E)),
		inf: bind('Larger than any number.', lit(Infinity)),

		// -----------------------------------------------------------------
		// Comparison & boolean
		// -----------------------------------------------------------------
		'<': bind('Whether each of `xs` is less than the next.', host(chainCmp((a, b) => a < b))),
		'>': bind('Whether each of `xs` is greater than the next.', host(chainCmp((a, b) => a > b))),
		'<=': bind('Whether each of `xs` is at most the next.', host(chainCmp((a, b) => a <= b))),
		'>=': bind('Whether each of `xs` is at least the next.', host(chainCmp((a, b) => a >= b))),
		'==': bind('Whether `xs` are all equal.', host(chainEq(true))),
		'!=': bind('Whether each of `xs` differs from the next.', host(chainEq(false))),
		not: bind('The opposite of a boolean.', host(withInverse(fn1(booleanType, booleanType, a => !a), (_, result) => !result))),
		and: bind(
			'Whether all of `xs` are true. With nothing to go on, they are.',
			host(withInverse(variadicBoolFold(xs => xs.every(Boolean), makeType('boolean', v => typeof v === 'boolean', true)), invertAnd))
		),
		or: bind(
			'Whether any of `xs` is true. With nothing to go on, none is.',
			host(withInverse(variadicBoolFold(xs => xs.some(Boolean), booleanType), invertOr))
		),

		// -----------------------------------------------------------------
		// Vectors — element access / shape / order
		// -----------------------------------------------------------------
		first: bind(
			'The first of `xs`, or `()` if there are none.',
			host(
				withSignature(
					fn1(vectorType, topType, xs => (Array.isArray(xs) ? xs[0] ?? UNIT : UNIT), 'xs'),
					generic(['T'], { xs: vectorOf(T) }, T)
				)
			)
		),
		last: bind(
			'The last of `xs`, or `()` if there are none.',
			host(
				withSignature(
					fn1(vectorType, topType, xs =>
						Array.isArray(xs) ? xs[xs.length - 1] ?? UNIT : UNIT, 'xs'
					),
					generic(['T'], { xs: vectorOf(T) }, T)
				)
			)
		),
		count: bind(
			'How many of `xs` there are.',
			host(fn1(vectorType, numberType, xs => (Array.isArray(xs) ? xs.length : 0), 'xs'))
		),
		take: bind(
			'The first `n` of `xs`, or all of them if there are fewer.',
			host(
				withSignature(
					fn2(vectorType, numberType, vectorType, (xs, n) =>
						Array.isArray(xs) ? xs.slice(0, Math.max(0, n as number)) : [],
						['xs', 'n']
					),
					generic(['T'], { xs: vectorOf(T), n: numberType }, vectorOf(T))
				)
			)
		),
		drop: bind(
			'All of `xs` but the first `n`.',
			host(
				withSignature(
					fn2(vectorType, numberType, vectorType, (xs, n) =>
						Array.isArray(xs) ? xs.slice(Math.max(0, n as number)) : [],
						['xs', 'n']
					),
					generic(['T'], { xs: vectorOf(T), n: numberType }, vectorOf(T))
				)
			)
		),

		// -----------------------------------------------------------------
		// Higher-order over vectors
		// -----------------------------------------------------------------
		map: bind(
			'Makes a new vector by applying `f` to each of `xs`.',
			host(withInverse(makeMap(), invertMap))
		),
		filter: bind(
			'Keeps those of `xs` that meet `p`.',
			host(makeFilter())
		),
		reduce: bind(
			'Folds `xs` into one with `f`, starting from `init`.',
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
			'`str` in lowercase.',
			host(fn1(stringType, stringType, s => (s as string).toLowerCase(), 'str'))
		),
		uppercase: bind(
			'`str` in uppercase.',
			host(fn1(stringType, stringType, s => (s as string).toUpperCase(), 'str'))
		),
		trim: bind(
			'`str` without the whitespace at its ends.',
			host(fn1(stringType, stringType, s => (s as string).trim(), 'str'))
		),
		split: bind(
			'Splits `str` at each `sep`.',
			host(
				makeTypedFn(
					[stringType, stringType],
					vectorOf(stringType),
					(s, sep) => (s as string).split(sep as string),
					['str', 'sep']
				)
			)
		),
		join: bind(
			'Puts `xs` together into a string, with `sep` between them.',
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
			'The names of the fields of `rec`, in order.',
			host(
				fn1(recordType, vectorOf(stringType), rec =>
					rec !== null && typeof rec === 'object' && !Array.isArray(rec)
						? Object.keys(rec)
						: [],
					'rec'
				)
			)
		),
		values: bind(
			'The values of the fields of `rec`, in order.',
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
			'Puts records together. Where they share a field, the later one wins.',
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
			'A type of just the values given. It defaults to the first.',
			host(makeEnum())
		),
		refine: bind(
			'The values of `base` that meet `pred`, falling back to `default`.',
			host(makeRefine())
		),

		// -----------------------------------------------------------------
		// Misc
		// -----------------------------------------------------------------
		identity: bind(
			'Gives back what it is given.',
			host(fn1(topType, topType, a => a))
		),
		show: bind(
			'Writes any value as Glisp source.',
			host(fn1(topType, stringType, v => showValue(v)))
		),
		range: bind(
			'The whole numbers from `start` up to, and not including, `end`. It counts down if `end` is lower.',
			host(makeRange())
		),
		seed: bind(
			'What decides what `random` gives: a number, a string, a boolean, or a vector of them.',
			host(seedType)
		),
		random: bind(
			'What makes a sequence of random values, as a function from a number to a value of it. The same seed and the same number give the same value, on any machine.',
			host(makeRandom())
		),
		reverse: bind('`xs` in reverse.', host(makeReverse())),
		slice: bind(
			'The part of `xs` from `start` up to `end`.',
			host(makeSliceOverload())
		),
		size: bind(
			'How many elements or characters there are.',
			host(makeSizeOverload())
		),
		'++': bind(
			'Puts vectors, or strings, end to end. With nothing to put, it is `()`.',
			host(makeConcatOverload())
		),
	}

	// Glisp-defined helpers: convenience bindings written in the language
	// itself, using the host primitives above (`+`, `*`, `map`, `reduce`, etc.)
	const helpers: ReadonlyArray<readonly [string, string]> = [
		// integer step / sign helpers
		['inc', '^{doc: "One more than `n`."} (=> (n: number): number (+ n 1))'],
		['dec', '^{doc: "One less than `n`."} (=> (n: number): number (- n 1))'],
		['neg', '^{doc: "`n` with its sign flipped."} (=> (n: number): number (- n))'],

		// 2-arg min / max
		['min', '^{doc: "The smaller of `a` and `b`."} (=> (a: number b: number): number (? (< a b) true a _ b))'],
		['max', '^{doc: "The larger of `a` and `b`."} (=> (a: number b: number): number (? (> a b) true a _ b))'],

		// reductions over a vector
		['sum', '^{doc: "Adds up a vector of numbers."} (=> (xs: _): number (reduce xs 0 +))'],
		['product', '^{doc: "Multiplies a vector of numbers together."} (=> (xs: _): number (reduce xs 1 *))'],

		// angle conversion — Glisp's trig is radians; these are the bridges
		['to-deg', '^{doc: "An angle in radians, in degrees."} (=> (rad: number): number (/ (* rad 180) pi))'],
		['to-rad', '^{doc: "An angle in degrees, in radians."} (=> (deg: number): number (/ (* deg pi) 180))'],
		['to-turn', '^{doc: "An angle in radians, in turns."} (=> (rad: number): number (/ rad tau))'],
		['turn', '^{doc: "An angle in turns, in radians."} (=> (t: number): number (* t tau))'],

		// range remapping — staples for design / motion code
		['lerp', '^{doc: "Goes from `a` to `b` as `t` goes from 0 to 1."} (=> (a: number b: number t: number): number (+ a (* (- b a) t)))'],
		['mix', '^{doc: "Goes from `a` to `b` as `t` goes from 0 to 1."} (=> (a: number b: number t: number): number (lerp a b t))'],
		['clamp', '^{doc: "Keeps `x` between `lo` and `hi`."} (=> (lo: number hi: number x: number): number (min hi (max lo x)))'],
		['clamp01', '^{doc: "Keeps `x` between 0 and 1."} (=> (x: number): number (clamp 0 1 x))'],
		['fit', '^{doc: "Maps `x` from `omin` to `omax` onto `nmin` to `nmax`."} (=> (omin: number omax: number nmin: number nmax: number x: number): number (+ nmin (* (- nmax nmin) (/ (- x omin) (- omax omin)))))'],
		['fit01', '^{doc: "Maps `x` from 0 to 1 onto `lo` to `hi`."} (=> (lo: number hi: number x: number): number (lerp lo hi x))'],
		['fit11', '^{doc: "Maps `x` from −1 to 1 onto `lo` to `hi`."} (=> (lo: number hi: number x: number): number (lerp lo hi (* 0.5 (+ x 1))))'],
		['step', '^{doc: "0 while `x` is below `edge`, and 1 from there on."} (=> (edge: number x: number): number (? (< x edge) true 0 _ 1))'],

		// Note: `?` is not an identifier character per spec, so the
		// Scheme-style predicate naming `even?` / `empty?` is unavailable.
	]

	return makeTopLevel({
		...withParamLabels(hostBindings),
		...Object.fromEntries(helpers.map(([name, src]) => [name, parse(src)])),
	})
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
	return withSignature(
		makeTypedFn(
			[vectorType, makeFunctionType([topType], topType, { paramNames: ['x'] })],
			vectorType,
			(xs, fn) =>
				(xs as unknown[]).map(x => (fn as (a: unknown) => unknown)(x)),
			['xs', 'f']
		),
		generic(
			['T', 'U'],
			{ xs: vectorOf(T), f: makeFunctionType([T], U, { paramNames: ['x'] }) },
			vectorOf(U)
		)
	)
}

function makeFilter(): TypedHostFn {
	return withSignature(
		makeTypedFn(
			[
				vectorType,
				makeFunctionType([topType], booleanType, { paramNames: ['x'] }),
			],
			vectorType,
			(xs, p) =>
				(xs as unknown[]).filter(x =>
					Boolean((p as (a: unknown) => unknown)(x))
				),
			['xs', 'p']
		),
		generic(
			['T'],
			{
				xs: vectorOf(T),
				p: makeFunctionType([T], booleanType, { paramNames: ['x'] }),
			},
			vectorOf(T)
		)
	)
}

function makeReduce(): TypedHostFn {
	return withSignature(
		makeTypedFn(
			[
				vectorType,
				topType,
				makeFunctionType([topType, topType], topType, {
					paramNames: ['acc', 'x'],
				}),
			],
			topType,
			(xs, init, fn) =>
				(xs as unknown[]).reduce(
					(acc, x) => (fn as (a: unknown, b: unknown) => unknown)(acc, x),
					init
				),
			['xs', 'init', 'f']
		),
		generic(
			['T', 'A'],
			{
				xs: vectorOf(T),
				init: A,
				f: makeFunctionType([A, T], A, { paramNames: ['acc', 'x'] }),
			},
			A
		)
	)
}

// -----------------------------------------------------------------------------
// Type constructors — enum, refine
// -----------------------------------------------------------------------------

/**
 * `(enum v0 v1 ...)` — produce a finite-set type whose values are exactly
 * those listed. The default is the first listed value.
 */
function makeEnum(): TypedHostFn {
	return withWritten(
		makeTypedFn(
			[topType],
			typeType,
			(first, ...rest) => {
				const set = new Set([first, ...rest])
				const tail = rest.map(showValue).join(' ')
				const name =
					rest.length === 0
						? `(enum ${showValue(first)})`
						: `(enum ${showValue(first)} ${tail})`
				return makeType(name, v => set.has(v), first, {
					kind: 'enum',
					values: set,
				})
			},
			['first'],
			topType
		),
		(type, args) => {
			const about = new Map(
				args.flatMap(arg => {
					const value = arg.kind === 'meta' ? literalValue(arg) : undefined
					return arg.kind === 'meta' && value !== undefined
						? [[value, arg.metadata] as const]
						: []
				})
			)
			if (about.size === 0 || !isTypeValue(type)) return type
			return Object.create(type, { shape: { value: { ...type.shape, about } } })
		}
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
		typeType,
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
		vectorOf(numberType),
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

export const seedType = makeType('seed', isSeed, 0)

/** What makes a sequence: a function from a number to the value at that place in it. */
function makeRandom(): Record<string, TypedHostFn> {
	const sequenceOf = (element: TypeValue): TypeValue =>
		makeFunctionType([numberType], element, { paramNames: ['i'] })
	const sequence = (element: TypeValue, at: (i: number) => unknown): TypedHostFn =>
		makeTypedFn([numberType], element, i => at(i as number), ['i'])

	return {
		number: withDoc(
			makeTypedFn(
				[seedType],
				sequenceOf(numberType),
				seed => sequence(numberType, i => randomAt(seed, i)),
				['seed']
			),
			'A sequence of numbers from 0 up to, and not including, 1.',
			'Random Number'
		),
		between: withDoc(
			makeTypedFn(
				[seedType, numberType, numberType],
				sequenceOf(numberType),
				(seed, lo, hi) =>
					sequence(numberType, i => (lo as number) + ((hi as number) - (lo as number)) * randomAt(seed, i)),
				['seed', 'lo', 'hi']
			),
			'A sequence of numbers from `lo` up to, and not including, `hi`.',
			'Random Between'
		),
		pick: withDoc(
			withSignature(
				makeTypedFn(
					[seedType, vectorType],
					sequenceOf(topType),
					(seed, xs) => {
						const from = xs as unknown[]
						return sequence(topType, i =>
							from.length === 0 ? UNIT : from[Math.floor(randomAt(seed, i) * from.length)]
						)
					},
					['seed', 'xs']
				),
				generic(['T'], { seed: seedType, xs: vectorOf(T) }, sequenceOf(T))
			),
			'A sequence of what is in `xs`, each as likely as the next. With nothing in `xs`, it gives `()`.',
			'Random Pick'
		),
	}
}

function makeReverse(): TypedHostFn {
	return withSignature(
		makeTypedFn([vectorType], vectorType, xs =>
			(xs as unknown[]).slice().reverse()
		),
		generic(['T'], { xs: vectorOf(T) }, vectorOf(T))
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

/** `++`: vectors or strings, any number of them. With none, there is nothing: `()`. */
function makeConcatOverload(): OverloadValue {
	const variadic = (type: TypeValue, concat: (xs: unknown[]) => unknown) =>
		withSignature(
			makeTypedFn([], type, (...xs) => concat(xs), [], type),
			makeFunctionType([], type, {
				paramNames: [],
				variadicTail: type,
				variadicName: 'xs',
			})
		)
	return new OverloadValue([
		makeTypedFn([], unitType, () => UNIT, []),
		variadic(vectorType, xs => (xs as unknown[][]).flat(1)),
		variadic(stringType, xs => (xs as string[]).join('')),
	])
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
