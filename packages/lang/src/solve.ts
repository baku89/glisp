/**
 * `solve`: working backward from a value to an edit. Evaluation changes nothing,
 * and neither does this: it makes a new AST.
 *
 * It goes down from the node to something it can change, the way a value would
 * have come up. Only a literal changes, so a name leads to what it is bound to,
 * and a call to a closure leads through its body to the arguments. A function's
 * own literals stay, since other calls share them.
 *
 * Spec: spec/eval.md — Working backward
 */

import { isPinned, lit } from './build.js'
import { desugar } from './desugar.js'
import {
	enterNode,
	evaluate,
	type GlispClosure,
	isGlispClosure,
	isTypedHostFn,
	lookupBareName,
	pathTarget,
	pushLetFrame,
} from './eval.js'
import {
	AccessAST,
	type AST,
	CallAST,
	type Diagnostic,
	type Env,
	LetAST,
	type LitAST,
	MetaAST,
	RecordAST,
	SpreadAST,
	UnquoteAST,
	VecAST,
} from './types.js'

export interface Solved {
	/** The new root, or null if there is no way to the value. */
	readonly ast: AST | null
	readonly diagnostics: readonly Diagnostic[]
}

/** Literals to change, and what to. */
type Edits = ReadonlyMap<LitAST, unknown>

const NOTHING: Edits = new Map()
const MAX_DEPTH = 200
const MAX_STEPS = 10_000
const TOLERANCE = 1e-9

/**
 * `root` in `env`, edited so that `node`, somewhere in it, evaluates to `value`.
 * What is unchanged stays `===`.
 */
