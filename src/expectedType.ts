/**
 * `expectedTypeAt(parent, slot, env)` — what type should fit at a given
 * position inside `parent`?
 *
 * Used by GUI hosts and completion engines to know what kind of value
 * a slot is asking for, even when the slot is currently empty or holds
 * something else. Mirrors the spec's `g.expectedTypeAt`.
 *
 * Slot encoding:
 * - For `call`: number → 0-based positional argument index;
 *   string → keyword-argument name.
 * - For `vec`: number → element index (homogeneous: returns the
 *   element type when known; tuple types not yet supported).
 * - For `record`: string → field name.
 * - For `fn`: string `'param:N'` → declared type of param N's
 *   annotation (the AST in type position); `'return'` → return type
 *   annotation. Mainly useful for editor tooling traversing the
 *   signature.
 *
 * Returns `null` when no type information is available.
 */

import {
	evaluate,
	isGlispClosure,
	isTypedHostFn,
	isTypeValue,
	type TypeValue,
} from './eval.js'
import { type AST, type Env } from './types.js'

/**
 * Return the `TypeValue` that a host editor should expect at `slot`
 * inside `parent`. Used by GUI hosts to drive type-aware completion,
 * placeholder rendering, and "what would fit here?" hints.
 *
 * Slot encoding (see file header): a number is a positional index for
 * `call` / `vec`; a string is either a record / kwarg field name, or
 * one of the `fn` slot tags (`'return'`, `'param:N'`).
 *
 * Returns `null` when no type information can be derived (an empty
 * record, an untyped call head, an out-of-range slot, etc.).
 */
export function expectedTypeAt(
	parent: AST,
	slot: number | string,
	env: Env
): TypeValue | null {
	switch (parent.kind) {
		case 'call':
			return expectedAtCall(parent, slot, env)
		case 'fn': {
			if (slot === 'return') {
				const r = evaluate(parent.returnType, env)
				return isTypeValue(r.value) ? r.value : null
			}
			if (typeof slot === 'string' && slot.startsWith('param:')) {
				const idx = Number(slot.slice('param:'.length))
				const p = parent.params[idx]
				if (p === undefined) return null
				const r = evaluate(p.type, env)
				return isTypeValue(r.value) ? r.value : null
			}
			return null
		}
		// vec / record / let / others: no type-context to pull from until
		// the parent is itself annotated by an enclosing slot.
		default:
			return null
	}
}

function expectedAtCall(
	parent: import('./types.js').CallAST,
	slot: number | string,
	env: Env
): TypeValue | null {
	const head = evaluate(parent.head, env).value

	if (typeof slot === 'string') {
		if (isTypedHostFn(head)) {
			const idx = head.paramNames?.indexOf(slot) ?? -1
			if (idx >= 0) return head.paramTypes[idx] ?? null
			return null
		}
		if (isGlispClosure(head)) {
			const param = head.ast.params.find(p => p.name === slot)
			if (param === undefined) return null
			const t = evaluate(param.type, head.capturedEnv).value
			return isTypeValue(t) ? t : null
		}
		return null
	}

	const argIdx = slot
	if (isTypedHostFn(head)) {
		if (argIdx < head.paramTypes.length) return head.paramTypes[argIdx]!
		if (head.variadicTail !== undefined) return head.variadicTail
		return null
	}
	if (isGlispClosure(head)) {
		const param = head.ast.params[argIdx]
		if (param === undefined) return null
		const t = evaluate(param.type, head.capturedEnv).value
		return isTypeValue(t) ? t : null
	}
	if (isTypeValue(head) && argIdx === 0) {
		return head
	}
	return null
}
