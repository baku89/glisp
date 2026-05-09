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
	GlispClosure,
	isTypedHostFn,
	isTypeValue,
	lookupBareName,
	makeType,
	type TypedHostFn,
	type TypeValue,
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
			if ((v as unknown) instanceof GlispClosure)
				return closureTypeOf(v as unknown as GlispClosure)
			if (isTypeValue(v)) return v
			return null
		}
		case 'sym': {
			const target = lookupBareName(ast.name, env)
			if (target === null) return null
			return infer(target.ast, target.env)
		}
		case 'call': {
			const headValue = evaluate(ast.head, env).value
			if (isTypedHostFn(headValue)) return headValue.returnType
			if (headValue instanceof GlispClosure) {
				const rt = evaluate(
					headValue.ast.returnType,
					headValue.capturedEnv
				).value
				if (isTypeValue(rt)) return rt
			}
			return null
		}
		case 'fn':
			// Function literal — produce its declared (=> ... ): T type.
			// We synthesize a closure-shaped type without evaluating param /
			// return type expressions; the printed name is just `printStructural`
			// of the FnAST (sans body).
			return makeFnLiteralType(ast)
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

/** Build a TypeValue whose `typeName` describes a typed host fn's signature. */
function functionTypeOf(fn: TypedHostFn): TypeValue {
	const cached = fnTypeCache.get(fn)
	if (cached !== undefined) return cached
	const params = fn.paramTypes.map((t, i) => {
		const name = fn.paramNames?.[i] ?? `_${i}`
		return `${name}: ${t.typeName}`
	})
	if (fn.variadicTail !== undefined) {
		params.push(`...rest: ${fn.variadicTail.typeName}`)
	}
	const sig = `(=> (${params.join(' ')}): ${fn.returnType.typeName})`
	const t = makeType(sig, () => false, UNIT)
	fnTypeCache.set(fn, t)
	return t
}

/** Build a TypeValue whose `typeName` describes a closure's signature. */
function closureTypeOf(c: GlispClosure): TypeValue {
	const cached = closureTypeCache.get(c)
	if (cached !== undefined) return cached
	const t = makeType(renderFnSignature(c.ast), () => false, UNIT)
	closureTypeCache.set(c, t)
	return t
}

function makeFnLiteralType(fnAst: import('./types.js').FnAST): TypeValue {
	return makeType(renderFnSignature(fnAst), () => false, UNIT)
}

function renderFnSignature(fnAst: import('./types.js').FnAST): string {
	const params = fnAst.params.map(p => {
		const variadicMark = p.variadic ? '...' : ''
		const optionalMark = p.optional ? '?' : ''
		return `${variadicMark}${p.name}${optionalMark}: ${p.type.print()}`
	})
	const generics =
		fnAst.generics.length > 0 ? `(${fnAst.generics.join(' ')}) ` : ''
	return `(=> ${generics}(${params.join(' ')}): ${fnAst.returnType.print()})`
}

const fnTypeCache: WeakMap<TypedHostFn, TypeValue> = new WeakMap()
const closureTypeCache: WeakMap<GlispClosure, TypeValue> = new WeakMap()

function resolveTypeFromEnv(env: Env, name: string): TypeValue | null {
	const target = lookupBareName(name, env)
	if (target === null) return null
	const v = evaluate(target.ast, target.env).value
	return isTypeValue(v) ? v : null
}
