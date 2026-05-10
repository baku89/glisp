/**
 * Static type inference.
 *
 * Given an AST + env, returns the inferred `TypeValue` (or `null` if the
 * type can't be determined). Used by `evalCall` to detect type mismatches
 * before forcing arguments — a confirmed mismatch lets the evaluator emit
 * a diagnostic and substitute the parameter type's default without ever
 * running the offending expression.
 *
 * Spec: docs/spec/types.md — Type inference
 *
 * This is a lightweight, eval-coupled inference pass. A fuller static
 * checker (independent of the evaluator) is a future direction.
 */

import {
	evaluate,
	type GlispClosure,
	isGlispClosure,
	isOverload,
	isTypedHostFn,
	isTypeValue,
	lookupBareName,
	makeFunctionType,
	makeType,
	type OverloadValue,
	type TypedHostFn,
	type TypeValue,
	typeFits,
} from './eval.js'
import { type AST, type Env, UNIT } from './types.js'

/**
 * Statically infer the `TypeValue` of `ast` against `env` without
 * evaluating it. Returns `null` when the inferred type cannot be
 * determined (for example, a free variable, or an expression whose
 * head is not a function-typed value).
 *
 * Used by `check.ts` to surface type-mismatch diagnostics without
 * running the program, and by the evaluator's typed-host-fn path to
 * skip evaluating arguments that already statically mismatch their
 * declared parameter type.
 */
export function infer(ast: AST, env: Env): TypeValue | null {
	switch (ast.kind) {
		case 'lit': {
			const v = ast.value
			if (typeof v === 'number') return resolveTypeFromEnv(env, 'number')
			if (typeof v === 'string') return resolveTypeFromEnv(env, 'string')
			if (typeof v === 'boolean') return resolveTypeFromEnv(env, 'boolean')
			if (v === UNIT) return resolveTypeFromEnv(env, 'unit')
			return null
		}
		case 'host': {
			const v = ast.value
			if (isTypedHostFn(v)) return functionTypeOf(v)
			if (isGlispClosure(v)) return closureTypeOf(v)
			if (isOverload(v)) return overloadTypeOf(v)
			if (isTypeValue(v)) return v
			return null
		}
		case 'sym': {
			const target = lookupBareName(ast.name, env)
			if (target === null) return null
			// Prefer the runtime value's type when it carries specific shape
			// information (a TypeValue itself, a typed host fn, a closure).
			// This is what makes `:type Color` show `(enum ...)` rather than
			// just `_` (the static return type of the `enum` constructor).
			// Memoization makes the eval cheap on repeat lookups.
			const v = evaluate(target.ast, target.env).value
			if (isTypeValue(v)) return v
			if (isTypedHostFn(v)) return functionTypeOf(v)
			if (isGlispClosure(v)) return closureTypeOf(v)
			if (isOverload(v)) return overloadTypeOf(v)
			// Otherwise fall back to static inference on the bound AST
			// (covers primitive literals like `x = 42`).
			return infer(target.ast, target.env)
		}
		case 'call': {
			const headValue = evaluate(ast.head, env).value
			if (isTypedHostFn(headValue)) return headValue.returnType
			if (isGlispClosure(headValue)) {
				const rt = evaluate(
					headValue.ast.returnType,
					headValue.capturedEnv
				).value
				if (isTypeValue(rt)) return rt
			}
			if (isOverload(headValue)) {
				// Use the first variant whose param types statically fit
				// the call's args; fall back to the union of return types.
				return overloadCallReturnType(headValue, ast, env)
			}
			return null
		}
		case 'fn':
			// Function literal — produce its declared (=> ... ): T type.
			// Resolve the literal's declared param / return types against
			// the surrounding env to produce a function-shaped TypeValue.
			return makeFnLiteralType(ast, env)
		case 'vec':
			return inferVec(ast, env)
		case 'record':
			return inferRecord(ast, env)
		case 'meta':
		case 'quote':
		case 'unquote':
		case 'splice':
		case 'spread':
			return infer(ast.expr, env)
		case 'access':
		default:
			return null
	}
}

/**
 * Infer a vector literal's type as a tuple `[T1 T2 ... Tn]` carrying
 * the inferred type of each position. The tuple shape preserves
 * length, so `[0 1 2]` types as `[number number number]` and a host
 * fixed-size type like `vec3` can fit. Tuples remain compatible with
 * the looser `[...T]` / `vector` slots through `typeFits`. Returns
 * `null` when any element's type is undeterminable or when a spread
 * element is present (its length is runtime-only).
 */
function inferVec(
	ast: import('./types.js').VecAST,
	env: Env
): TypeValue | null {
	const elements: TypeValue[] = []
	for (const el of ast.elements) {
		if (el.kind === 'spread') return null
		const t = infer(el, env)
		if (t === null) return null
		elements.push(t)
	}
	const name = `[${elements.map(t => t.typeName).join(' ')}]`
	return makeType(
		name,
		v =>
			Array.isArray(v) &&
			v.length === elements.length &&
			elements.every((t, i) => t.fits(v[i])),
		elements.map(t => t.default),
		{ kind: 'tuple', elements }
	)
}

/**
 * Infer a record literal's type. Returns `null` when a spread field
 * is present (its expansion is runtime-only) or any field's type is
 * undeterminable. Optional fields are reflected with a trailing `?`
 * on the field name.
 */
