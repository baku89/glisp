/**
 * Evaluator.
 *
 * Walks the AST and produces JS-native values per the host-api.md marshaling
 * table. Failures surface as `()` plus diagnostics — eval never throws.
 *
 * Not yet implemented:
 * - `expand` / macro evaluation
 * - generic-parameter resolution in `(=> {T} [params]: T body)`
 */

import { desugar } from './desugar.js'
import {
	infer,
	callParameters,
	paramTypeOf,
	resolveTypeSlot,
	solveClosureGenerics,
} from './infer.js'
import {
	type AST,
	type BindingTarget,
	type CallAST,
	type Diagnostic,
	type Env,
	type FnAST,
	type Frame,
	nameOf,
	type RecordAST,
	type RecordEntry,
	SpreadAST,
	UNIT,
	withoutMeta,
} from './types.js'

// -----------------------------------------------------------------------------
// Result type
// -----------------------------------------------------------------------------

/**
 * What `evaluate` returns: the resolved JS value plus any diagnostics
 * accumulated along the way. Evaluation never throws on user errors,
 * so every reasonable host **must** check `diagnostics` after calling
 * `evaluate` — `value` may be the spec-defined fallback (`()` or a
 * type's default) when something went wrong.
 */
export interface EvalResult {
	readonly value: unknown
	readonly diagnostics: ReadonlyArray<Diagnostic>
}

// -----------------------------------------------------------------------------
// Closure (Glisp function value)
// -----------------------------------------------------------------------------

/**
 * Glisp function value. Per host-api.md, a Glisp closure surfaced to JS
 * is a callable JS function: invoking it forces evaluation in the
 * closure's captured env and returns the JS value.
 *
 * The implementation is a regular JS function carrying brand-property
 * marker `__glispClosure`, plus the function-literal AST and the env in
 * which the literal was created. `instanceof`-style checks are not
 * usable on a plain function, so dispatch goes through `isGlispClosure`.
 */
export interface GlispClosure {
	(...args: unknown[]): unknown
	readonly __glispClosure: true
	readonly ast: FnAST
	readonly capturedEnv: Env
}

/**
 * Wrap a function-literal AST + the env it was defined in as a
 * callable JS function (a `GlispClosure`). Hosts usually receive
 * closures from the evaluator; call `makeClosure` directly only when
 * constructing function values to inject from the host side.
 */
export function makeClosure(ast: FnAST, capturedEnv: Env): GlispClosure {
	const closure = function (
		this: GlispClosure | undefined,
		...args: unknown[]
	): unknown {
		return invokeClosureFromJS(closure, args)
	} as unknown as GlispClosure
	Object.defineProperty(closure, '__glispClosure', { value: true })
	Object.defineProperty(closure, 'ast', { value: ast })
	Object.defineProperty(closure, 'capturedEnv', { value: capturedEnv })
	return closure
}

export function isGlispClosure(v: unknown): v is GlispClosure {
	return (
		typeof v === 'function' &&
		(v as { __glispClosure?: true }).__glispClosure === true
	)
}

/**
 * Invoke a Glisp closure from JS. JS-side args are reified to ASTs
 * (literal-wrapped) before being bound to parameters, so the closure
 * sees them through the same lazy-binding path as a normal Glisp call.
 */
/**
 * Module-level sink for diagnostics produced by closures called from
 * JS-side host functions. JS-callable closures return only `value` to
 * stay compatible with normal JS calling conventions, so any
 * diagnostics emitted by their bodies (e.g. a runtime type mismatch
 * on a parameter) need a side channel to reach the typed-host-fn
 * caller. `withJSCallSink` sets the active sink for the duration of a
 * host-fn invocation; `invokeClosureFromJS` pushes into it.
 */
let activeJSCallSink: Diagnostic[] | null = null

function withJSCallSink<T>(fn: () => T): { value: T; diagnostics: Diagnostic[] } {
	const prev = activeJSCallSink
	const sink: Diagnostic[] = []
	activeJSCallSink = sink
	try {
		const value = fn()
		return { value, diagnostics: sink }
	} finally {
		activeJSCallSink = prev
	}
}

function invokeClosureFromJS(c: GlispClosure, args: unknown[]): unknown {
	const argAsts = args.map(a => toAst(a, c.capturedEnv))
	const r = applyClosure(c, argAsts, undefined, c.capturedEnv, c.ast, [])
	if (activeJSCallSink !== null && r.diagnostics.length > 0) {
		for (const d of r.diagnostics) activeJSCallSink.push(d)
	}
	return r.value
}

// -----------------------------------------------------------------------------
// Type value (callable cast with marker properties)
// -----------------------------------------------------------------------------

/**
 * Structural shape of a TypeValue — recorded so type-compatibility checks
 * can compare two types' insides rather than just their printed names.
 *
 * `kind: 'primitive'` is the default for opaque base types built via
 * `makeType` (number, string, top, etc.); compatibility there is by
 * `===` identity. The other kinds expose the constituent types so a
 * checker can recurse: `function` has `paramTypes` / `returnType`,
 * `literal` has its one value, `refine` keeps a pointer to the base.
 */
export type TypeShape =
	| { readonly kind: 'primitive' }
	| {
			readonly kind: 'function'
			readonly paramTypes: ReadonlyArray<TypeValue>
			readonly returnType: TypeValue
			readonly variadicTail?: TypeValue
			readonly paramNames?: ReadonlyArray<string>
			/** What a path calls the variadic arguments. `rest` if unsaid. */
			readonly variadicName?: string
			/** Type variables this signature is generic over. */
			readonly generics?: ReadonlyArray<string>
	  }
	/** A value written where a type is wanted: the type of just that value. */
	| { readonly kind: 'literal'; readonly value: number | string | boolean }
	| { readonly kind: 'refine'; readonly base: TypeValue }
	/** `(| A B)`: the values of any of `members`. With none, it is no value at all. */
	| { readonly kind: 'union'; readonly members: ReadonlyArray<TypeValue> }
	| { readonly kind: 'io'; readonly payload: TypeValue }
	| { readonly kind: 'vector'; readonly element: TypeValue }
	| {
			readonly kind: 'tuple'
			readonly elements: ReadonlyArray<TypeValue>
			readonly rest?: TypeValue
	  }
	/** A generic's type variable, standing for a type to be solved at a call. */
	| { readonly kind: 'var'; readonly name: string }
	/** `(F T)` where `F` is itself a type variable. */
	| {
			readonly kind: 'apply'
			readonly head: TypeValue
			readonly args: ReadonlyArray<TypeValue>
	  }
	/** A reference to a recursive type, which is resolved once it is built. */
	| { readonly kind: 'lazy'; readonly resolve: () => TypeValue | null }
	| {
			readonly kind: 'record'
			readonly fields: ReadonlyMap<string, TypeValue>
			readonly optional: ReadonlySet<string>
	  }

/**
 * Host-side representation of a Glisp type. `fits` is the runtime
 * predicate ("is this JS value a member of the type?"), `default` is
 * the value `coerceTo` (and the typed-slot fallback) substitutes when
 * a value does not fit, and `shape` lets compatibility checks recurse
 * through structured types (functions, enums, refinements, parametric
 * IOs, etc.).
 *
 * Construct one via `makeType` / `makeFunctionType` rather than
 * literal object syntax so the brand and shape stay consistent.
 */
export interface TypeValue {
	readonly __glispType: true
	readonly typeName: string
	readonly fits: (v: unknown) => boolean
	readonly default: unknown
	/** The expression `default` is what comes of, for what is written where it is wanted. */
	readonly defaultAst?: AST
	readonly shape: TypeShape
	/**
	 * What is said about the values of this type, as written. It takes no part in
	 * what fits what. Only static analysis reads it, so nothing in it is evaluated.
	 */
	readonly meta?: RecordAST
	/** This type without `meta`, if it has any. */
	readonly plain?: TypeValue
	/** What goes with this type, read as `T.name`. It says nothing about its values. */
	readonly members?: Readonly<Record<string, unknown>>
	/**
	 * Optional type-constructor hook. When set, `(T arg ...)` is dispatched
	 * here with the args evaluated as types, and the result is the
	 * parameterized TypeValue. Most types do not have this; for them, a
	 * `(T v)` call is rejected with a hint to use `^T v`.
	 */
	readonly apply?: (
		typeArgs: ReadonlyArray<TypeValue>
	) => TypeValue | { error: string }
}

/**
 * Build a type value: a plain branded object carrying the type's name,
 * `fits` predicate, default, and structural shape.
 *
 * Type values are **not** callable — `(T v)` is rejected by the
 * evaluator with a hint to use `^T v` instead. The cast machinery
 * still exists internally (typed slots, default fallback for missing
 * args) but goes through `coerceTo`, not through invocation.
 */
export function makeType(
	name: string,
	fits: (v: unknown) => boolean,
	defaultValue: unknown,
	shape: TypeShape = { kind: 'primitive' }
): TypeValue {
	return {
		__glispType: true,
		typeName: name,
		fits,
		default: defaultValue,
		shape,
	}
}

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

/** A generic's type variable. Accepts any value, since it is not solved yet. */
export function makeTypeVar(name: string): TypeValue {
	return makeType(name, () => true, UNIT, { kind: 'var', name })
}

/** `(F T)` for a type variable `F`. */
export function makeApplyType(
	head: TypeValue,
	args: ReadonlyArray<TypeValue>
): TypeValue {
	const name = `(${head.typeName} ${args.map(t => t.typeName).join(' ')})`
	return makeType(name, () => true, UNIT, { kind: 'apply', head, args })
}

/** A reference, by `name`, to a type that `resolve` yields once it is built. */
export function makeLazyType(
	name: string,
	resolve: () => TypeValue | null
): TypeValue {
	return {
		__glispType: true,
		typeName: name,
		fits: v => resolve()?.fits(v) ?? true,
		get default() {
			return resolve()?.default ?? UNIT
		},
		shape: { kind: 'lazy', resolve },
	}
}

/** What a recursive reference stands for, or the type itself otherwise, bare. */
export function unwrapLazy(type: TypeValue): TypeValue {
	let current = type.plain ?? type
	while (current.shape.kind === 'lazy') {
		const next = current.shape.resolve()
		if (next === null) return current
		current = next.plain ?? next
	}
	return current
}

/**
 * What marks the place it is written at, rather than saying anything of a value: a lock, what is
 * hidden, a function of `%` and a name. All else goes along with a type.
 */
const STAYS_BEHIND: ReadonlySet<string> = new Set([PIN, HIDDEN, LAMBDA, NAME])

/**
 * `type`, with `metadata` said about it as well, which goes over what it already
 * says, except for what stays where it is written.
 */
export function withTypeMeta(type: TypeValue, metadata: RecordAST): TypeValue {
	const added = metadata.fields.filter(
		(field): field is readonly [string, AST] =>
			!('kind' in field) && !STAYS_BEHIND.has(field[0])
	)
	if (added.length === 0) return type
	const kept = (type.meta?.fields ?? []).filter(
		field =>
			!('kind' in field) && !added.some(([key]) => key === field[0])
	)
	// Inheriting, since a recursive type works out what it has only when asked.
	return Object.create(type.plain ?? type, {
		meta: { value: new RecordASTClass([...kept, ...added]) },
		plain: { value: type.plain ?? type },
	}) as TypeValue
}

/**
 * The type a `default` in `metadata` makes of `type`, which is the one thing in
 * metadata that evaluation reads. One that does not fit says so and has no effect.
 */
export function withDefaultFrom(
	type: TypeValue,
	metadata: RecordAST,
	env: Env
): { type: TypeValue; diagnostics: readonly Diagnostic[] } {
	const field = metadata.get('default')
	if (field === undefined) return { type, diagnostics: [] }
	const { value, diagnostics } = evaluate(field, enterNode(metadata, env))
	if (!type.fits(value)) {
		return {
			type,
			diagnostics: [
				...diagnostics,
				{
					level: 'error',
					message: `default does not fit ${type.typeName}`,
					source: { ast: field, env },
				},
			],
		}
	}
	const base = Object.create(type.plain ?? type, {
		default: { value },
		defaultAst: { value: field },
	}) as TypeValue
	return {
		type: type.meta === undefined ? base : withTypeMeta(base, type.meta),
		diagnostics,
	}
}

/** A type as source, with what is said about it. */
export function printType(type: TypeValue): string {
	if (type.meta === undefined) return type.typeName
	const said = type.meta.fields.flatMap(field => ('kind' in field ? [] : [`${field[0]}: ${field[1].print()}`]))
	return `(: ${type.typeName} ${said.join(' ')})`
}

