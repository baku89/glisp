/**
 * What is on a canvas, from a program: no drawing in here. A shape's address is the
 * row it comes from, and where it is in that row's value. What moves it goes back
 * from there with `solve`.
 */

import {
	type AST,
	enterNode,
	type Env,
	evaluate,
	infer,
	isHidden,
	lookupBareName,
	readByName,
	solve,
	type TypeValue,
	unwrapLazy,
} from '@glisp/lang'
import { type Slot, textOf, viewOf } from '@glisp/tweeq/structure'

import { type Handle, handlesOf } from './graphics'

export interface Shape {
	/** The row it comes from. */
	readonly row: string
	readonly draw: string
	readonly value: unknown
}

type Vec = readonly [number, number]

const bare = (ast: AST): AST => (ast.kind === 'meta' ? ast.expr : ast)

const drawOf = (type: TypeValue | null): string | null =>
	textOf(type?.meta?.get('draw'))

/** What in `value` is to be drawn, by what `type` says of it and what it holds. */
function shapesIn(type: TypeValue | null, value: unknown, row: string): Shape[] {
	const draw = drawOf(type)
	if (draw !== null) return [{ row, draw, value }]
	if (type === null || !Array.isArray(value)) return []
	const { shape } = unwrapLazy(type)
	const elementType = (i: number): TypeValue | null =>
		shape.kind === 'vector'
			? shape.element
			: shape.kind === 'tuple'
				? (shape.elements[i] ?? shape.rest ?? null)
				: null
	return value.flatMap((element, i) => shapesIn(elementType(i), element, row))
}

export function sceneOf(root: AST, env: Env): Shape[] {
	const visit = (slots: readonly Slot[], parent: string): Shape[] =>
		slots.flatMap(slot => {
			if (!slot.key.startsWith('binding:') || isHidden(slot.ast)) return []
			const row = parent === '' ? slot.key : `${parent}/${slot.key}`
			const node = bare(slot.ast)
			// A block with nothing to return is a group, and one with a Return gives
			// only that.
			if (node.kind === 'let' && node.body === null) {
				return visit(viewOf(node, slot.env).slots, row)
			}
			const value = evaluate(readByName(slot.ast), slot.env).value
			return shapesIn(infer(readByName(slot.ast), slot.env), value, row)
		})
	return visit(viewOf(root, env).slots, '')
}

/**
 * The handles of the row at `row`, with what each one moves. A row that only refers
 * to another has the handles of that one, as moving it can only mean moving that.
 */
export function handlesAt(
	root: AST,
	env: Env,
	row: string
): (Handle & { readonly node: AST })[] {
	let node = root
	let nodeEnv = env
	for (const key of row.split('/').filter(part => part !== '')) {
		const slot = viewOf(node, nodeEnv).slots.find(s => s.key === key)
		if (slot === undefined) return []
		node = slot.ast
		nodeEnv = slot.env
	}
	for (let reached = bare(node); reached.kind === 'sym'; reached = bare(node)) {
		const target = lookupBareName(reached.name, nodeEnv)
		if (target === null || target.ast === node) return []
		node = target.ast
		nodeEnv = target.env
	}
	const call = bare(node)
	if (call.kind !== 'call') return []
	const inside = enterNode(call, nodeEnv)
	const head = evaluate(call.head, inside).value
	const args = call.args.map(arg => evaluate(arg, inside).value)
	return handlesOf(head, args).flatMap(handle => {
		const arg = call.args[handle.arg]
		return arg === undefined ? [] : [{ ...handle, node: arg }]
	})
}

/** Where what moves with a shape is, to move it from. */
export function followersAt(root: AST, env: Env, row: string): (Vec | null)[] {
	return handlesAt(root, env, row).map(handle => (handle.follows ? handle.at : null))
}

/**
 * `root` with the shape at `row` moved by `delta` from where `from` says, each
 * handle in turn, as each edit makes a new program for the next. Null, with why, if
 * nothing moves.
 */
export function moved(
	root: AST,
	env: Env,
	row: string,
	from: readonly (Vec | null)[],
	delta: Vec
): { ast: AST | null; problem: string | null } {
	let next = root
	for (const [i, start] of from.entries()) {
		if (start === null) continue
		const handle = handlesAt(next, env, row)[i]
		if (handle === undefined) continue
		const { ast, diagnostics } = solve(
			next,
			env,
			handle.node,
			handle.wanted([start[0] + delta[0], start[1] + delta[1]])
		)
		if (ast === null) {
			return { ast: null, problem: diagnostics[0]?.message ?? 'cannot be moved' }
		}
		next = ast
	}
	return { ast: next, problem: null }
}