function inferRecord(
	ast: import('./types.js').RecordAST,
	env: Env
): TypeValue | null {
	const fields = new Map<string, TypeValue>()
	const optional = new Set<string>()
	const defaults: Record<string, unknown> = {}
	const printOrder: string[] = []
	for (const entry of ast.fields) {
		if (Array.isArray(entry) === false) return null
		const [k, v] = entry as readonly [string, AST]
		const t = infer(v, env)
		if (t === null) return null
		fields.set(k, t)
		if (ast.optional?.has(k)) optional.add(k)
		defaults[k] = t.default
		if (!printOrder.includes(k)) printOrder.push(k)
	}
	const name =
		'{' +
		printOrder
			.map(k => `${k}${optional.has(k) ? '?' : ''}: ${fields.get(k)!.typeName}`)
			.join(' ') +
		'}'
	return makeType(
		name,
		v => {
			if (v === null || typeof v !== 'object' || Array.isArray(v)) return false
			const rec = v as Record<string, unknown>
			for (const [k, t] of fields) {
				if (!(k in rec)) {
					if (!optional.has(k)) return false
					continue
				}
				if (!t.fits(rec[k])) return false
			}
			return true
		},
		defaults,
		{ kind: 'record', fields, optional }
	)
}

/** Build a TypeValue whose shape mirrors a typed host fn's signature. */
function functionTypeOf(fn: TypedHostFn): TypeValue {
	const cached = fnTypeCache.get(fn)
	if (cached !== undefined) return cached
	const opts: {
		paramNames?: ReadonlyArray<string>
		variadicTail?: TypeValue
	} = {}
	if (fn.paramNames !== undefined) opts.paramNames = fn.paramNames
	if (fn.variadicTail !== undefined) opts.variadicTail = fn.variadicTail
	const t = makeFunctionType(fn.paramTypes, fn.returnType, opts)
	fnTypeCache.set(fn, t)
	return t
}

/**
 * Build a TypeValue for a closure value. Param / return types in the
 * closure's FnAST are evaluated against the captured env to recover
 * `TypeValue` shapes; positions that fail to resolve fall back to top.
 */
function closureTypeOf(c: GlispClosure): TypeValue {
	const cached = closureTypeCache.get(c)
	if (cached !== undefined) return cached
	const t = closureFnLikeType(c.ast, c.capturedEnv)
	closureTypeCache.set(c, t)
	return t
}

/** Same as `closureTypeOf` but for a fresh function-literal AST + env. */
function makeFnLiteralType(
	fnAst: import('./types.js').FnAST,
	env: Env
): TypeValue {
	return closureFnLikeType(fnAst, env)
}

function closureFnLikeType(
	fnAst: import('./types.js').FnAST,
	env: Env
): TypeValue {
	const top = lookupBareName('_', env)
	const topType =
		top !== null && isTypeValue(evaluate(top.ast, top.env).value)
			? (evaluate(top.ast, top.env).value as TypeValue)
			: makeType('_', () => true, UNIT)

	const paramNames: string[] = []
	const paramTypes: TypeValue[] = []
	let variadicTail: TypeValue | undefined
	for (const p of fnAst.params) {
		const tr = evaluate(p.type, env)
		const t = isTypeValue(tr.value) ? tr.value : topType
		if (p.variadic) {
			variadicTail = t
		} else {
			paramNames.push(p.name)
			paramTypes.push(t)
		}
	}
	const rr = evaluate(fnAst.returnType, env)
	const returnType = isTypeValue(rr.value) ? rr.value : topType
	return makeFunctionType(paramTypes, returnType, {
		paramNames,
		...(variadicTail !== undefined ? { variadicTail } : {}),
	})
}

const fnTypeCache: WeakMap<TypedHostFn, TypeValue> = new WeakMap()
const closureTypeCache: WeakMap<GlispClosure, TypeValue> = new WeakMap()
const overloadTypeCache: WeakMap<OverloadValue, TypeValue> = new WeakMap()

/**
 * Build a TypeValue describing an overload — its name lists each
 * variant's signature separated by `|`. Useful for `:type someOverload`.
 */
function overloadTypeOf(o: OverloadValue): TypeValue {
	const cached = overloadTypeCache.get(o)
	if (cached !== undefined) return cached
	const variantNames = o.variants.map(v => {
		if (isTypedHostFn(v)) return functionTypeOf(v).typeName
		return closureTypeOf(v).typeName
	})
	const t = makeType(
		`(overload ${variantNames.join(' ')})`,
		v => typeof v === 'function',
		UNIT
	)
	overloadTypeCache.set(o, t)
	return t
}

/**
 * Static return-type of an overload call: pick the first variant whose
 * param types fit the call's inferred arg types. Falls back to the
 * first variant's return type (so `:type` still surfaces something).
 */
function overloadCallReturnType(
	o: OverloadValue,
	ast: import('./types.js').CallAST,
	env: Env
): TypeValue | null {
	for (const variant of o.variants) {
		if (isTypedHostFn(variant)) {
			if (
				ast.args.length !== variant.paramTypes.length &&
				variant.variadicTail === undefined
			)
				continue
			let ok = true
			for (let i = 0; i < ast.args.length; i++) {
				const expected =
					i < variant.paramTypes.length
						? variant.paramTypes[i]!
						: variant.variadicTail!
				const inferred = infer(ast.args[i]!, env)
				if (inferred === null) continue
				if (!typeFits(inferred, expected)) {
					ok = false
					break
				}
			}
			if (ok) return variant.returnType
		}
	}
	const first = o.variants[0]
	if (first === undefined) return null
	if (isTypedHostFn(first)) return first.returnType
	const rt = evaluate(first.ast.returnType, first.capturedEnv).value
	return isTypeValue(rt) ? rt : null
}

function resolveTypeFromEnv(env: Env, name: string): TypeValue | null {
	const target = lookupBareName(name, env)
	if (target === null) return null
	const v = evaluate(target.ast, target.env).value
	return isTypeValue(v) ? v : null
}