const literalTypes = new Map<unknown, TypeValue>()

/**
 * The type of just `value`, as `"round"` is where a type is wanted. A union of
 * them, `(| "round" "butt")`, is a type of just those values.
 */
export function makeLiteralType(value: number | string | boolean): TypeValue {
	const known = literalTypes.get(value)
	if (known !== undefined) return known
	const type = makeType(new LitASTClass(value).print(), v => v === value, value, {
		kind: 'literal',
		value,
	})
	literalTypes.set(value, type)
	return type
}

/**
 * Whether a slot of `type` can be left out: what is left out is `()`, and so it can
 * if `unit` is one of what it is, as `y?: T` says, which is `y: (| T unit)`.
 */
export function isOmittable(type: TypeValue | null): boolean {
	if (type === null) return false
	const resolved = unwrapLazy(type)
	if (resolved.typeName === 'unit') return true
	return (
		resolved.shape.kind === 'union' &&
		resolved.shape.members.some(t => unwrapLazy(t).typeName === 'unit')
	)
}

/** `type`, or nothing: `(| type unit)`, which `y?: type` stands for. */
export function omittable(type: TypeValue): TypeValue {
	return makeUnionType([type, unitType])
}

/**
 * `(| A B ...)`: the values of any of `members`, defaulting to the first one's
 * default. A union in it is spread out into its members, the same type twice is
 * there once, and a union of just one type is that type.
 */
export function makeUnionType(members: ReadonlyArray<TypeValue>): TypeValue {
	const flat: TypeValue[] = []
	for (const member of members) {
		const inner = unwrapLazy(member).shape
		for (const t of inner.kind === 'union' ? inner.members : [member]) {
			if (!flat.some(seen => seen === t || (typeFits(seen, t) && typeFits(t, seen)))) {
				flat.push(t)
			}
		}
	}
	if (flat.length === 1) return flat[0]!
	if (flat.length === 0) return unionConstructor
	return {
		__glispType: true,
		typeName: `(| ${flat.map(t => t.typeName).join(' ')})`,
		fits: v => flat.some(t => t.fits(v)),
		get default() {
			return flat[0]!.default
		},
		shape: { kind: 'union', members: flat },
	}
}

/**
 * `|` by itself, the union of no types, which no value fits. Given types, as in
 * `(| A B)`, it is their union.
 */
export const unionConstructor: TypeValue = {
	__glispType: true,
	typeName: '(|)',
	fits: () => false,
	default: UNIT,
	shape: { kind: 'union', members: [] },
	apply: typeArgs => makeUnionType(typeArgs),
}

const vectorTypes: WeakMap<TypeValue, TypeValue> = new WeakMap()

/** `[...T]`, also written `(vector T)`. */
function makeVectorType(element: TypeValue): TypeValue {
	const known = vectorTypes.get(element)
	if (known !== undefined) return known
	const isAny = element.typeName === '_'
	const type: TypeValue = {
		__glispType: true,
		typeName: isAny ? 'vector' : `[...${element.typeName}]`,
		fits: v =>
			Array.isArray(v) && (isAny || v.every(x => element.fits(x))),
		default: [],
		shape: { kind: 'vector', element },
		apply: typeArgs =>
			typeArgs.length === 1
				? makeVectorType(typeArgs[0]!)
				: { error: `vector expects 1 type argument, got ${typeArgs.length}` },
	}
	vectorTypes.set(element, type)
	return type
}

/** `[T U]`, or with `rest` `[T U ...V]`. With no fixed elements, a vector. */
export function makeTupleType(
	elements: ReadonlyArray<TypeValue>,
	rest?: TypeValue
): TypeValue {
	if (elements.length === 0 && rest !== undefined) return makeVectorType(rest)
	const names = elements.map(t => t.typeName)
	if (rest !== undefined) names.push(`...${rest.typeName}`)
	return makeType(
		`[${names.join(' ')}]`,
		v => {
			if (!Array.isArray(v)) return false
			if (rest === undefined && v.length !== elements.length) return false
			if (v.length < elements.length) return false
			return v.every((x, i) => (elements[i] ?? rest!).fits(x))
		},
		elements.map(t => t.default),
		rest === undefined
			? { kind: 'tuple', elements }
			: { kind: 'tuple', elements, rest }
	)
}

/**
 * `{x: T y?: U}`. `y?: U` is `y: (| U unit)`, and a field of a type that `()` fits
 * can be missing, as what is read of a missing field is `()`.
 */
export function makeRecordType(
	written: ReadonlyMap<string, TypeValue>,
	optional: ReadonlySet<string> = new Set()
): TypeValue {
	const fields: ReadonlyMap<string, TypeValue> =
		optional.size === 0
			? written
			: new Map([...written].map(([key, type]) => [key, optional.has(key) ? omittable(type) : type]))
	const omits = new Set([...fields].filter(([, type]) => isOmittable(type)).map(([key]) => key))
	const defaults: Record<string, unknown> = {}
	for (const [key, type] of fields) defaults[key] = type.default
	const parts = [...fields].map(([key, type]) =>
		omits.has(key) ? `${key}?: ${withoutUnit(type).typeName}` : `${key}: ${type.typeName}`
	)
	return makeType(
		`{${parts.join(' ')}}`,
		v => {
			if (v === null || typeof v !== 'object' || Array.isArray(v)) return false
			const record = v as Record<string, unknown>
			for (const [key, type] of fields) {
				if (!(key in record)) {
					if (!omits.has(key)) return false
				} else if (!type.fits(record[key])) {
					return false
				}
			}
			return true
		},
		defaults,
		{ kind: 'record', fields, optional: omits }
	)
}

/** What `type` is besides `()`: `T` of `(| T unit)`. */
export function withoutUnit(type: TypeValue): TypeValue {
	const resolved = unwrapLazy(type)
	if (resolved.shape.kind !== 'union') return type
	const rest = resolved.shape.members.filter(t => unwrapLazy(t).typeName !== 'unit')
	return rest.length === resolved.shape.members.length ? type : makeUnionType(rest)
}

export function isTypeValue(v: unknown): v is TypeValue {
	return v != null && (v as { __glispType?: true }).__glispType === true
}

/**
 * Coerce `v` through type `t`: return `v` itself if `t.fits(v)`,
 * otherwise the type's default. Pure — never emits diagnostics. The
 * caller is responsible for surfacing a type mismatch when relevant
 * (see `evalCoerce` and `callTypedHostFn`).
 */
export function coerceTo(t: TypeValue, v: unknown): unknown {
	return t.fits(v) ? v : t.default
}

/**
 * Build a function-shaped TypeValue carrying its declared parameter and
 * return types. The runtime `fits` predicate accepts any callable (a
 * function-shaped TypeValue does not constrain runtime arity); structural
 * compatibility against another function type goes through `typeFits`,
 * which compares the recorded shapes.
 */
export function makeFunctionType(
	paramTypes: ReadonlyArray<TypeValue>,
	returnType: TypeValue,
	options?: {
		paramNames?: ReadonlyArray<string>
		variadicTail?: TypeValue
		variadicName?: string
		generics?: ReadonlyArray<string>
	}
): TypeValue {
	const params = paramTypes.map((t, i) => {
		const name = options?.paramNames?.[i] ?? `_${i}`
		return name === '' ? t.typeName : `${name}: ${t.typeName}`
	})
	if (options?.variadicTail !== undefined) {
		params.push(`...${options.variadicName ?? 'rest'}: ${options.variadicTail.typeName}`)
	}
	const generics = options?.generics ?? []
	const genericList = generics.length > 0 ? `{${generics.join(' ')}} ` : ''
	const name = `(=> ${genericList}[${params.join(' ')}]: ${returnType.typeName})`
	const shape: TypeShape = {
		kind: 'function',
		paramTypes,
		returnType,
		...(options?.variadicTail !== undefined
			? { variadicTail: options.variadicTail }
			: {}),
		...(options?.paramNames !== undefined
			? { paramNames: options.paramNames }
			: {}),
		...(options?.variadicName !== undefined
			? { variadicName: options.variadicName }
			: {}),
		...(generics.length > 0 ? { generics } : {}),
	}
	return makeType(name, v => typeof v === 'function', UNIT, shape)
}

/**
 * Does every value of `actual` belong to `expected`? Types are sets of values,
 * so this is subtyping, and it is structural: tuples fit vectors, records may
 * have extra fields, `"a"` fits `string`, and a refinement fits its base.
 *
 * - `_` as `actual` means "not known" rather than "anything", so it fits. Only
 *   what is known to be wrong gets rejected.
 * - A type variable fits only itself: inside a generic body, `T` is opaque.
 * - Function parameters match in either direction, so that a `_` in a slot's
 *   signature means "don't care".
 */
export function typeFits(actual: TypeValue, expected: TypeValue): boolean {
	return fitsGuarded(actual, expected, new Map())
}

function fitsGuarded(
	actualType: TypeValue,
	expectedType: TypeValue,
	assumed: Map<TypeValue, Set<TypeValue>>
): boolean {
	if (actualType === expectedType) return true
	const actual = unwrapLazy(actualType)
	const expected = unwrapLazy(expectedType)
	if (actual === expected) return true
	if (expected.typeName === '_' || actual.typeName === '_') return true
	if (actual.typeName === '!') return true

	// A recursive type reaching itself again holds as long as the rest does.
	if (actualType.shape.kind === 'lazy' || expectedType.shape.kind === 'lazy') {
		let against = assumed.get(actual)
		if (against === undefined) assumed.set(actual, (against = new Set()))
		if (against.has(expected)) return true
		against.add(expected)
	}
	const fits = (a: TypeValue, e: TypeValue): boolean =>
		fitsGuarded(a, e, assumed)

	const a = actual.shape
	const e = expected.shape
	// A union fits where each of its members does, and a type fits a union where
	// it fits one of its members.
	if (a.kind === 'union') return a.members.every(t => fits(t, expected))
	if (e.kind === 'union') return e.members.some(t => fits(actual, t))
	if (a.kind === 'var' || e.kind === 'var') {
		return a.kind === 'var' && e.kind === 'var' && a.name === e.name
	}
	if (a.kind === 'apply' || e.kind === 'apply') {
		return (
			a.kind === 'apply' &&
			e.kind === 'apply' &&
			fits(a.head, e.head) &&
			a.args.length === e.args.length &&
			a.args.every((arg, i) => fits(arg, e.args[i]!))
		)
	}
	if (a.kind === 'literal') return expected.fits(a.value)
	if (a.kind === 'refine' && e.kind !== 'refine') return fits(a.base, expected)
	if (a.kind === 'function' && e.kind === 'function') {
		if (
			a.variadicTail === undefined &&
			e.variadicTail === undefined &&
			a.paramTypes.length !== e.paramTypes.length
		) {
			return false
		}
		const length = Math.max(a.paramTypes.length, e.paramTypes.length)
		for (let i = 0; i < length; i++) {
			const ap = a.paramTypes[i] ?? a.variadicTail
			const ep = e.paramTypes[i] ?? e.variadicTail
			if (ap === undefined || ep === undefined) return false
			if (!fits(ap, ep) && !fits(ep, ap)) return false
		}
		return fits(a.returnType, e.returnType)
	}
	if (a.kind === 'io' && e.kind === 'io') return fits(a.payload, e.payload)
	if (a.kind === 'vector' && e.kind === 'vector') return fits(a.element, e.element)
	if (a.kind === 'tuple' && e.kind === 'vector') {
		return (
			a.elements.every(t => fits(t, e.element)) &&
			(a.rest === undefined || fits(a.rest, e.element))
		)
	}
	if (a.kind === 'tuple' && e.kind === 'tuple') {
		if (e.rest === undefined) {
			if (a.rest !== undefined || a.elements.length !== e.elements.length) {
				return false
			}
		} else if (a.elements.length < e.elements.length) {
			return false
		}
		return (
			a.elements.every((t, i) => fits(t, e.elements[i] ?? e.rest!)) &&
			(a.rest === undefined || e.rest === undefined || fits(a.rest, e.rest))
		)
	}
	if (a.kind === 'record' && e.kind === 'record') {
		for (const [key, type] of e.fields) {
			const field = a.fields.get(key)
			if (field === undefined) {
				if (!e.optional.has(key)) return false
			} else if (!fits(field, type)) {
				return false
			}
		}
		return true
	}
	return actual.typeName === expected.typeName
}

// -----------------------------------------------------------------------------
// Typed host function — JS function with declared parameter and return types
// -----------------------------------------------------------------------------

