/**
 * Static checker: walks a whole program, including what evaluation would never
 * reach, and reports references that do not resolve and type errors. Runs no
 * value expression.
 *
 * Spec: docs/spec/types.md — Type inference
 */

import { enterNode, pushLetFrame, typeFits, withDefaultFrom } from './eval.js'
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
			if (ast.metadata.get('default') !== undefined) {
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
	const isTypeSlotForm = ast.head.kind === 'sym' && ast.head.name === ':'
	if (isTypeSlotForm) {
		if (ast.args[0] !== undefined) walk(ast.args[0], inside, diagnostics)
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
	if (declared !== null && actual !== null && !typeFits(actual, declared)) {
		diagnostics.push({
			level: 'error',
			message: `return type mismatch: expected ${declared.typeName}, got ${actual.typeName}`,
			source: { ast: ast.body, env },
		})
	}
}
