/**
 * Evaluator skeleton.
 *
 * This is the smallest possible evaluator: literals evaluate to their
 * marshaled JS value, and bare-name lookups walk the env chain. Everything
 * else (call, accessor, fn application, path lookup, %, ?, |>, expand,
 * memoization, cycle detection, type-cast machinery, diagnostics
 * propagation) is left for follow-up passes.
 *
 * Spec: docs/spec/eval.md
 */

import {
	type AST,
	type BindingTarget,
	type Diagnostic,
	type Env,
	type Frame,
	UNIT,
} from './types.js'

// -----------------------------------------------------------------------------
// Result type
// -----------------------------------------------------------------------------

/**
 * Result of one evaluation. `value` is the marshaled JS value (per
 * host-api.md — runtime values are plain JS). `diagnostics` is the bag of
 * issues encountered during this evaluation.
 */
export interface EvalResult {
	readonly value: unknown
	readonly diagnostics: ReadonlyArray<Diagnostic>
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Evaluate `ast` against `env`. Returns the JS-native value plus any
 * diagnostics raised along the way. Never throws — failures surface as `()`
 * (the unit value) accompanied by a diagnostic.
 */
export function evaluate(ast: AST, env: Env): EvalResult {
	switch (ast.kind) {
		case 'lit':
			return { value: ast.value, diagnostics: [] }

		case 'sym': {
			const target = lookupBareName(ast.name, env)
			if (target === null) {
				return {
					value: UNIT,
					diagnostics: [
						{
							level: 'error',
							message: `unresolvable name: ${ast.name}`,
							source: { ast, env },
						},
					],
				}
			}
			return evaluate(target.ast, target.env)
		}

		default:
			return {
				value: UNIT,
				diagnostics: [
					{
						level: 'error',
						message: `evaluator does not yet handle '${ast.kind}'`,
						source: { ast, env },
					},
				],
			}
	}
}

// -----------------------------------------------------------------------------
// Env helpers
// -----------------------------------------------------------------------------

/** The empty environment (root sentinel). */
export const emptyEnv: Env = null

/**
 * Build a top-level env containing the given bindings. Each binding is the
 * AST that the name resolves to. Captured env for each binding is set to the
 * resulting top-level env (so bindings can refer to one another lazily).
 *
 * Useful for tests and simple host setups; the full `prelude.with({...})`
 * builder is part of the host-api work and lives elsewhere.
 */
export function makeTopLevel(
	bindings: Readonly<Record<string, AST>>
): Env {
	// Placeholder: a top-level frame whose `ast` is a synthetic unit literal
	// (the frame is conceptually "above" any user AST).
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

/**
 * Walk the env's frame chain looking for a binding named `name`. Returns
 * the innermost match's `(ast, env)` pair, or `null` if no frame holds it.
 */
function lookupBareName(name: string, env: Env): BindingTarget | null {
	let frame = env
	while (frame !== null) {
		const target = frame.bindings?.get(name)
		if (target !== undefined) return target
		frame = frame.parent
	}
	return null
}