export interface TypedHostFn {
	(...args: unknown[]): unknown
	readonly __glispTypedFn: true
	readonly paramTypes: ReadonlyArray<TypeValue>
	readonly returnType: TypeValue
	/** How it works backward. See `withInverse`. */
	readonly inverse?: HostInverse
	/**
	 * Optional parameter names. When set, callers may pass keyword
	 * arguments at the call site. When unset (the default), kwargs at
	 * the call site emit a diagnostic — there's no way to route them.
	 */
	readonly paramNames?: ReadonlyArray<string>
	/** The parameters that can go unpassed, by name. See `withOptional`. */
	readonly optional?: ReadonlySet<string>
	/** Goes over what it returned, knowing what was written. See `withWritten`. */
	readonly written?: (value: unknown, args: ReadonlyArray<AST>) => unknown
	/**
	 * Optional element type for an open trailing variadic. When set, any
	 * positional arguments past `paramTypes.length` are cast through this
	 * type and forwarded as additional positional args.
	 */
	readonly variadicTail?: TypeValue
	/** What those arguments are called, for a path to go by (`rest` if unsaid). */
	readonly variadicName?: string
	/**
	 * The full type, when it says more than the parameter types above, which
	 * are what values are checked against at run time: `map` is generic here.
	 */
	readonly signature?: TypeValue
	/**
	 * What this call is one level down the abstraction ladder, if anything.
	 * Without one, its only remaining rung is its value.
	 */
	readonly expansion?: HostExpansion
}

/**
 * The next rung of a call to a host function. `args` are the argument
 * expressions as written, in parameter order, with any variadic arguments at
 * the end, and undefined for one not passed. Return null to have no next rung.
 */
export type HostExpansion = (
	args: ReadonlyArray<AST | undefined>,
	context: HostExpansionContext
) => AST | null

export interface HostExpansionContext {
	/** Work out an argument. Whatever is not asked for stays as written. */
	value(ast: AST): unknown
	/**
	 * A call to `fn`, written as `name` if that is what the name means at the
	 * call site, and with `fn` itself embedded if the name has been shadowed.
	 */
	call(name: string, fn: unknown, args: ReadonlyArray<AST>): AST
}

/**
 * Wrap a plain JS function with declared parameter and return types so the
 * evaluator can cast each argument before the call (and fill missing ones
 * with the parameter type's default). This is what gives `(+ "str")` the
 * expected `0` rather than `"strundefined"` — `"str"` doesn't fit `number`,
 * so the cast falls back to the default `0`, and the missing second argument
 * is filled the same way.
 *
 * Pass `paramNames` to enable kwargs at call sites — names are matched
 * positionally against `paramTypes`.
 *
 * Pass `variadicTail` to make the last position open-ended (extra args are
 * cast through the tail type and forwarded). Callers receive every cast
 * arg — the wrapped JS function is responsible for any folding logic.
 *
 * Spec: docs/spec/types.md — default fallback timing
 */
export function makeTypedFn(
	paramTypes: ReadonlyArray<TypeValue>,
	returnType: TypeValue,
	fn: (...args: unknown[]) => unknown,
	paramNames?: ReadonlyArray<string>,
	variadicTail?: TypeValue,
	variadicName?: string
): TypedHostFn {
	const wrapped = (...args: unknown[]): unknown => {
		const cast: unknown[] = []
		for (let i = 0; i < paramTypes.length; i++) {
			const t = paramTypes[i]!
			const provided = i < args.length ? args[i] : t.default
			cast.push(coerceTo(t, provided))
		}
		if (variadicTail !== undefined) {
			for (let i = paramTypes.length; i < args.length; i++) {
				cast.push(coerceTo(variadicTail, args[i]))
			}
		}
		const result = fn(...cast)
		// Coerce the return value as well — guarantees the declared return type.
		return coerceTo(returnType, result)
	}
	Object.defineProperty(wrapped, '__glispTypedFn', { value: true })
	Object.defineProperty(wrapped, 'paramTypes', { value: paramTypes })
	Object.defineProperty(wrapped, 'returnType', { value: returnType })
	if (paramNames !== undefined) {
		Object.defineProperty(wrapped, 'paramNames', { value: paramNames })
	}
	if (variadicTail !== undefined) {
		Object.defineProperty(wrapped, 'variadicTail', { value: variadicTail })
	}
	if (variadicName !== undefined) {
		Object.defineProperty(wrapped, 'variadicName', { value: variadicName })
	}
	return wrapped as TypedHostFn
}

/**
 * Say which parameters of a host function can go unpassed, which then quietly take their
 * type's default, as `y?:` does in a function literal.
 */
export function withOptional<F extends TypedHostFn>(
	fn: F,
	names: ReadonlyArray<string>
): F {
	Object.defineProperty(fn, 'optional', { value: new Set(names) })
	return fn
}

/**
 * Let a host function see what its arguments were written as, which evaluating them does
 * not leave anything of, such as metadata on a value. `finish` goes over what it returned.
 */
export function withWritten<F extends TypedHostFn>(
	fn: F,
	finish: (value: unknown, args: ReadonlyArray<AST>) => unknown
): F {
	Object.defineProperty(fn, 'written', { value: finish })
	return fn
}

/**
 * What an expression comes to if it is written out whole, as `"round"` or `[4 2]`, which
 * takes only reading it. `undefined` if it would take running something.
 */
export function literalValue(ast: AST): unknown {
	switch (ast.kind) {
		case 'lit':
			return ast.value
		case 'meta':
			return literalValue(ast.expr)
		case 'vec': {
			const values = ast.elements.map(literalValue)
			return values.includes(undefined) ? undefined : values
		}
		case 'record': {
			const values: Record<string, unknown> = {}
			for (const field of ast.fields) {
				if ('kind' in field) return undefined
				const value = literalValue(field[1])
				if (value === undefined) return undefined
				values[field[0]] = value
			}
			return values
		}
		default:
			return undefined
	}
}

/**
 * Whether an argument can go in a slot. Its type says so, or else what is written does:
 * `"round"` is a `string`, which does not fit `(| "round" "butt")`, though it is one.
 */
export function argFits(
	arg: AST,
	inferred: TypeValue,
	expected: TypeValue
): boolean {
	if (typeFits(inferred, expected)) return true
	// What may be any of several is not known to be wrong while one of them would do, and
	// is checked when it arrives.
	const shape = unwrapLazy(inferred).shape
	if (shape.kind === 'union' && shape.members.some(t => typeFits(t, expected))) return true
	const value = literalValue(arg)
	return value !== undefined && expected.fits(value)
}

/** Give a host function a more precise static type, such as a generic one. */
export function withSignature<F extends TypedHostFn>(
	fn: F,
	signature: TypeValue
): F {
	Object.defineProperty(fn, 'signature', { value: signature })
	return fn
}

/**
 * Say how a host function works backward: what the argument at `index` would have
 * to be for the call to give `result`, the others staying as they are. `undefined`
 * if nothing would do.
 */
export type HostInverse = (
	index: number,
	result: unknown,
	args: readonly unknown[],
	context: InverseContext
) => unknown

/** In a value wanted of something, a part that can be whatever it comes to. */
export const UNSET: unique symbol = Symbol.for('glisp.unset') as never

export interface InverseContext {
	/**
	 * What to call a function with for it to give `result`, `current` being what it is
	 * called with now. Undefined if nothing would do. Only that argument changes.
	 */
	invert(fn: unknown, result: unknown, current: unknown): unknown
}

export function withInverse<F extends TypedHostFn>(
	fn: F,
	inverse: HostInverse
): F {
	Object.defineProperty(fn, 'inverse', { value: inverse })
	return fn
}

/** Say what goes with a type, so that `vec2.add` is there along with `p: vec2`. */
export function withMembers<T extends TypeValue>(
	type: T,
	members: Readonly<Record<string, unknown>>
): T {
	Object.defineProperty(type, 'members', { value: members })
	return type
}

/** Say what a call to a host function is, one level down the ladder. */
export function withExpansion<F extends TypedHostFn>(
	fn: F,
	expansion: HostExpansion
): F {
	Object.defineProperty(fn, 'expansion', { value: expansion })
	return fn
}

/**
 * Say what a host function does, and what to call it, for a function that no `^{doc}` or
 * `^{label}` can be written on.
 */
export function withDoc<F extends TypedHostFn>(fn: F, doc: string, label?: string): F {
	Object.defineProperty(fn, 'doc', { value: doc })
	if (label !== undefined) Object.defineProperty(fn, 'label', { value: label })
	return fn
}

export function isTypedHostFn(v: unknown): v is TypedHostFn {
	return (
		typeof v === 'function' &&
		(v as { __glispTypedFn?: true }).__glispTypedFn === true
	)
}

// -----------------------------------------------------------------------------
// Overload — multi-variant dispatch
// -----------------------------------------------------------------------------

/**
 * A multi-variant function value: a sequence of variants (typed host
 * fns or Glisp closures) where the first one whose declared parameter
 * types match the call's argument types is chosen. Created by the
 * `overload` special form. Dispatch walks the call's args through
 * `infer` + `typeFits` against each variant's declared param types in
 * order; the first match wins.
 */
export class OverloadValue {
	constructor(
		public readonly variants: ReadonlyArray<TypedHostFn | GlispClosure>
	) {}
}

/** Narrow `unknown` to `OverloadValue`. */
export function isOverload(v: unknown): v is OverloadValue {
	return v instanceof OverloadValue
}

// -----------------------------------------------------------------------------
// IO action — deferred effect
// -----------------------------------------------------------------------------

/**
 * A computed effect awaiting execution. Created by special forms like
 * `def` that mutate the env (or other side effects); a host runs them by
 * calling `.run()`. The REPL forces top-level IO actions automatically;
 * elsewhere they sit inert as `(IO ())`-typed values.
 *
 * `run` returns the diagnostics produced by the effect itself (e.g. a
 * name collision when binding) so the host can surface them.
 */
export class IO {
	constructor(
		public readonly description: string,
		public readonly run: () => ReadonlyArray<Diagnostic>
	) {}
}

/** Narrow `unknown` to `IO`. */
export function isIO(v: unknown): v is IO {
	return v instanceof IO
}

// Static type inference lives in infer.ts. Internally exposed via the
// `lookupBareName` helper below so infer can walk the same env chain.
export { lookupBareName }

// -----------------------------------------------------------------------------
// Type-value head: parametric apply, or a value of it made of what is given
// -----------------------------------------------------------------------------

/**
 * The type a name stands for when it is called, if it is bound to one that is written as a vector
 * or a record of types, `[number number]` or `{x: number}`, or as a union of them. What is written
 * of values, as `[1 2]`, is not one.
 */
export function writtenTypeOf(head: AST, env: Env): TypeValue | null {
	if (head.kind !== 'sym') return null
	const target = lookupBareName(head.name, env)
	if (target === null) return null
	const inner = target.ast.kind === 'meta' ? target.ast.expr : target.ast
	const parts =
		inner.kind === 'vec'
			? inner.elements
			: inner.kind === 'record'
				? inner.fields.map(field => ('kind' in field ? field : field[1]))
				: inner.kind === 'call' && inner.head.kind === 'sym' && (inner.head.name === '|' || inner.head.name === ':')
					? [inner]
					: null
	if (parts === null || parts.length === 0) return null
	const bare = (part: AST): AST => (part.kind === 'spread' ? bare(part.expr) : part.kind === 'meta' ? bare(part.expr) : part)
	if (parts.some(part => bare(part).kind === 'lit')) return null
	return resolveTypeSlot(head, env)
}

/**
 * `(T ...)` for a type that takes no types: a value of it, made of what is given. A tuple takes
 * its elements in order, a record its fields by name or in order, and any other type one value,
 * as `^T v` does. What is not given is its default, and what does not fit comes to it, with a
 * diagnostic. One argument that is a whole value of the type already is taken as it is.
 */
