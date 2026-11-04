/**
 * What is on a canvas, from a program: no drawing in here. A shape's address is the
 * row it comes from, and where it is in that row's value. What moves it goes back
 * from there with `solve`.
 */

import {
	type AST,
	type Env,
	evaluate,
	infer,
	isHidden,
	readByName,
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

/** The handles of the row at `row`, with what each one moves. */
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
	const call = bare(node)
	if (call.kind !== 'call') return []
	const head = evaluate(call.head, nodeEnv).value
	const args = call.args.map(arg => evaluate(arg, nodeEnv).value)
	return handlesOf(head, args).flatMap(handle => {
		const arg = call.args[handle.arg]
		return arg === undefined ? [] : [{ ...handle, node: arg }]
	})
}