export function solve(root: AST, env: Env, node: AST, value: unknown): Solved {
	const places = placesIn(root, env)
	const nodeEnv = places.get(node)
	if (nodeEnv === undefined) {
		return failure(node, env, 'not a node that can be edited')
	}

	let steps = 0
	let reason: { ast: AST; env: Env; message: string } | null = null
	const stop = (ast: AST, at: Env, message: string): null => {
		reason ??= { ast, env: at, message }
		return null
	}

	const merge = (all: readonly (Edits | null)[]): Edits | null => {
		const merged = new Map<LitAST, unknown>()
		for (const edits of all) {
			if (edits === null) return null
			for (const [literal, next] of edits) {
				if (merged.has(literal) && !same(merged.get(literal), next)) {
					return stop(literal, env, 'used in places that want different values')
				}
				merged.set(literal, next)
			}
		}
		return merged
	}

	const back = (ast: AST, at: Env, wanted: unknown, depth: number): Edits | null => {
		if (++steps > MAX_STEPS || depth > MAX_DEPTH) {
			return stop(ast, at, 'too far to work backward')
		}
		if (same(evaluate(ast, at).value, wanted)) return NOTHING
		const next = (child: AST, childEnv: Env, childWanted: unknown) =>
			back(child, childEnv, childWanted, depth + 1)

		switch (ast.kind) {
			case 'lit':
				if (!places.has(ast)) {
					return stop(ast, at, 'part of a function, which other calls share')
				}
				return typeof ast.value === typeof wanted
					? new Map([[ast, wanted]])
					: stop(ast, at, 'cannot hold that type of value')
			case 'meta':
				return isPinned(ast)
					? stop(ast, at, 'pinned')
					: next(ast.expr, at, wanted)
			case 'unquote':
				return next(ast.expr, at, wanted)
			case 'sym': {
				const target = lookupBareName(ast.name, at)
				return target === null
					? stop(ast, at, `unresolvable name: ${ast.name}`)
					: next(target.ast, target.env, wanted)
			}
			case 'path': {
				const target = pathTarget(ast.segments, at)
				return 'message' in target
					? stop(ast, at, target.message)
					: next(target.ast, target.env, wanted)
			}
			case 'let':
				return ast.body === null
					? stop(ast, at, 'has no value to change')
					: next(ast.body, pushLetFrame(ast, at), wanted)
			case 'vec': {
				if (!Array.isArray(wanted) || wanted.length !== ast.elements.length) {
					return stop(ast, at, 'cannot become a value of another shape')
				}
				if (ast.elements.some(element => element.kind === 'spread')) {
					return stop(ast, at, 'has a spread, so its elements are not its own')
				}
				const inside = enterNode(ast, at)
				return merge(ast.elements.map((e, i) => next(e, inside, wanted[i])))
			}
			case 'record': {
				const keys = isRecord(wanted) ? Object.keys(wanted) : null
				if (
					keys === null ||
					keys.length !== ast.fields.length ||
					ast.fields.some(f => f instanceof SpreadAST || !keys.includes(f[0]))
				) {
					return stop(ast, at, 'cannot become a value of another shape')
				}
				const inside = enterNode(ast, at)
				return merge(
					ast.fields.map(field => {
						const [key, child] = field as readonly [string, AST]
						return next(child, inside, (wanted as Record<string, unknown>)[key])
					})
				)
			}
			case 'access': {
				const target = evaluate(ast.target, at).value
				return isRecord(target)
					? next(ast.target, at, { ...target, [ast.key]: wanted })
					: stop(ast, at, 'not a field of a record')
			}
			case 'call':
				return backCall(ast, at, wanted, next)
			default:
				return stop(ast, at, 'cannot be worked backward')
		}
	}

	const backCall = (
		ast: CallAST,
		at: Env,
		wanted: unknown,
		next: (child: AST, childEnv: Env, childWanted: unknown) => Edits | null
	): Edits | null => {
		const inside = enterNode(ast, at)
		if (ast.head.kind === 'sym') {
			if (ast.head.name === ':') {
				const [expr] = ast.args
				return expr === undefined
					? stop(ast, at, 'has nothing to change')
					: next(expr, inside, wanted)
			}
			if (['?', '|>', 'overload'].includes(ast.head.name)) {
				return stop(ast, at, `cannot be worked backward through ${ast.head.name}`)
			}
		}
		if (desugar(ast).kind === 'fn') return stop(ast, at, 'is a function')
		if (ast.args.some(arg => arg.kind === 'spread')) {
			return stop(ast, at, 'has a spread, so its arguments are not its own')
		}

		const head = evaluate(ast.head, inside).value
		if (isGlispClosure(head)) {
			if (head.ast.body === null) return stop(ast, at, 'has no body')
			return next(head.ast.body, bodyEnv(head, ast, inside), wanted)
		}
		const inverse = isTypedHostFn(head) ? head.inverse : undefined
		if (inverse === undefined) return stop(ast, at, 'has no way back')

		const args = ast.args.map(arg => evaluate(arg, inside).value)
		for (const index of argumentOrder(ast.args)) {
			const needed = inverse(index, wanted, args)
			if (needed === undefined || !isUsable(needed)) continue
			const edits = next(ast.args[index]!, inside, needed)
			if (edits !== null) return edits
		}
		return stop(ast, at, 'no argument can make that value')
	}

	const edits = back(node, nodeEnv, value, 0)
	if (edits === null) {
		const { ast, env: at, message } = reason ?? { ast: node, env, message: 'no way' }
		return failure(ast, at, message)
	}
	if (edits.size === 0) return { ast: root, diagnostics: [] }

	const rebuilt = new Map<AST, AST>()
	const next = withEdits(root, edits, rebuilt)
	const after = placesIn(next, env).get(rebuilt.get(node) ?? node)
	const got = evaluate(rebuilt.get(node) ?? node, after ?? nodeEnv).value
	return same(got, value)
		? { ast: next, diagnostics: [] }
		: failure(node, nodeEnv, 'used in places that do not add up to that value')
}

function failure(ast: AST, env: Env, message: string): Solved {
	return {
		ast: null,
		diagnostics: [{ level: 'error', message, source: { ast, env } }],
	}
}

/** What a closure's body sees when called with these arguments as written. */
function bodyEnv(closure: GlispClosure, call: CallAST, callEnv: Env): Env {
	const bindings = new Map<string, { ast: AST; env: Env }>()
	closure.ast.params.forEach((param, i) => {
		const arg = call.kwargs?.get(param.name) ?? call.args[i]
		if (arg !== undefined) bindings.set(param.name, { ast: arg, env: callEnv })
	})
	return { ast: closure.ast, parent: closure.capturedEnv, bindings }
}

/**
 * Which argument to try changing first: a literal, as that changes nothing else,
 * and then a later one before an earlier one.
 */
function argumentOrder(args: readonly AST[]): number[] {
	const isLiteral = (arg: AST) =>
		(arg.kind === 'meta' ? !isPinned(arg) && arg.expr.kind === 'lit' : arg.kind === 'lit')
	const later = args.map((_, i) => args.length - 1 - i)
	return [
		...later.filter(i => isLiteral(args[i]!)),
		...later.filter(i => !isLiteral(args[i]!)),
	]
}