function construct(
	type: TypeValue,
	positional: ReadonlyArray<AST>,
	kwargs: ReadonlyMap<string, AST> | undefined,
	env: Env,
	site: AST,
	diagnostics: Diagnostic[]
): EvalResult {
	const values = positional.map(argAst => {
		const r = evaluate(argAst, env)
		push(diagnostics, r.diagnostics)
		return r.value
	})
	const named = new Map(
		[...(kwargs ?? [])].map(([key, argAst]) => {
			const r = evaluate(argAst, env)
			push(diagnostics, r.diagnostics)
			return [key, r.value] as const
		})
	)
	const fitted = (t: TypeValue, v: unknown, at: AST): unknown => {
		if (v === UNIT) return t.default
		if (t.fits(v)) return v
		diagnostics.push(diag(at, env, `${t.typeName} doesn't accept ${describeType(v)} value`))
		return t.default
	}
	if (values.length === 1 && named.size === 0 && type.fits(values[0])) {
		return { value: values[0], diagnostics }
	}

	const made = (t: TypeValue): unknown => {
		const { shape } = unwrapLazy(t)
		switch (shape.kind) {
			case 'refine':
				return fitted(t, made(shape.base), site)
			case 'tuple':
			case 'vector': {
				if (named.size > 0) diagnostics.push(diag(site, env, `${t.typeName} takes its elements in order`))
				const elements = shape.kind === 'tuple' ? shape.elements : []
				const rest = shape.kind === 'tuple' ? shape.rest : shape.element
				if (rest === undefined && values.length > elements.length) {
					diagnostics.push(diag(site, env, `${t.typeName} has ${elements.length} elements`))
				}
				const out = elements.map((element, i) =>
					i < values.length ? fitted(element, values[i], positional[i]!) : element.default
				)
				if (rest !== undefined) {
					for (let i = elements.length; i < values.length; i++) out.push(fitted(rest, values[i], positional[i]!))
				}
				return out
			}
			case 'record': {
				const keys = [...shape.fields.keys()]
				if (values.length > keys.length) diagnostics.push(diag(site, env, `${t.typeName} has ${keys.length} fields`))
				for (const key of named.keys()) {
					if (!shape.fields.has(key)) diagnostics.push(diag(kwargs!.get(key)!, env, `${t.typeName} has no field ${key}`))
				}
				const out: Record<string, unknown> = {}
				keys.forEach((key, i) => {
					const field = shape.fields.get(key)!
					const byName = named.has(key)
					if (!byName && i >= values.length) {
						// What can be left out is, and anything else is what it is at first
						if (!shape.optional.has(key)) out[key] = field.default
						return
					}
					out[key] = fitted(field, byName ? named.get(key) : values[i], byName ? kwargs!.get(key)! : positional[i]!)
				})
				return out
			}
			case 'function':
				diagnostics.push(diag(site, env, `${t.typeName} is made by writing a function, as (=> [x: number] x)`))
				return t.default
			default:
				if (values.length + named.size > 1) diagnostics.push(diag(site, env, `${t.typeName} takes one value`))
				return values.length === 0 ? t.default : fitted(t, values[0], positional[0]!)
		}
	}
	return { value: made(type), diagnostics }
}

function evalTypeApply(
	head: TypeValue,
	positional: ReadonlyArray<AST>,
	kwargs: ReadonlyMap<string, AST> | undefined,
	env: Env,
	site: AST,
	diagnostics: Diagnostic[]
): EvalResult {
	if (head.apply === undefined) return construct(head, positional, kwargs, env, site, diagnostics)
	const typeArgs: TypeValue[] = []
	for (const argAst of positional) {
		// An argument is a type slot, so that `[T U]` and `{x: T}` are types there.
		const asType = resolveTypeSlot(argAst, env)
		if (asType !== null) {
			typeArgs.push(asType)
			continue
		}
		const r = evaluate(argAst, env)
		push(diagnostics, r.diagnostics)
		if (!isTypeValue(r.value)) {
			diagnostics.push(
				diag(
					argAst,
					env,
					`type constructor ${head.typeName} expects type arguments`
				)
			)
			return { value: UNIT, diagnostics }
		}
		typeArgs.push(r.value)
	}
	if (kwargs && kwargs.size > 0) {
		diagnostics.push(
			diag(
				site,
				env,
				`type constructor ${head.typeName} does not accept keyword arguments`
			)
		)
	}
	const result = head.apply(typeArgs)
	if ('error' in result) {
		diagnostics.push(diag(site, env, result.error))
		return { value: UNIT, diagnostics }
	}
	return { value: result, diagnostics }
}

// -----------------------------------------------------------------------------
// Typed host fn dispatch (static check + cast)
// -----------------------------------------------------------------------------

