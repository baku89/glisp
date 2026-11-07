/**
 * Static checker: walks a whole program, including what evaluation would never
 * reach, and reports references that do not resolve and type errors. Runs no
 * value expression.
 *
 * Spec: docs/spec/types.md — Type inference
 */

import { argFits, enterNode, evaluate, pushLetFrame, withDefaultFrom } from './eval.js'
import { bodyFrame, checkCall, infer, resolveTypeSlot } from './infer.js'
import { resolve } from './resolve.js'
import {
	type AST,
	type CallAST,
	type Diagnostic,
	type Env,
	type FnAST,
	SpreadAST,
} from './types.js'
import { desugar } from './desugar.js'

/**
 * Check `ast` against `env`. Returns all diagnostics found. Never throws.
 */
export function check(ast: AST, env: Env): ReadonlyArray<Diagnostic> {
	const resolution = resolve(ast, env)
	const diagnostics = [...resolution.diagnostics]
	walk(desugar(ast), env, diagnostics)
	return diagnostics
}

function walk(ast: AST, env: Env, diagnostics: Diagnostic[]): void {
	switch (ast.kind) {
		case 'call':
			return walkCall(ast, env, diagnostics)
		case 'vec': {
			const inside = enterNode(ast, env)
			for (const element of ast.elements) walk(element, inside, diagnostics)
			return
		}
		case 'record': {
			const inside = enterNode(ast, env)
			for (const entry of ast.fields) {
				walk(entry instanceof SpreadAST ? entry.expr : entry[1], inside, diagnostics)
			}
			return
		}
		case 'let': {
			const inside = pushLetFrame(ast, env)
			for (const [, value] of ast.bindings) walk(value, inside, diagnostics)
			if (ast.body !== null) walk(ast.body, inside, diagnostics)
			return
		}
		case 'fn':
			return walkFn(ast, env, diagnostics)
		case 'access':
			return walk(ast.target, env, diagnostics)
		case 'meta': {
			// A value written as it is, as `^{default: 7} 5`, is a value here and not its type.
			if (ast.metadata.get('default') !== undefined && ast.expr.kind !== 'lit') {
				const type = resolveTypeSlot(ast.expr, env)
				if (type !== null) {
					diagnostics.push(
						...withDefaultFrom(type, ast.metadata, env).diagnostics
					)
				}
			}
			return walk(ast.expr, env, diagnostics)
		}
		case 'unquote':
		case 'spread':
			return walk(ast.expr, env, diagnostics)
		case 'lit':
		case 'host':
		case 'sym':
		case 'path':
			return
	}
}

function walkCall(ast: CallAST, env: Env, diagnostics: Diagnostic[]): void {
	const inside = enterNode(ast, env)
	// What a coercion is to is a type, and so is what a derived type is of
	const typeAt = ast.head.kind !== 'sym' ? -1 : ast.head.name === '^' ? 1 : ast.head.name === ':' ? 0 : -1
	if (typeAt >= 0) {
		ast.args.forEach((arg, i) => i !== typeAt && walk(arg, inside, diagnostics))
		ast.kwargs?.forEach(value => walk(value, inside, diagnostics))
		// A type is worked out where it is read, so what is wrong in making one is known here
		if (typeAt === 0) {
			const own = new Set<AST>([ast, ...(ast.kwargs?.values() ?? [])])
			diagnostics.push(...evaluate(ast, env).diagnostics.filter(d => own.has(d.source.ast)))
		}
	} else {
		if (ast.head.kind !== 'sym') walk(ast.head, inside, diagnostics)
		for (const arg of ast.args) walk(arg, inside, diagnostics)
		ast.kwargs?.forEach(value => walk(value, inside, diagnostics))
	}
	checkCall(ast, env, (node, message) => {
		diagnostics.push({ level: 'error', message, source: { ast: node, env } })
	})
}

function walkFn(ast: FnAST, env: Env, diagnostics: Diagnostic[]): void {
	if (ast.body === null) return
	const frame = bodyFrame(ast, env)
	walk(ast.body, frame, diagnostics)

	const declared = resolveTypeSlot(ast.returnType, frame)
	const actual = infer(ast.body, frame)
	if (declared !== null && actual !== null && !argFits(ast.body, actual, declared)) {
		diagnostics.push({
			level: 'error',
			message: `return type mismatch: expected ${declared.typeName}, got ${actual.typeName}`,
			source: { ast: ast.body, env },
		})
	}
}
