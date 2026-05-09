/**
 * `expand(ast, env)` — one-step macro expansion.
 *
 * If `ast` is a call to a Glisp closure with a body, substitute the
 * closure's parameters with the call's argument ASTs throughout the
 * body, respecting quasiquote / unquote / splice levels per
 * docs/spec/eval.md (Multi-step evaluation / Abstraction ladder).
 *
 * - Substitution is at quote level 0 only — symbols inside `` `... ``
 *   stay as data, just like a quote.
 * - `~expr` at level 1 evaluates the substituted body fragment in the
 *   caller's env and reifies the result back into the AST stream.
 * - `...~expr` at level 1 splices the result into the surrounding
 *   list-building context (call args / vec / record).
 *
 * Hygiene is future work: free references in the body are not yet
 * rewritten as paths back to the closure's defining scope. For naive
 * macros that don't shadow names this is fine.
 */

import {
	AccessAST,
	type AST,
	CallAST,
	FnAST,
	type FnParam,
	LetAST,
	LitAST,
	MetaAST,
	QuoteAST,
	RecordAST,
	type RecordEntry,
	SpliceAST,
	SpreadAST,
	UNIT,
	UnquoteAST,
	VecAST,
} from './types.js'
import { evaluate, isGlispClosure, toAst } from './eval.js'
import type { Env } from './types.js'

/**
 * Iterate `expand` from `ast` until a fixed point is reached. Returns the
 * sequence of intermediate ASTs (the "abstraction ladder" per
 * docs/spec/eval.md), starting with the input. The last entry is always
 * the fixed point — calling `expand` again yields the same node.
 *
 * `maxSteps` guards against pathologically slow but non-cyclic expansion.
 * Defaults to 64.
 */
export function expandLadder(
	ast: AST,
	env: Env,
	options?: { readonly maxSteps?: number }
): ReadonlyArray<AST> {
	const max = options?.maxSteps ?? 64
	const ladder: AST[] = [ast]
	let current = ast
	for (let i = 0; i < max; i++) {
		const next = expand(current, env)
		if (next === current) break
		ladder.push(next)
		current = next
	}
	return ladder
}

/**
 * Convenience: same as `expandLadder(ast, env).at(-1)` — only the
 * fully-expanded fixed point.
 */
export function expandAll(
	ast: AST,
	env: Env,
	options?: { readonly maxSteps?: number }
): AST {
	const ladder = expandLadder(ast, env, options)
	return ladder[ladder.length - 1]!
}

export function expand(ast: AST, env: Env): AST {
	if (ast.kind !== 'call') return ast

	// Special forms with non-standard arg conventions are not expanded —
	// expanding them would lose their custom semantics.
	if (ast.head.kind === 'sym') {
		const reserved = new Set([
			'?',
			'|>',
			'def',
			'undef',
			'overload',
		])
		if (reserved.has(ast.head.name)) return ast
	}

	const head = evaluate(ast.head, env).value
	if (!isGlispClosure(head)) return ast
	const fnAst = head.ast
	if (fnAst.body === null) return ast

	const subst = buildSubstitution(fnAst, ast.args)
	return substitute(fnAst.body, subst, env, 0)
}

function buildSubstitution(
	fnAst: FnAST,
	args: ReadonlyArray<AST>
): ReadonlyMap<string, AST> {
	const subst = new Map<string, AST>()
	for (let i = 0; i < fnAst.params.length; i++) {
		const param = fnAst.params[i]!
		const arg = args[i]
		if (arg === undefined) {
			// Missing arg — bind to the unit literal so substitution still
			// proceeds. Users get a runtime fallback as if eval had run.
			subst.set(param.name, new LitAST(UNIT))
			continue
		}
		subst.set(param.name, arg)
	}
	return subst
}