/**
 * The nodes of `root` that an edit can reach, with the env of each. A function
 * literal's insides are not among them, and neither is what `%` makes one of.
 */
function placesIn(root: AST, env: Env): Map<AST, Env> {
	const places = new Map<AST, Env>()
	const visit = (ast: AST, at: Env): void => {
		if (ast.kind !== 'fn' && desugar(ast).kind === 'fn') return
		places.set(ast, at)
		switch (ast.kind) {
			case 'let': {
				const inside = pushLetFrame(ast, at)
				for (const [, value] of ast.bindings) visit(value, inside)
				if (ast.body !== null) visit(ast.body, inside)
				return
			}
			case 'vec': {
				const inside = enterNode(ast, at)
				for (const element of ast.elements) visit(element, inside)
				return
			}
			case 'record': {
				const inside = enterNode(ast, at)
				for (const field of ast.fields) {
					visit(field instanceof SpreadAST ? field.expr : field[1], inside)
				}
				return
			}
			case 'call': {
				const inside = enterNode(ast, at)
				visit(ast.head, inside)
				for (const arg of ast.args) visit(arg, inside)
				for (const value of ast.kwargs?.values() ?? []) visit(value, inside)
				return
			}
			case 'meta':
			case 'unquote':
			case 'spread':
				return visit(ast.expr, at)
			case 'access':
				return visit(ast.target, at)
			default:
				return
		}
	}
	visit(root, env)
	return places
}

/** `ast` with the edits made, noting in `rebuilt` what became what. */
function withEdits(ast: AST, edits: Edits, rebuilt: Map<AST, AST>): AST {
	const go = (node: AST): AST => {
		const next = rebuild(node)
		if (next !== node) rebuilt.set(node, next)
		return next
	}
	const changed = (before: readonly AST[], after: readonly AST[]) =>
		after.some((node, i) => node !== before[i])
	const rebuild = (node: AST): AST => {
		switch (node.kind) {
			case 'lit':
				return edits.has(node) ? lit(edits.get(node) as never) : node
			case 'let': {
				const values = node.bindings.map(([, value]) => go(value))
				const body = node.body === null ? null : go(node.body)
				return body === node.body &&
					!changed(node.bindings.map(([, value]) => value), values)
					? node
					: new LetAST(
							node.bindings.map(([name], i) => [name, values[i]!] as const),
							body
						)
			}
			case 'vec': {
				const elements = node.elements.map(go)
				return changed(node.elements, elements) ? new VecAST(elements) : node
			}
			case 'record': {
				let kept = true
				const fields = node.fields.map(field => {
					if (field instanceof SpreadAST) return field
					const value = go(field[1])
					if (value === field[1]) return field
					kept = false
					return [field[0], value] as const
				})
				return kept ? node : new RecordAST(fields, node.optional)
			}
			case 'call': {
				const args = node.args.map(go)
				const kwargs =
					node.kwargs === undefined
						? undefined
						: new Map([...node.kwargs].map(([key, value]) => [key, go(value)]))
				const kept =
					!changed(node.args, args) &&
					[...(kwargs ?? [])].every(([key, value]) => value === node.kwargs?.get(key))
				return kept ? node : new CallAST(node.head, args, kwargs)
			}
			case 'meta': {
				const expr = go(node.expr)
				return expr === node.expr ? node : new MetaAST(node.metadata, expr)
			}
			case 'unquote': {
				const expr = go(node.expr)
				return expr === node.expr ? node : new UnquoteAST(expr)
			}
			case 'access': {
				const target = go(node.target)
				return target === node.target ? node : new AccessAST(target, node.key)
			}
			default:
				return node
		}
	}
	return go(ast)
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isUsable(value: unknown): boolean {
	return typeof value !== 'number' || Number.isFinite(value)
}

/** Whether two values are the same, allowing for what arithmetic rounds off. */
function same(a: unknown, b: unknown): boolean {
	if (a === b) return true
	if (typeof a === 'number' && typeof b === 'number') {
		return Math.abs(a - b) <= TOLERANCE * Math.max(1, Math.abs(a), Math.abs(b))
	}
	if (Array.isArray(a) && Array.isArray(b)) {
		return a.length === b.length && a.every((value, i) => same(value, b[i]))
	}
	if (isRecord(a) && isRecord(b)) {
		const keys = Object.keys(a)
		return (
			keys.length === Object.keys(b).length &&
			keys.every(key => key in b && same(a[key], b[key]))
		)
	}
	return false
}