function callTypedHostFn(
	fn: TypedHostFn,
	positional: ReadonlyArray<AST>,
	kwargs: ReadonlyMap<string, AST> | undefined,
	env: Env,
	site: AST,
	priorDiagnostics: ReadonlyArray<Diagnostic>
): EvalResult {
	const diagnostics = [...priorDiagnostics]
	const argValues: unknown[] = []

	// Resolve effective positional list by routing kwargs into named slots.
	// A typed host fn with no `paramNames` cannot accept kwargs.
	const effectivePositional: Array<AST | undefined> = positional.slice()
	if (kwargs && kwargs.size > 0) {
		if (fn.paramNames === undefined) {
			diagnostics.push(
				diag(
					site,
					env,
					'cannot pass keyword arguments to this host function (no parameter names)'
				)
			)
		} else {
			const names = fn.paramNames
			for (const [name, ast] of kwargs) {
				const idx = names.indexOf(name)
				if (idx === -1) {
					diagnostics.push(
						diag(site, env, `unknown keyword argument: ${name}`)
					)
					continue
				}
				if (effectivePositional[idx] !== undefined) {
					diagnostics.push(
						diag(site, env, `double binding of parameter ${name}`)
					)
				}
				effectivePositional[idx] = ast
			}
		}
	}

	const totalSlots =
		fn.variadicTail !== undefined
			? Math.max(fn.paramTypes.length, effectivePositional.length)
			: fn.paramTypes.length

	for (let i = 0; i < totalSlots; i++) {
		const paramType =
			i < fn.paramTypes.length ? fn.paramTypes[i]! : fn.variadicTail!
		const argAst = effectivePositional[i]

		// Missing required argument → diagnostic + paramType.default
		if (argAst === undefined) {
			const name = fn.paramNames?.[i]
			if (name !== undefined && fn.optional?.has(name)) {
				argValues.push(paramType.default)
				continue
			}
			diagnostics.push(
				diag(
					site,
					env,
					`missing argument for parameter ${i + 1} (expected ${paramType.typeName})`
				)
			)
			argValues.push(paramType.default)
			continue
		}

		// Static type check — a confirmed mismatch lets us skip evaluation
		// of the argument entirely and substitute the default. `typeFits`
		// handles top, function-structural compat, and primitive identity
		// uniformly.
		const inferred = infer(argAst, env)
		if (inferred !== null && !argFits(argAst, inferred, paramType)) {
			diagnostics.push(
				diag(
					argAst,
					env,
					`type mismatch: expected ${paramType.typeName}, got ${inferred.typeName}`
				)
			)
			argValues.push(paramType.default)
			continue
		}

		// Type compatible (or unknown) — evaluate, then runtime-cast.
		const r = evaluate(argAst, env)
		push(diagnostics, r.diagnostics)
		const v = r.value
		if (v !== UNIT && !paramType.fits(v)) {
			diagnostics.push(
				diag(
					argAst,
					env,
					`type mismatch at runtime: expected ${paramType.typeName}, got ${describeType(v)}`
				)
			)
		}
		argValues.push(coerceTo(paramType, v))
	}

	if (
		fn.variadicTail === undefined &&
		positional.length > fn.paramTypes.length
	) {
		diagnostics.push(
			diag(
				site,
				env,
				`too many positional arguments: expected ${fn.paramTypes.length}, got ${positional.length}`
			)
		)
	}

	try {
		const { value, diagnostics: bubbled } = withJSCallSink(() =>
			fn(...argValues)
		)
		for (const d of bubbled) diagnostics.push(d)
		return { value: fn.written?.(value, positional) ?? value, diagnostics }
	} catch (e) {
		if (mustUnwind(e)) throw e
		const message = e instanceof Error ? e.message : String(e)
		diagnostics.push(diag(site, env, `host function threw: ${message}`))
		return { value: UNIT, diagnostics }
	}
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// Memoization (global singleton)
// -----------------------------------------------------------------------------

type MemoState =
	| { readonly kind: 'in-progress' }
	| { readonly kind: 'computed'; readonly result: EvalResult }

/**
 * Single, module-level memo cache shared across every `evaluate` call.
 *
 * Rationale: the cache key `(AST instance, Env instance)` is identity-based,
 * so two evaluations sharing the same AST and Env produce the same result —
 * sharing one cache lets repeated work hit. Both levels are `WeakMap`s: a
 * long-lived AST (a shared subtree, a closure body) must not keep every env
 * it was ever evaluated in alive, and through `frame.ast` the old roots those
 * envs belong to. `Env` may be `null` (the root sentinel), which a `WeakMap`
 * cannot key, so `null` maps to `ROOT_ENV_KEY`.
 */
const memo: WeakMap<AST, WeakMap<object, MemoState>> = new WeakMap()
const ROOT_ENV_KEY = {}

function lookupMemo(ast: AST, env: Env): MemoState | undefined {
	return memo.get(ast)?.get(env ?? ROOT_ENV_KEY)
}

function storeMemo(ast: AST, env: Env, state: MemoState): void {
	let inner = memo.get(ast)
	if (inner === undefined) {
		inner = new WeakMap()
		memo.set(ast, inner)
	}
	inner.set(env ?? ROOT_ENV_KEY, state)
}

/**
 * Evaluate `ast` against `env`. Never throws on user errors. Returns
 * `{ value, diagnostics }`: `value` is the evaluated JS value (or the
 * spec-defined fallback when something fails — usually `()` or the
 * relevant type's `default`), and `diagnostics` collects every
 * mismatch / lookup failure / arity error encountered along the way.
 *
 * Hosts that want strict behavior should treat any non-empty
 * diagnostics as a failure. Hosts that want best-effort rendering
 * (an editor mid-edit) can keep using `value` and surface the
 * diagnostics in a separate channel.
 */
export function evaluate(ast: AST, env: Env): EvalResult {
	if (activeStore === null && evaluationDepth === 0) {
		const owner = ownerOf(env)
		if (owner !== null) return withEvalStore(owner, () => evaluate(ast, env))
	}
	// `%` desugaring runs before any further work. The pass is cached
	// per-AST so repeated evaluations of the same source pay only once.
	const desugared = desugar(ast)
	const cached = lookupMemo(desugared, env)
	if (cached !== undefined) {
		if (cached.kind === 'in-progress') {
			return fail(desugared, env, 'cycle detected')
		}
		activeStore?.touch(desugared, env)
		return cached.result
	}
	storeMemo(desugared, env, { kind: 'in-progress' })
	if (evaluationDepth === 0) workDone = 0
	if (++workDone > MAX_WORK) throw new TooMuchWork()
	evaluationDepth++
	try {
		const result =
			activeStore === null
				? evaluateInner(desugared, env)
				: activeStore.memoize(desugared, env, () =>
						evaluateInner(desugared, env)
					)
		storeMemo(desugared, env, { kind: 'computed', result })
		return result
	} catch (e) {
		// Unwinding: this evaluation did not finish, so it must not look like a
		// cycle later. Only the outermost call has the stack left to report it.
		memo.get(desugared)?.delete(env ?? ROOT_ENV_KEY)
		if (evaluationDepth === 1 && e instanceof TooMuchWork) {
			// Worth keeping, as finding this out again is what took so long.
			const result = fail(desugared, env, 'too much to work out')
			storeMemo(desugared, env, { kind: 'computed', result })
			return result
		}
		if (evaluationDepth === 1 && isStackOverflow(e)) {
			return fail(desugared, env, 'recursion too deep')
		}
		throw e
	} finally {
		evaluationDepth--
	}
}

let evaluationDepth = 0

/**
 * A stack overflow says nothing about the code that happened to hit it, and
 * where it hits depends on how deep the caller already was. So it must unwind
 * all the way out rather than become that code's result.
 */
function isStackOverflow(e: unknown): boolean {
	return e instanceof Error && /call stack|too much recursion/i.test(e.message)
}

/**
 * What one outermost evaluation may work out. A recursion that branches can go on for
 * longer than anyone can wait without ever getting deep, and evaluation is what a host
 * is waiting on. It is counted, and not timed, so that a program always comes to the same.
 */
const MAX_WORK = 2_000_000
let workDone = 0

class TooMuchWork extends Error {}

/** What says nothing about the code it happened in, so has to get all the way out. */
const mustUnwind = (e: unknown): boolean => e instanceof TooMuchWork || isStackOverflow(e)

/**
 * A cache that outlives env frames, supplied by `Runtime`. `evaluate` memoizes
 * on `(AST, Env)` identity on its own; this is what lets a result survive an
 * edit, which replaces the frames.
 */
export interface EvalStore {
	memoize(ast: AST, env: Env, compute: () => EvalResult): EvalResult
	/** A cached `(AST, Env)` result was used without going through `memoize`. */
	touch(ast: AST, env: Env): void
}

let activeStore: EvalStore | null = null

const envOwners: WeakMap<object, EvalStore> = new WeakMap()

/**
 * Have `store` back whatever is evaluated in `frame`, or in a frame made on top
 * of it, however it comes to be evaluated: a host reading a program should not
 * have to say which cache it means.
 */
export function ownFrame(frame: object, store: EvalStore): void {
	envOwners.set(frame, store)
}

function ownerOf(env: Env): EvalStore | null {
	for (let frame = env; frame !== null; frame = frame.parent) {
		const owner = envOwners.get(frame)
		if (owner !== undefined) return owner
	}
	return null
}

/** Run `fn` with `store` backing every `evaluate` call it makes. */
export function withEvalStore<T>(store: EvalStore, fn: () => T): T {
	const previous = activeStore
	activeStore = store
	try {
		return fn()
	} finally {
		activeStore = previous
	}
}

function evaluateInner(ast: AST, env: Env): EvalResult {
	switch (ast.kind) {
		case 'lit':
			return ok(ast.value)

		case 'host':
			return ok(ast.value)

		case 'sym': {
			const target = lookupBareName(ast.name, env)
			if (target === null) {
				return fail(ast, env, `unresolvable name: ${ast.name}`)
			}
			const r = evaluate(target.ast, target.env)
			// If the binding has a declared type (e.g. closure parameter
			// with `x: number`), cast the resolved value through that
			// type — `fits` → return as-is, otherwise fall back to the
			// type's default with a runtime diagnostic.
			if (target.type !== undefined && isTypeValue(target.type)) {
				const t = target.type
				if (r.value !== UNIT && !t.fits(r.value)) {
					const diagnostics = [
						...r.diagnostics,
						diag(
							ast,
							env,
							`type mismatch at runtime: expected ${t.typeName}, got ${describeType(r.value)}`
						),
					]
					return { value: t.default, diagnostics }
				}
				return { value: coerceTo(t, r.value), diagnostics: r.diagnostics }
			}
			return r
		}

		case 'vec': {
			// Push a transparent frame so paths inside elements (`./0`,
			// `./1`, …) can navigate to siblings via the AST chain.
			const inside = enterNode(ast, env)
			const { values, diagnostics } = evalListElements(
				ast.elements,
				inside
			)
			return { value: values, diagnostics }
		}

		case 'record': {
			const inside = pushAncestor(ast, env)
			const result: Record<string, unknown> = {}
			const diagnostics: Diagnostic[] = []
			for (const entry of ast.fields) {
				if (entry instanceof SpreadAST) {
					const r = evaluate(entry.expr, inside)
					push(diagnostics, r.diagnostics)
					if (isPlainRecord(r.value)) {
						Object.assign(result, r.value)
					} else {
						diagnostics.push(
							diag(entry, inside, 'record spread operand must be a record')
						)
					}
				} else {
					const [name, value] = entry
					const r = evaluate(value, inside)
					result[name] = r.value
					push(diagnostics, r.diagnostics)
				}
			}
			return { value: result, diagnostics }
		}

		case 'let': {
			const frame = pushLetFrame(ast, env)
			if (ast.body !== null) return evaluate(ast.body, frame)
			// With nothing after its bindings, it comes to the last of them.
			const last = ast.bindings.at(-1)
			if (last === undefined) return ok(UNIT)
			const target = frame!.bindings!.get(last[0])!
			return evaluate(target.ast, target.env)
		}

		case 'access': {
			const targetResult = evaluate(ast.target, env)
			const diagnostics = [...targetResult.diagnostics]
			const value = targetResult.value
			if (isTypeValue(value) && typeof ast.key === 'string') {
				const got = value.members?.[ast.key]
				if (got === undefined) {
					diagnostics.push(
						diag(ast, env, `${value.typeName} has no member: ${ast.key}`)
					)
					return { value: UNIT, diagnostics }
				}
				return { value: got, diagnostics }
			}
			if (Array.isArray(value) && typeof ast.key === 'number') {
				const got = value[ast.key]
				if (got === undefined) {
					diagnostics.push(
						diag(ast, env, `vector index out of bounds: ${ast.key}`)
					)
					return { value: UNIT, diagnostics }
				}
				return { value: got, diagnostics }
			}
			if (isPlainRecord(value) && typeof ast.key === 'string') {
				const got = (value as Record<string, unknown>)[ast.key]
				if (got === undefined) {
					diagnostics.push(
						diag(ast, env, `record field not found: ${ast.key}`)
					)
					return { value: UNIT, diagnostics }
				}
				return { value: got, diagnostics }
			}
			diagnostics.push(
				diag(
					ast,
					env,
					`cannot access ${typeof ast.key === 'number' ? 'index' : 'field'} ${
						JSON.stringify(ast.key)
					} on ${describeType(value)}`
				)
			)
			return { value: UNIT, diagnostics }
		}

		case 'fn':
			return ok(makeClosure(ast, env))

		case 'call':
			return evalCall(ast, env)

		case 'path':
			return evalPath(ast.segments, env, ast)

		// `~` only decides where the rungs of the ladder fall, so it is
		// transparent to both the value and path navigation.
		case 'unquote':
			return evaluate(ast.expr, env)

		case 'spread':
			// A bare spread used outside a list-building context has no value.
			return fail(ast, env, 'spread used outside a list-building context')

		case 'meta': {
			// A parallel layer, of which evaluation reads only `#_`, which comes to
			// nothing where it stands, and a type's `default`.
			if (ast.metadata.get(HIDDEN) !== undefined) {
				return { value: UNIT, diagnostics: [] }
			}
			// What is said of a type is said of it as a value, not of the values it holds, which
			// `(: T ...)` is for. A `default` is what nothing comes to.
			const result = evaluate(ast.expr, env)
			const field = ast.metadata.get('default')
			if (result.value !== UNIT || field === undefined) return result
			const fallback = evaluate(field, enterNode(ast.metadata, env))
			return { value: fallback.value, diagnostics: [...result.diagnostics, ...fallback.diagnostics] }
		}
	}
}

// -----------------------------------------------------------------------------
// Env helpers
// -----------------------------------------------------------------------------

/** The empty (root) environment. Pass this to `evaluate` when no
 * bindings are in scope — typically for self-contained literal /
 * arithmetic expressions in tests or doc examples. */
export const emptyEnv: Env = null

/**
 * Build a fresh top-level environment from a `{ name: ast }` record.
 * Each binding is stored as an unevaluated AST + the new frame, so:
 *   - bindings are evaluated lazily on first lookup,
 *   - bindings may reference each other in any order (self-referential),
 *   - and the standard memoization (see eval.md — Cycle detection)
 *     applies.
 *
 * Use this to seed an env with host-provided values; for the standard
 * Glisp prelude, see `prelude.ts`.
 */
export function makeTopLevel(
	bindings: Readonly<Record<string, AST>>
): Env {
	const map = new Map<string, BindingTarget>()
	const frame: Frame = {
		ast: { kind: 'lit', value: UNIT } as AST,
		parent: null,
		bindings: map,
	}
	for (const [name, ast] of Object.entries(bindings)) {
		map.set(name, { ast, env: frame })
	}
	return frame
}

function lookupBareName(name: string, env: Env): BindingTarget | null {
	let frame = env
	while (frame !== null) {
		const target = frame.bindings?.get(name)
		if (target !== undefined) return target
		frame = frame.parent
	}
	return null
}

export function pushLetFrame(ast: AST & { bindings: ReadonlyArray<readonly [string, AST]> }, parent: Env): Env {
	const map = new Map<string, BindingTarget>()
	const frame: Frame = {
		ast,
		parent,
		bindings: map,
	}
	for (const [name, valueAST] of ast.bindings) {
		// self-referential: each binding is evaluated in the frame that
		// already contains all its sibling bindings.
		map.set(name, { ast: readByName(valueAST), env: frame })
	}
	return frame
}

const readByNameMemo: WeakMap<AST, AST> = new WeakMap()

/**
 * What a reference reads of `ast`: `#_` bypasses an expression where it stands, and
 * not for what refers to it. The same node each time, so that it can be cached.
 */
export function readByName(ast: AST): AST {
	if (ast.kind !== 'meta' || ast.metadata.get(HIDDEN) === undefined) return ast
	const known = readByNameMemo.get(ast)
	if (known !== undefined) return known
	const others = ast.metadata.fields.filter(f => 'kind' in f || f[0] !== HIDDEN)
	const read =
		others.length === 0
			? ast.expr
			: new MetaASTClass(new RecordASTClass(others, ast.metadata.optional), ast.expr)
	readByNameMemo.set(ast, read)
	return read
}

/**
 * Push an ancestor frame onto `env` whose `ast` is `node`, so that paths inside calls, vectors
 * and records can navigate. It binds the names of what is directly in it, as a let-block does
 * its bindings, and has no bindings if nothing there has a name: bare-name lookup walks straight
 * through it. See syntax.md (Names).
 */
function pushAncestor(node: AST, env: Env): Env {
	const children = namedChildrenOf(node)
	if (children.length === 0) return { ast: node, parent: env }
	const map = new Map<string, BindingTarget>()
	const frame: Frame = { ast: node, parent: env, bindings: map }
	// The last of those with the same name is what it means, as in a let-block.
	for (const [name, child] of children) map.set(name, { ast: readByName(child), env: frame })
	return frame
}

const namedChildrenMemo: WeakMap<AST, ReadonlyArray<readonly [string, AST]>> = new WeakMap()

/**
 * What directly in `node` has a name, with it, in the order written: the elements of a vector,
 * the arguments of a call and the fields of a record. A let-block's are its bindings.
 */
export function namedChildrenOf(node: AST): ReadonlyArray<readonly [string, AST]> {
	if (node.kind === 'let') return node.bindings
	const known = namedChildrenMemo.get(node)
	if (known !== undefined) return known
	const children: AST[] =
		node.kind === 'vec'
			? [...node.elements]
			: node.kind === 'call'
				? [...node.args, ...(node.kwargs?.values() ?? [])]
				: node.kind === 'record'
					? node.fields.flatMap(field => ('kind' in field ? [] : [field[1]]))
					: []
	const named = children.flatMap((child): (readonly [string, AST])[] => {
		const name = nameOf(child)
		return name === null ? [] : [[name, child]]
	})
	namedChildrenMemo.set(node, named)
	return named
}

// -----------------------------------------------------------------------------
// Spread-aware list-element evaluation
// -----------------------------------------------------------------------------

function evalListElements(
	elements: ReadonlyArray<AST>,
	env: Env
): { values: unknown[]; diagnostics: Diagnostic[] } {
	const values: unknown[] = []
	const diagnostics: Diagnostic[] = []
	for (const elem of elements) {
		if (elem instanceof SpreadAST) {
			const r = evaluate(elem.expr, env)
			push(diagnostics, r.diagnostics)
			if (Array.isArray(r.value)) {
				for (const v of r.value as unknown[]) values.push(v)
			} else {
				diagnostics.push(diag(elem, env, 'spread operand must be a vector'))
			}
		} else {
			const r = evaluate(elem, env)
			values.push(r.value)
			push(diagnostics, r.diagnostics)
		}
	}
	return { values, diagnostics }
}

// -----------------------------------------------------------------------------
// call
// -----------------------------------------------------------------------------

function evalCall(ast: CallAST, env: Env): EvalResult {
	// Push a transparent ancestor frame so paths inside the call's head
	// or args can navigate using `./N` (head=0, args=1..) and `..` to
	// the surrounding scope. The frame is bindings-less, so bare-name
	// lookup walks straight through it.
	const inside = pushAncestor(ast, env)

	// Special forms — dispatched by head's symbol name.
	if (ast.head.kind === 'sym') {
		switch (ast.head.name) {
			case '?':
				return evalMatch(ast, inside)
			case '|>':
				return evalPipe(ast, inside)
			case '^':
				return evalCoerce(ast, inside)
			case ':':
				return evalDerive(ast, inside)
			case 'overload':
				return evalOverload(ast, inside)
		}
	}

	const headResult = evaluate(ast.head, inside)
	const diagnostics = [...headResult.diagnostics]
	const headValue = headResult.value

	// Expand spread elements in positional args (yields a flat AST list).
	const expanded = expandPositionalArgs(ast.args, inside)
	push(diagnostics, expanded.diagnostics)
	const positional = expanded.asts
	const kwargs = ast.kwargs

	// Glisp closure → push body frame, bind params lazily.
	if (isGlispClosure(headValue)) {
		return applyClosure(
			headValue,
			positional,
			kwargs,
			inside,
			ast,
			diagnostics
		)
	}

	// Overload → pick the first variant whose declared param types fit
	// the inferred arg types, then dispatch to it.
	if (isOverload(headValue)) {
		return dispatchOverload(
			headValue,
			positional,
			kwargs,
			inside,
			ast,
			diagnostics
		)
	}

	// Type values: check before record fall-through (a TypeValue is a
	// branded plain object). Parametric types dispatch through `apply`;
	// non-parametric ones reject with a hint to use `^T v`.
	if (isTypeValue(headValue)) {
		return evalTypeApply(headValue, positional, kwargs, inside, ast, diagnostics)
	}
	// A vector or a record of types is a type, as where a type is wanted, and makes a value of it
	const written = writtenTypeOf(ast.head, inside)
	if (written !== null) {
		// What it is bound to is a type, and not a value that would fail to be worked out as one
		diagnostics.splice(0, headResult.diagnostics.length)
		return construct(written, positional, kwargs, inside, ast, diagnostics)
	}

	// Vector → element access by integer index.
	if (Array.isArray(headValue)) {
		if (positional.length !== 1) {
			diagnostics.push(diag(ast, inside, 'vector access expects one index'))
			return { value: UNIT, diagnostics }
		}
		const idxR = evaluate(positional[0]!, inside)
		push(diagnostics, idxR.diagnostics)
		const idx = idxR.value
		if (typeof idx !== 'number') {
			diagnostics.push(diag(ast, inside, 'vector index must be a number'))
			return { value: UNIT, diagnostics }
		}
		const got = headValue[idx]
		if (got === undefined) {
			diagnostics.push(
				diag(ast, inside, `vector index out of bounds: ${idx}`)
			)
			return { value: UNIT, diagnostics }
		}
		return { value: got, diagnostics }
	}

	// Record → field access by string key.
	if (isPlainRecord(headValue)) {
		if (positional.length !== 1) {
			diagnostics.push(diag(ast, inside, 'record access expects one key'))
			return { value: UNIT, diagnostics }
		}
		const keyR = evaluate(positional[0]!, inside)
		push(diagnostics, keyR.diagnostics)
		const key = keyR.value
		if (typeof key !== 'string') {
			diagnostics.push(diag(ast, inside, 'record key must be a string'))
			return { value: UNIT, diagnostics }
		}
		const got = (headValue as Record<string, unknown>)[key]
		if (got === undefined) {
			diagnostics.push(diag(ast, inside, `record field not found: ${key}`))
			return { value: UNIT, diagnostics }
		}
		return { value: got, diagnostics }
	}

	// Typed host function — per-arg static type check + cast.
	if (isTypedHostFn(headValue)) {
		return callTypedHostFn(
			headValue,
			positional,
			kwargs,
			inside,
			ast,
			diagnostics
		)
	}

	// Untyped host function — eval all positional args strictly.
	if (typeof headValue === 'function') {
		const argValues: unknown[] = []
		for (const argAst of positional) {
			const r = evaluate(argAst, inside)
			argValues.push(r.value)
			push(diagnostics, r.diagnostics)
		}
		if (kwargs && kwargs.size > 0) {
			diagnostics.push(
				diag(ast, inside, 'cannot pass keyword arguments to a host function')
			)
		}
		try {
			const { value, diagnostics: bubbled } = withJSCallSink(() =>
				(headValue as (...args: unknown[]) => unknown)(...argValues)
			)
			for (const d of bubbled) diagnostics.push(d)
			return { value, diagnostics }
		} catch (e) {
			if (mustUnwind(e)) throw e
			const message = e instanceof Error ? e.message : String(e)
			diagnostics.push(diag(ast, inside, `host function threw: ${message}`))
			return { value: UNIT, diagnostics }
		}
	}

	diagnostics.push(
		diag(ast, inside, `cannot call ${describeType(headValue)}`)
	)
	return { value: UNIT, diagnostics }
}

/**
 * Build the env in which a closure's parameter / return type expressions
 * are evaluated. Equal to `closure.capturedEnv` for non-generic functions;
 * for generic ones, layered with a frame binding each generic name to the
 * `TypeValue` inferred from the corresponding argument.
 *
 * Inference is shallow: only param.type that is a bare `sym(T)` where T is
 * a generic name participates. The first concrete inference wins; later
 * occurrences must agree (=== identity), otherwise a diagnostic.
 */
function resolveGenerics(
	fnAst: FnAST,
	positional: ReadonlyArray<AST>,
	kwargs: ReadonlyMap<string, AST> | undefined,
	callerEnv: Env,
	capturedEnv: Env,
	diagnostics: Diagnostic[]
): Env {
	if (fnAst.generics.length === 0) return capturedEnv
	return solveClosureGenerics(
		fnAst,
		capturedEnv,
		positional,
		kwargs,
		callerEnv,
		(name, earlier, here, arg) => {
			diagnostics.push(
				diag(
					arg,
					callerEnv,
					`generic ${name} resolved to ${earlier.typeName} earlier but argument here is ${here.typeName}`
				)
			)
		}
	)
}

/**
 * Expand `...spread` entries in a call's positional arguments to a flat
 * AST list. A spread whose operand is a `VecAST` is inlined directly (lazy);
 * otherwise the operand is evaluated and primitive elements are wrapped as
 * literals (best-effort reify).
 */
function expandPositionalArgs(
	args: ReadonlyArray<AST>,
	env: Env
): { asts: AST[]; diagnostics: Diagnostic[] } {
	const asts: AST[] = []
	const diagnostics: Diagnostic[] = []
	for (const arg of args) {
		if (!(arg instanceof SpreadAST)) {
			asts.push(arg)
			continue
		}
		// Direct vec literal — inline elements without forcing.
		if (arg.expr.kind === 'vec') {
			for (const e of arg.expr.elements) asts.push(e)
			continue
		}
		// Otherwise eval and wrap primitives.
		const r = evaluate(arg.expr, env)
		push(diagnostics, r.diagnostics)
		if (!Array.isArray(r.value)) {
			diagnostics.push(diag(arg, env, 'spread operand must be a vector'))
			continue
		}
		for (const v of r.value as unknown[]) {
			asts.push(reifyPrimitive(v))
		}
	}
	return { asts, diagnostics }
}

function reifyPrimitive(v: unknown): AST {
	if (
		typeof v === 'number' ||
		typeof v === 'string' ||
		typeof v === 'boolean' ||
		v === UNIT
	) {
		return { kind: 'lit', value: v as never } as never
	}
	// non-primitive values can't be losslessly wrapped as a single literal
	// without a fuller toAst implementation. For now, fall back to a sentinel
	// that will produce a diagnostic if forced.
	return { kind: 'sym', name: '#non-reifiable-value#' } as never
}

/**
 * Bind positional args + kwargs to a closure's parameters and evaluate
 * the body. Honors variadic / optional flags per syntax.md.
 */
function applyClosure(
	closure: GlispClosure,
	positional: ReadonlyArray<AST>,
	kwargs: ReadonlyMap<string, AST> | undefined,
	callerEnv: Env,
	site: AST,
	priorDiagnostics: ReadonlyArray<Diagnostic>
): EvalResult {
	const fnAst = closure.ast
	const diagnostics = [...priorDiagnostics]

	if (fnAst.body === null) {
		diagnostics.push(
			diag(site, callerEnv, 'cannot call a function-type expression (no body)')
		)
		return { value: UNIT, diagnostics }
	}

	// Resolve generic parameters from arg types via shallow unification:
	// param.type that is a bare sym matching a generic name is bound to
	// `infer(argAst, callerEnv)`. Repeated occurrences must agree; a
	// conflict raises a diagnostic and the first binding wins.
	//
	// Anything more elaborate (nested type constructors, return-position
	// constraints, default fallback when inference fails) is intentionally
	// out of scope for this pass — generics here are a "shape match the
	// obvious thing" mechanism, not a full HM-style solver.
	const typeEvalEnv = resolveGenerics(
		fnAst,
		positional,
		kwargs,
		callerEnv,
		closure.capturedEnv,
		diagnostics
	)

	// Generics live in the body frame, so whether they resolved does not
	// change how many levels a path in the body has to climb.
	const map = new Map<string, BindingTarget>(
		typeEvalEnv === closure.capturedEnv ? [] : typeEvalEnv?.bindings ?? []
	)
	let posIdx = 0

	// Pre-evaluate each parameter's declared type in the type-eval env
	// (closure's captured env, optionally extended with resolved generics).
	// When the expression evaluates to a `TypeValue`, it drives both
	// static checking at the call site and lazy cast-on-force at the use
	// site. Otherwise the slot is untyped — a type expression that fails
	// to resolve degrades silently rather than noising up the call's
	// diagnostics, since the user already sees an error wherever the
	// type itself is referenced.
	const paramTypes: Array<TypeValue | null> = []
	for (const param of fnAst.params) {
		const type = paramTypeOf(param, typeEvalEnv)
		// `_` (top) is a no-op cast, so skip it.
		paramTypes.push(type !== null && type.typeName !== '_' ? type : null)
	}

	const bindParam = (
		name: string,
		argAst: AST,
		argEnv: Env,
		paramType: TypeValue | null
	): void => {
		if (paramType === null) {
			map.set(name, { ast: argAst, env: argEnv })
			return
		}
		// Static type check — a confirmed mismatch lets us skip evaluation
		// of the argument entirely and substitute the type's default.
		const inferred = infer(argAst, argEnv)
		if (inferred !== null && !argFits(argAst, inferred, paramType)) {
			diagnostics.push(
				diag(
					argAst,
					argEnv,
					`type mismatch: expected ${paramType.typeName}, got ${inferred.typeName}`
				)
			)
			map.set(name, {
				ast: new LitASTClass(paramType.default as never),
				env: null,
			})
			return
		}
		// Compatible (or unknown) → bind lazily, cast at force time.
		map.set(name, { ast: argAst, env: argEnv, type: paramType })
	}

	for (let i = 0; i < fnAst.params.length; i++) {
		const param = fnAst.params[i]!
		const paramType = paramTypes[i]!

		if (param.variadic) {
			const kwargAst = kwargs?.get(param.name)
			if (kwargAst !== undefined && posIdx < positional.length) {
				diagnostics.push(
					diag(
						site,
						callerEnv,
						`double binding of variadic parameter ${param.name}`
					)
				)
			}
			let restAst: AST
			if (kwargAst !== undefined) {
				restAst = kwargAst
				posIdx = positional.length
			} else {
				restAst = {
					kind: 'vec',
					elements: positional.slice(posIdx),
				} as never
				posIdx = positional.length
			}
			// Variadic param's declared type is the element type; the
			// binding itself is a vector of those. Skip lazy-cast for now
			// (would require per-element rewriting) — bind untyped.
			map.set(param.name, { ast: restAst, env: callerEnv })
			continue
		}

		// non-variadic
		if (posIdx < positional.length) {
			if (kwargs?.has(param.name)) {
				diagnostics.push(
					diag(site, callerEnv, `double binding of parameter ${param.name}`)
				)
			}
			bindParam(param.name, positional[posIdx]!, callerEnv, paramType)
			posIdx++
			continue
		}

		const kwargAst = kwargs?.get(param.name)
		if (kwargAst !== undefined) {
			bindParam(param.name, kwargAst, callerEnv, paramType)
			continue
		}

		if (param.optional || isOmittable(paramType)) {
			// Optional missing → bind to the param type's default (silent
			// fallback), which for `(| T unit)` is T's. With no declared type, UNIT.
			const defaultValue = paramType !== null ? paramType.default : UNIT
			map.set(param.name, {
				ast: new LitASTClass(defaultValue as never),
				env: null,
			})
			continue
		}

		diagnostics.push(
			diag(
				site,
				callerEnv,
				paramType !== null
					? `missing required parameter ${param.name} (expected ${paramType.typeName})`
					: `missing required parameter: ${param.name}`
			)
		)
		const defaultValue = paramType !== null ? paramType.default : UNIT
		map.set(param.name, {
			ast: new LitASTClass(defaultValue as never),
			env: null,
		})
	}

	if (posIdx < positional.length) {
		diagnostics.push(diag(site, callerEnv, 'too many positional arguments'))
	}

	if (kwargs) {
		const paramNames = new Set(fnAst.params.map(p => p.name))
		for (const k of kwargs.keys()) {
			if (!paramNames.has(k)) {
				diagnostics.push(
					diag(site, callerEnv, `unknown keyword argument: ${k}`)
				)
			}
		}
	}

	const bodyFrame: Frame = {
		ast: fnAst,
		parent: closure.capturedEnv,
		bindings: map,
	}
	const r = evaluate(fnAst.body, bodyFrame)
	push(diagnostics, r.diagnostics)

	// Cast the return value through the declared return type — symmetric
	// with parameter binding. `_` is the top type, treated as a no-op.
	// As with parameter types, an unresolvable return type expression
	// degrades silently to "no return cast."
	const rt = resolveTypeSlot(fnAst.returnType, typeEvalEnv)
	if (rt !== null && rt.typeName !== '_') {
		if (r.value !== UNIT && !rt.fits(r.value)) {
			diagnostics.push(
				diag(
					fnAst.body,
					callerEnv,
					`return type mismatch: expected ${rt.typeName}, got ${describeType(r.value)}`
				)
			)
			return { value: rt.default, diagnostics }
		}
		return { value: coerceTo(rt, r.value), diagnostics }
	}
	return { value: r.value, diagnostics }
}

// -----------------------------------------------------------------------------
// Special forms: ? (match), |> (pipe)
// -----------------------------------------------------------------------------

function evalMatch(ast: CallAST, env: Env): EvalResult {
	// (? value pat1 res1 pat2 res2 ...)
	if (ast.args.length === 0) {
		return fail(ast, env, '? requires a value')
	}
	if (ast.args.length % 2 !== 1) {
		return fail(ast, env, '? requires odd number of args (value + clause pairs)')
	}

	const valueResult = evaluate(ast.args[0]!, env)
	const value = valueResult.value
	const diagnostics = [...valueResult.diagnostics]

	for (let i = 1; i < ast.args.length; i += 2) {
		const patAst = ast.args[i]!
		const resAst = ast.args[i + 1]!

		// `_` in pattern position = catch-all (top type).
		if (patAst.kind === 'sym' && patAst.name === '_') {
			const r = evaluate(resAst, env)
			return { value: r.value, diagnostics: [...diagnostics, ...r.diagnostics] }
		}

		const patResult = evaluate(patAst, env)
		push(diagnostics, patResult.diagnostics)
		if (matchValue(value, patResult.value)) {
			const r = evaluate(resAst, env)
			return { value: r.value, diagnostics: [...diagnostics, ...r.diagnostics] }
		}
	}
	// no clause matched → unit (per spec)
	return { value: UNIT, diagnostics }
}

export function matchValue(value: unknown, pattern: unknown): boolean {
	// If the pattern is a type value, use its `fits` predicate (non-fallback
	// type test) — this is the spec's "pattern is a type → cast succeeds"
	// branch without actually consuming the cast's default fallback.
	if (isTypeValue(pattern)) {
		return pattern.fits(value)
	}
	// Otherwise: structural equality.
	return value === pattern
}

/**
 * `(: T key: value ... pred ...)`: the values of `T` that meet each `pred`, with what is said of
 * them. What a key says is what it comes to, written as a literal, so that it can be read without
 * evaluating anything; `default` is what the type gives where what is wanted does not fit, and
 * has to be one of its values. `(: T)` is `T`.
 */
function evalDerive(ast: CallAST, env: Env): EvalResult {
	const [baseAst] = ast.args
	if (baseAst === undefined) return fail(ast, env, '(: T ...) is of a type, as in (: number min: 0)')
	const base = resolveTypeSlot(baseAst, env)
	if (base === null) {
		return fail(baseAst, env, `(: T ...): ${describeType(evaluate(baseAst, env).value)} is not a type`)
	}
	const { type, diagnostics } = derivedFrom(base, ast, env)
	return { value: type, diagnostics }
}

/**
 * `base`, as `(: T ...)` makes a type of it: narrowed by what is after `T`, with what its keys
 * say. Apart from where `T` is read, so that a type that refers to itself can be read as one.
 */
export function derivedFrom(
	base: TypeValue,
	ast: CallAST,
	env: Env
): { type: TypeValue; diagnostics: readonly Diagnostic[] } {
	const diagnostics: Diagnostic[] = []
	const preds: Array<(v: unknown) => unknown> = []
	for (const predAst of ast.args.slice(1)) {
		const { value, diagnostics: found } = evaluate(predAst, env)
		push(diagnostics, found)
		if (typeof value === 'function') preds.push(value as (v: unknown) => unknown)
		else diagnostics.push(diag(predAst, env, `(: T ...): what is after the type is a predicate, got ${describeType(value)}`))
	}
	let type = base
	if (preds.length > 0) {
		type = makeType(
			`(: ${base.typeName} ...)`,
			v => base.fits(v) && preds.every(pred => Boolean(pred(v))),
			base.default,
			{ kind: 'refine', base }
		)
	}

	const entries = [...(ast.kwargs ?? [])].map(([key, valueAst]): readonly [string, AST] => {
		if (key === 'default' || valueAst.kind === 'lit') return [key, valueAst]
		const { value, diagnostics: found } = evaluate(valueAst, env)
		push(diagnostics, found)
		return [key, toAst(value, env)]
	})
	if (entries.length > 0) {
		const metadata = new RecordASTClass(entries)
		const defaulted = withDefaultFrom(type, metadata, env)
		push(diagnostics, defaulted.diagnostics)
		type = withTypeMeta(defaulted.type, metadata)
	}
	if (preds.length > 0 && !type.fits(type.default)) {
		diagnostics.push(diag(ast, env, `(: T ...): the default, ${toAst(type.default, env).print()}, does not meet what is asked, so say one with default:`))
	}
	return { type, diagnostics }
}

/**
 * `^T v` — explicit coercion. `T` must evaluate to a type value;
 * `v` is then run through `T.fits`. On success the original `v` flows
 * through; on failure the call returns `T.default` and emits a
 * diagnostic. `()` always coerces silently to the type's default
 * (matches the typed-slot convention in `types.md`).
 *
 * Replaces the now-removed `(T v)` cast form. Pattern matching via `?`
 * remains the way to test a type without consuming the default.
 */
function evalCoerce(ast: CallAST, env: Env): EvalResult {
	if (ast.args.length !== 2) {
		return fail(
			ast,
			env,
			'^T v has a type and a value'
		)
	}
	const t = resolveTypeSlot(ast.args[1]!, env)
	if (t === null) {
		const r = evaluate(ast.args[1]!, env)
		return {
			value: UNIT,
			diagnostics: [
				...r.diagnostics,
				diag(
					ast.args[1]!,
					env,
					`^T v: what is after ^ must be a type, got ${describeType(r.value)}`
				),
			],
		}
	}
	const vResult = evaluate(ast.args[0]!, env)
	const diagnostics = [...vResult.diagnostics]
	const v = vResult.value
	if (v === UNIT) {
		return { value: t.default, diagnostics }
	}
	if (t.fits(v) && !(t.shape.kind === 'function' && typeof v !== 'function')) {
		return { value: v, diagnostics }
	}
	// A non-function given a function type: a constant function, if the value
	// fits what the function returns.
	if (t.shape.kind === 'function' && typeof v !== 'function') {
		if (t.shape.returnType.fits(v)) {
			return {
				value: makeTypedFn(
					t.shape.paramTypes,
					t.shape.returnType,
					() => v,
					t.shape.paramNames,
					t.shape.variadicTail
				),
				diagnostics,
			}
		}
	}
	diagnostics.push(
		diag(
			ast.args[0]!,
			env,
			`${t.typeName} doesn't accept ${describeType(v)} value`
		)
	)
	return { value: t.default, diagnostics }
}

/**
 * `(overload e1 e2 ...)` — bundles multiple function variants into a
 * single dispatcher value. Each `eK` must evaluate to a typed host fn
 * or a Glisp closure. The `OverloadValue` returned here gets handled
 * specially in `evalCall`, which selects the first variant whose
 * declared param types match the call's arg types.
 *
 * Variants are tried in order, so order them most-specific first.
 */
function evalOverload(ast: CallAST, env: Env): EvalResult {
	if (ast.args.length === 0) {
		return fail(ast, env, 'overload requires at least one variant')
	}
	const variants: Array<TypedHostFn | GlispClosure> = []
	const diagnostics: Diagnostic[] = []
	for (const argAst of ast.args) {
		const r = evaluate(argAst, env)
		push(diagnostics, r.diagnostics)
		const v = r.value
		if (isTypedHostFn(v) || isGlispClosure(v)) {
			variants.push(v)
		} else {
			diagnostics.push(
				diag(
					argAst,
					env,
					'overload variant must be a function (typed host fn or closure)'
				)
			)
		}
	}
	return { value: new OverloadValue(variants), diagnostics }
}

/**
 * Pick the first variant whose declared parameter types fit the
 * (statically inferred) types of the call's arguments. Falls back to
 * a diagnostic + `()` when no variant matches.
 */
function dispatchOverload(
	o: OverloadValue,
	positional: ReadonlyArray<AST>,
	kwargs: ReadonlyMap<string, AST> | undefined,
	env: Env,
	site: AST,
	priorDiagnostics: ReadonlyArray<Diagnostic>
): EvalResult {
	const diagnostics = [...priorDiagnostics]
	const argTypes = positional.map(a => infer(a, env))

	for (const variant of o.variants) {
		if (variantMatches(variant, positional, argTypes, env)) {
			if (isTypedHostFn(variant)) {
				return callTypedHostFn(
					variant,
					positional,
					kwargs,
					env,
					site,
					diagnostics
				)
			}
			return applyClosure(
				variant,
				positional,
				kwargs,
				env,
				site,
				diagnostics
			)
		}
	}

	const sigs = o.variants
		.map(v => describeVariantSignature(v))
		.join(' / ')
	const argSigs = argTypes
		.map(t => (t === null ? '?' : t.typeName))
		.join(' ')
	diagnostics.push(
		diag(
			site,
			env,
			`no overload matches arguments (${argSigs}); variants: ${sigs}`
		)
	)
	return { value: UNIT, diagnostics }
}

function variantMatches(
	variant: TypedHostFn | GlispClosure,
	positional: ReadonlyArray<AST>,
	argTypes: ReadonlyArray<TypeValue | null>,
	env: Env
): boolean {
	if (isTypedHostFn(variant)) {
		const variadic = variant.variadicTail !== undefined
		const required = variant.paramTypes.filter((_, i) => {
			const name = variant.paramNames?.[i]
			return name === undefined || !variant.optional?.has(name)
		}).length
		if (
			!variadic &&
			(positional.length < required ||
				positional.length > variant.paramTypes.length)
		) {
			return false
		}
		if (variadic && positional.length < variant.paramTypes.length) {
			return false
		}
		for (let i = 0; i < positional.length; i++) {
			const expected =
				i < variant.paramTypes.length
					? variant.paramTypes[i]!
					: variant.variadicTail!
			const inferred = argTypes[i]
			if (inferred === null || inferred === undefined) continue
			if (!argFits(positional[i]!, inferred, expected)) return false
		}
		return true
	}
	// Closure
	const fnAst = variant.ast
	const variadic = fnAst.params.some(p => p.variadic)
	if (
		!variadic &&
		positional.length !== fnAst.params.filter(p => !p.optional).length &&
		positional.length !== fnAst.params.length
	) {
		// Allow either "exact param count" or "all required". Optional
		// parameters can be skipped.
		const required = fnAst.params.filter(p => !p.optional).length
		if (positional.length < required || positional.length > fnAst.params.length) {
			return false
		}
	}
	for (let i = 0; i < positional.length; i++) {
		const param = fnAst.params[i] ?? fnAst.params[fnAst.params.length - 1]
		if (param === undefined) continue
		const t = paramTypeOf(param, variant.capturedEnv)
		if (t === null) continue
		const inferred = argTypes[i]
		if (inferred === null || inferred === undefined) continue
		if (!argFits(positional[i]!, inferred, t)) return false
	}
	void env
	return true
}

function describeVariantSignature(
	variant: TypedHostFn | GlispClosure
): string {
	if (isTypedHostFn(variant)) {
		const params = variant.paramTypes.map((t, i) => {
			const name = variant.paramNames?.[i] ?? `_${i}`
			return `${name}: ${t.typeName}`
		})
		if (variant.variadicTail !== undefined) {
			params.push(`...rest: ${variant.variadicTail.typeName}`)
		}
		return `(=> [${params.join(' ')}]: ${variant.returnType.typeName})`
	}
	return variant.ast.print()
}

function evalPipe(ast: CallAST, env: Env): EvalResult {
	// (|> input step1 step2 ...)
	if (ast.args.length === 0) {
		return fail(ast, env, '|> requires at least an input')
	}
	const inputResult = evaluate(ast.args[0]!, env)
	let value = inputResult.value
	const diagnostics = [...inputResult.diagnostics]

	for (let i = 1; i < ast.args.length; i++) {
		const stepAst = ast.args[i]!
		const stepResult = evaluate(stepAst, env)
		push(diagnostics, stepResult.diagnostics)
		const fnValue = stepResult.value

		if (isGlispClosure(fnValue)) {
			const argAst = reifyPrimitive(value)
			const r = applyClosure(fnValue, [argAst], undefined, env, stepAst, [])
			push(diagnostics, r.diagnostics)
			value = r.value
		} else if (typeof fnValue === 'function') {
			try {
				value = (fnValue as (v: unknown) => unknown)(value)
			} catch (e) {
				if (mustUnwind(e)) throw e
				const message = e instanceof Error ? e.message : String(e)
				diagnostics.push(diag(stepAst, env, `pipe step threw: ${message}`))
				value = UNIT
			}
		} else {
			diagnostics.push(
				diag(
					stepAst,
					env,
					`pipe step is not a function: ${describeType(fnValue)}`
				)
			)
			value = UNIT
		}
	}
	return { value, diagnostics }
}

// -----------------------------------------------------------------------------
// path
// -----------------------------------------------------------------------------

function evalPath(
	segments: ReadonlyArray<'..' | string | number>,
	env: Env,
	source: AST
): EvalResult {
	const target = pathTarget(segments, env)
	return 'message' in target
		? fail(source, env, target.message)
		: evaluate(readByName(target.ast), target.env)
}

/**
 * Walk a path from `env` per eval.md — Path lookup, to the evaluation node it
 * lands on. A descended node has no frame of its own until the walk goes past
 * it, so the target ends up in the env it would have if reached by ordinary
 * recursive descent. A path that ends on a container itself lands where the
 * container stands, so `[1 ./]` reaches the evaluation in progress and is seen
 * as a cycle.
 */
export function pathTarget(
	segments: ReadonlyArray<'..' | string | number>,
	env: Env
): { readonly ast: AST; readonly env: Env } | { readonly message: string } {
	let frame: Env = env
	let astHere: AST | null = frame?.ast ?? null
	let entered = true

	for (const seg of segments) {
		if (seg === '/') {
			frame = rootFrame(env)
			if (frame === null) return { message: NO_ROOT }
			astHere = frame.ast
			entered = true
			continue
		}
		if (seg === '..') {
			if (entered) {
				if (frame === null) return { message: 'path goes above top-level' }
				frame = frame.parent
			}
			astHere = frame?.ast ?? null
			entered = true
			continue
		}
		if (astHere === null) return { message: 'path descended below the root' }
		astHere = withoutMeta(astHere)
		const child = childAt(astHere, seg, frame)
		if (child === null) return { message: `path segment not found: ${seg}` }
		if (!entered) frame = enterNode(astHere, frame)
		astHere = child
		entered = false
	}

	if (astHere === null) return { message: 'path goes above top-level' }
	return { ast: astHere, env: entered ? (frame?.parent ?? null) : frame }
}

/** Why a path from the root has nowhere to start. */
export const NO_ROOT = 'no program for a path from the root to start at'

/**
 * Whether a level only stands for bindings a host gave: the prelude, and what a host
 * layers on it. What these bind is not written in a node, so a path has nothing to walk.
 */
export function isHostLevel(ast: AST, bound: number): boolean {
	if (ast.kind === 'let') return ast.bindings.length === 0 && bound > 0
	return ast.kind === 'lit'
}

/** The frame of the outermost node that is written: where a path from the root starts. */
export function rootFrame(env: Env): Env {
	let root: Env = null
	for (let frame = env; frame !== null; frame = frame.parent) {
		if (!isHostLevel(frame.ast, frame.bindings?.size ?? 0)) root = frame
	}
	return root
}

/** The frame the evaluator pushes on entering a path-addressable node. */
export function enterNode(node: AST, env: Env): Env {
	if (node.kind === 'let') return pushLetFrame(node, env)
	return variadicViews.has(node) ? env : pushAncestor(node, env)
}

/** What a call's head says its parameters are called. */
export interface CallParameters {
	readonly names: ReadonlyArray<string>
	readonly variadicName?: string
}

const variadicViewOf: WeakMap<AST, VecASTClass> = new WeakMap()
const variadicViews: WeakSet<AST> = new WeakSet()

/**
 * The argument a parameter name refers to. A variadic parameter refers to the
 * remaining arguments, as a vector that is not a node of the tree: it adds no
 * level for paths inside those arguments.
 */
export function argumentOf(
	call: CallAST,
	name: string,
	parameters: CallParameters
): AST | null {
	const index = parameters.names.indexOf(name)
	if (index !== -1) return call.args[index] ?? null
	if (name !== parameters.variadicName) return null
	let view = variadicViewOf.get(call)
	if (view === undefined) {
		view = new VecASTClass(call.args.slice(parameters.names.length))
		variadicViewOf.set(call, view)
		variadicViews.add(view)
	}
	return view
}

/**
 * The child of `node` that a path segment names. `env` is the env `node` is
 * evaluated in, for finding an argument by its parameter's name.
 */
export function childAt(
	node: AST,
	seg: string | number,
	env: Env
): AST | null {
	if (typeof seg === 'string' && !isKeySegment(seg)) return namedChildAt(node, seg)
	if (typeof seg === 'string') return slotAt(node, keyOfSegment(seg), env)
	if (node.kind === 'vec') return node.elements[seg] ?? null
	return null
}

/** Whether a segment of a path is a key, `x:`, which goes to what fills a slot, rather than a name. */
export function isKeySegment(segment: '..' | string | number): segment is string {
	return typeof segment === 'string' && segment.endsWith(':')
}

/** The key a segment `x:` stands for. */
export function keyOfSegment(segment: string): string {
	return segment.slice(0, -1)
}

/** The segment of a path that goes to what fills the slot `key`. */
export function keySegment(key: string): string {
	return `${key}:`
}

/** What directly in `node` has the name `name`, the last of them if more than one has it. */
function namedChildAt(node: AST, name: string): AST | null {
	const children = namedChildrenOf(node)
	for (let i = children.length - 1; i >= 0; i--) {
		const child = children[i]
		if (child !== undefined && child[0] === name) return child[1]
	}
	return null
}

/** What fills the slot `key` of `node`: a record's field, or a call's argument by its parameter's name. */
function slotAt(node: AST, seg: string, env: Env): AST | null {
	if (node.kind === 'record') {
		const fields = node.fields
		// last-wins lookup, ignoring SpreadAST entries (they need eval)
		for (let i = fields.length - 1; i >= 0; i--) {
			const e = fields[i]
			if (e === undefined) continue
			if (e instanceof SpreadAST) continue
			if (e[0] === seg) return e[1]
		}
		return null
	}
	if (node.kind === 'call') {
		const keyword = node.kwargs?.get(seg)
		if (keyword !== undefined) return keyword
		if (node.args.some(arg => arg.kind === 'spread')) return null
		const parameters = callParameters(node, env)
		return parameters === null ? null : argumentOf(node, seg, parameters)
	}
	return null
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function ok(value: unknown): EvalResult {
	return { value, diagnostics: [] }
}

function fail(ast: AST, env: Env, message: string): EvalResult {
	return { value: UNIT, diagnostics: [diag(ast, env, message)] }
}

function diag(ast: AST, env: Env, message: string): Diagnostic {
	return { level: 'error', message, source: { ast, env } }
}

function push<T>(target: T[], items: ReadonlyArray<T>): void {
	for (const x of items) target.push(x)
}

function isPlainRecord(v: unknown): v is Record<string, unknown> {
	return (
		typeof v === 'object' &&
		v !== null &&
		!Array.isArray(v) &&
		typeof v !== 'function'
	)
}

function describeType(v: unknown): string {
	if (v === UNIT) return 'unit'
	if (v === null) return 'null'
	if (Array.isArray(v)) return 'vector'
	if (isGlispClosure(v)) return 'closure'
	if (v instanceof IO) return 'IO'
	if (isTypeValue(v)) return `type<${v.typeName}>`
	return typeof v
}

// -----------------------------------------------------------------------------
// toAst — convert a runtime value back to an AST that evaluates to the value.
// -----------------------------------------------------------------------------

import {
	CallAST as CallASTClass,
	HostAST as HostASTClass,
	LitAST as LitASTClass,
	MetaAST as MetaASTClass,
	HIDDEN,
	LAMBDA,
	NAME,
	PIN,
	RecordAST as RecordASTClass,
	SymAST as SymASTClass,
	VecAST as VecASTClass,
	ASTNode as ASTNodeClass,
} from './types.js'

/**
 * Convert a runtime value to an AST handle that, when evaluated against
 * the provided env, yields the same value (modulo marshaling).
 *
 * Strategy:
 * - primitives → literal AST
 * - vector / record → recurse over elements / fields
 * - GlispClosure → its captured function-literal AST
 * - AST handle → `` `expr `` (quasiquote wrap)
 * - type value → bare symbol if env binds the name, else falls back to a
 *   sym with the type's stored name
 * - typed host fn → bare symbol if env binds the name, else opaque literal
 * - other JS function → bare symbol if env binds the name, else opaque literal
 *
 * Spec: docs/spec/host-api.md — `g.toAst`
 */
/**
 * What a host value has to say how it is written, as its insides are its own: an
 * object from elsewhere, say, that only a call can make. Without it, one that is not
 * a plain record or vector has no source, and goes in as it is.
 */
export const AS_SOURCE: unique symbol = Symbol.for('glisp.asSource') as never

export function toAst(value: unknown, env: Env): AST {
	const written = (value as { [AS_SOURCE]?: unknown } | null | undefined)?.[AS_SOURCE]
	if (typeof written === 'function') return written.call(value, env) as AST
	if (
		typeof value === 'number' ||
		typeof value === 'string' ||
		typeof value === 'boolean' ||
		value === UNIT
	) {
		return new LitASTClass(value as never)
	}
	if (value === null || value === undefined) {
		return new LitASTClass(UNIT)
	}
	if (isGlispClosure(value)) {
		// Prefer a bound name when available — re-evaluating a bare symbol
		// resolves through the binding rather than rebuilding the AST.
		const name = nameForBoundValue(env, value)
		if (name !== null) return new SymASTClass(name)
		return value.ast
	}
	if (value instanceof IO) {
		// IO actions have no source representation; wrap as host so they
		// round-trip identity-wise.
		return new HostASTClass(value)
	}
	if (value instanceof ASTNodeClass) {
		return new HostASTClass(value)
	}
	if (Array.isArray(value)) {
		return new VecASTClass(value.map(v => toAst(v, env)))
	}
	if (isTypeValue(value)) {
		const name = nameForBoundValue(env, value)
		if (name !== null) return new SymASTClass(name)
		// Parametric IO with a non-top payload: rebuild as a call to its
		// constructor so the resulting source actually parses (the bare
		// typeName `(IO number)` is not a valid identifier).
		if (
			value.shape.kind === 'io' &&
			value.shape.payload.typeName !== '_'
		) {
			return new CallASTClass(new SymASTClass('IO'), [
				toAst(value.shape.payload, env),
			])
		}
		return new SymASTClass(value.typeName)
	}
	if (typeof value === 'function') {
		// Typed or untyped host fn: prefer a bound name in env.
		const name = nameForBoundValue(env, value)
		if (name !== null) return new SymASTClass(name)
		// Otherwise wrap in a HostAST — preserves identity within a
		// process so the value survives a g.toAst → g.eval round trip,
		// at the cost of source-level round-trip (host values have no
		// source representation).
		return new HostASTClass(value)
	}
	if (typeof value === 'object') {
		const entries: Array<readonly [string, AST]> = []
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			entries.push([k, toAst(v, env)])
		}
		return new RecordASTClass(entries)
	}
	// Fallback — wrap whatever it is verbatim. Identity preserved.
	return new HostASTClass(value)
}

/**
 * Walk the env's frame chain looking for a binding whose evaluated value
 * is identical (`===`) to the given value. Returns the binding name if
 * found. Used by toAst to prefer a bare symbol over a structural rebuild.
 */
function nameForBoundValue(env: Env, value: unknown): string | null {
	let frame = env
	while (frame !== null) {
		if (frame.bindings) {
			for (const [name, target] of frame.bindings) {
				const r = evaluate(target.ast, target.env)
				if (r.value === value) return name
			}
		}
		frame = frame.parent
	}
	return null
}