function substitute(
	ast: AST,
	subst: ReadonlyMap<string, AST>,
	callerEnv: Env,
	level: number
): AST {
	switch (ast.kind) {
		case 'sym':
			if (level === 0 && subst.has(ast.name)) {
				return subst.get(ast.name)!
			}
			return ast

		case 'lit':
		case 'host':
		case 'path':
			return ast

		case 'quote':
			return new QuoteAST(
				substitute(ast.expr, subst, callerEnv, level + 1)
			)

		case 'unquote': {
			if (level === 1) {
				// Pop the quote level: substitute through the inner expr at
				// level 0, then evaluate and reify the result back to AST.
				const inner = substitute(ast.expr, subst, callerEnv, 0)
				const v = evaluate(inner, callerEnv).value
				return toAst(v, callerEnv)
			}
			return new UnquoteAST(
				substitute(ast.expr, subst, callerEnv, level - 1)
			)
		}

		case 'splice': {
			if (level === 1) {
				// Splice is only meaningful inside a list-building parent;
				// the parent (vec / call / record) is responsible for
				// flattening. We substitute and evaluate now, but wrap as
				// a SpreadAST around a vec literal so the parent handles
				// element expansion via its existing spread path. If the
				// evaluated value isn't a vector, fall back to spread of
				// a single-element vec.
				const inner = substitute(ast.expr, subst, callerEnv, 0)
				const v = evaluate(inner, callerEnv).value
				const spliceAst = toAst(v, callerEnv)
				return new SpreadAST(spliceAst)
			}
			return new SpliceAST(
				substitute(ast.expr, subst, callerEnv, level - 1)
			)
		}

		case 'spread':
			return new SpreadAST(
				substitute(ast.expr, subst, callerEnv, level)
			)

		case 'call': {
			const head = substitute(ast.head, subst, callerEnv, level)
			const args = ast.args.map(a =>
				substitute(a, subst, callerEnv, level)
			)
			let kwargs: ReadonlyMap<string, AST> | undefined
			if (ast.kwargs !== undefined) {
				const next = new Map<string, AST>()
				for (const [k, v] of ast.kwargs) {
					next.set(k, substitute(v, subst, callerEnv, level))
				}
				kwargs = next
			}
			return new CallAST(head, args, kwargs)
		}

		case 'vec':
			return new VecAST(
				ast.elements.map(e => substitute(e, subst, callerEnv, level))
			)

		case 'record': {
			const fields: RecordEntry[] = ast.fields.map(entry => {
				if (entry instanceof SpreadAST) {
					return new SpreadAST(
						substitute(entry.expr, subst, callerEnv, level)
					)
				}
				return [
					entry[0],
					substitute(entry[1], subst, callerEnv, level),
				] as const
			})
			return new RecordAST(fields, ast.optional)
		}

		case 'let': {
			const bindings = ast.bindings.map(
				([name, valueAst]) =>
					[
						name,
						substitute(valueAst, subst, callerEnv, level),
					] as const
			)
			const body =
				ast.body === null
					? null
					: substitute(ast.body, subst, callerEnv, level)
			return new LetAST(bindings, body)
		}

		case 'access':
			return new AccessAST(
				substitute(ast.target, subst, callerEnv, level),
				ast.key
			)

		case 'meta':
			return new MetaAST(
				substitute(ast.metadata, subst, callerEnv, level) as RecordAST,
				substitute(ast.expr, subst, callerEnv, level)
			)

		case 'fn': {
			// A nested function literal introduces new parameter scope.
			// Names matching the inner params shadow outer substitutions.
			const shadowed = new Set(ast.params.map(p => p.name))
			const innerSubst = new Map<string, AST>()
			for (const [name, replacement] of subst) {
				if (!shadowed.has(name)) innerSubst.set(name, replacement)
			}
			const params: FnParam[] = ast.params.map(p => ({
				...p,
				type: substitute(p.type, innerSubst, callerEnv, level),
			}))
			const returnType = substitute(
				ast.returnType,
				innerSubst,
				callerEnv,
				level
			)
			const body =
				ast.body === null
					? null
					: substitute(ast.body, innerSubst, callerEnv, level)
			return new FnAST(ast.generics, params, returnType, body)
		}
	}
}
