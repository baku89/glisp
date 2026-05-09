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

export function infer(ast: AST, env: Env): TypeValue | null {
	switch (ast.kind) {
		case 'lit': {
			const v = ast.value
			if (typeof v === 'number') return resolveTypeFromEnv(env, 'number')
			if (typeof v === 'string') return resolveTypeFromEnv(env, 'string')
			if (typeof v === 'boolean') return resolveTypeFromEnv(env, 'boolean')
			if (v === UNIT) return resolveTypeFromEnv(env, 'unit')
			// Lit holding a Glisp value (typed host fn, closure, type value).
			// Useful at REPL `:type` prompts that resolve a name to a value.
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
