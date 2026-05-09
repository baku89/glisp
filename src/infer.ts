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

function resolveTypeFromEnv(env: Env, name: string): TypeValue | null {
	const target = lookupBareName(name, env)
	if (target === null) return null
	const v = evaluate(target.ast, target.env).value
	return isTypeValue(v) ? v : null
}
