/**
 * Renaming a binding: an edit, so it makes a new AST, and what refers to the
 * binding by name follows along.
 */

import { desugar } from './desugar.js'
import { childAt, isKeySegment, keyOfSegment, namedChildrenOf } from './eval.js'
import { writtenName } from './lex.js'
import { parse } from './parse.js'
import {
	AccessAST,
	type AST,
	CallAST,
	FnAST,
	LetAST,
	MetaAST,
	PathAST,
	RecordAST,
	SpreadAST,
	SymAST,
	UnquoteAST,
	VecAST,
	withoutMeta,
} from './types.js'

/**
 * Whether `name` can name a binding: written, with `\\` where it needs one, it reads back as that
 * symbol, and a path can go to it. A name that a segment of a path is spelled as, as `..` or
 * `width:`, cannot be one.
 */
export function isBindingName(name: string): boolean {
	if (name === '%' || name === '/' || name === '..' || name.endsWith(':')) return false
	try {
		const ast = parse(writtenName(name))
		return ast.kind === 'sym' && ast.name === name
	} catch {
		return false
	}
}

/** A node a path can climb to, as `resolve` walks them. */
interface Scope {
	readonly ast: AST
	readonly parent: Scope | null
}

/** What a name means where a walk has got to. */
interface Names {
	/** A `from` here is something else: a nearer one's, or outside the block. */
	readonly hidden: boolean
	/** A `to` here is nearer than the block's new one, or outside the block. */
	readonly near: boolean
}

const OUTSIDE: Names = { hidden: true, near: true }
const IN_BLOCK: Names = { hidden: false, near: false }

/**
 * `block`, with its binding `from` called `to`, and what refers to it following
 * along. See `renameBindingIn`.
 */
export function renameBinding(
	block: LetAST,
	from: string,
	to: string
): LetAST | null {
	return renameBindingIn(block, block, from, to) as LetAST | null
}

/**
 * `root`, with the binding `from` of `block`, a let-block somewhere in it, called
 * `to`, and what refers to it following along: names inside the block, leaving
 * alone what a nearer `from` shadows, and paths from anywhere in `root`, which
 * shadowing does not touch. What is unchanged stays `===`.
 *
 * Null if it cannot be: `block` has no such binding or is not in `root`, `to` is
 * not a name or is taken in the block, a nearer `to` would catch a reference, or
 * the new name would catch a `to` inside that means something else.
 */
export function renameBindingIn(
	root: AST,
	block: LetAST,
	from: string,
	to: string
): AST | null {
	if (!isBindingName(to)) return null
	if (!block.bindings.some(([name]) => name === from)) return null
	if (from === to) return root
	if (block.bindings.some(([name]) => name === to)) return null
	return referredAs(root, block, from, to, false)
}

/**
 * `root`, with the binding `from` of `block` gone into the binding `into` of the same block: what
 * referred to `from` refers to `into`, by name and by path, as a rename has it, and `from` is no
 * longer there. Two names that came to the same thing are then one.
 *
 * Null if it cannot be: `block` does not have both, they are the same, or a nearer `into` would
 * catch a reference to `from`, which would then mean something else.
 */
export function mergeBindingIn(
	root: AST,
	block: LetAST,
	from: string,
	into: string
): AST | null {
	if (from === into) return null
	if (!block.bindings.some(([name]) => name === from)) return null
	if (!block.bindings.some(([name]) => name === into)) return null
	return referredAs(root, block, from, into, true)
}

/**
 * `root`, with what refers to the binding `from` of `block` referring to `to` instead: renamed,
 * or, `merging`, gone into the binding `to` of the block that is there already.
 */
function referredAs(
	root: AST,
	block: LetAST,
	from: string,
	to: string,
	merging: boolean
): AST | null {
	let caught = false
	let edits = 0
	let found = false

	const within = (names: Names, binders: readonly string[]): Names => ({
		hidden: names.hidden || binders.includes(from),
		near: names.near || binders.includes(to),
	})

	/**
	 * The path, with the segment that lands on the binding renamed. It is followed
	 * as far as it can be without a signature, which a call's positional arguments
	 * need, and above the root there is nothing it can see.
	 */
	const renamePath = (path: PathAST, start: Scope | null): PathAST => {
		if (start === null) return path
		const segments = [...path.segments]
		let scope: Scope | null = start
		let here: AST = start.ast
		let entered = true
		for (const [i, segment] of path.segments.entries()) {
			if (segment === '/') {
				while (scope?.parent) scope = scope.parent
				if (scope === null) break
				here = scope.ast
				entered = true
				continue
			}
			if (segment === '..') {
				if (entered) scope = scope?.parent ?? null
				if (scope === null) break
				here = scope.ast
				entered = true
				continue
			}
			here = withoutMeta(here)
			if (here === block && segment === from) segments[i] = to
			const child: AST | null =
				here.kind === 'call'
					? isKeySegment(segment)
						? (here.kwargs?.get(keyOfSegment(segment)) ?? null)
						: childAt(here, segment, null)
					: childAt(here, segment, null)
			if (child === null) break
			if (!entered) scope = { ast: here, parent: scope }
			here = child
			entered = false
		}
		if (segments.every((segment, i) => segment === path.segments[i])) return path
		edits++
		return new PathAST(segments)
	}

	const rebuild = (node: AST, names: Names, outer: Scope | null): AST => {
		// `%` makes the node the body of a function, which a path counts as a level.
		const sugar = node.kind === 'fn' ? node : desugar(node)
		const scope: Scope | null =
			sugar.kind === 'fn' && node.kind !== 'fn'
				? { ast: sugar, parent: outer }
				: outer
		const inside: Scope = { ast: node, parent: scope }
		// What has a name in a vector, a call or a record is seen from all that is in it.
		const here =
			node.kind === 'call' || node.kind === 'vec' || node.kind === 'record'
				? within(names, namedChildrenOf(node).map(([name]) => name))
				: names

		switch (node.kind) {
			case 'sym':
				// Merging, a `to` in the block already means the block's, as a `from` will.
				if (!merging && node.name === to && !names.near) caught = true
				if (node.name !== from || names.hidden) return node
				if (names.near) caught = true
				edits++
				return new SymAST(to)
			case 'path':
				return renamePath(node, scope)
			case 'call':
				return new CallAST(
					go(node.head, here, inside),
					node.args.map(arg => go(arg, here, inside)),
					node.kwargs === undefined
						? undefined
						: new Map(
								[...node.kwargs].map(([k, v]) => [k, go(v, here, inside)])
							)
				)
			case 'vec':
				return new VecAST(node.elements.map(e => go(e, here, inside)))
			case 'record':
				return new RecordAST(
					node.fields.map(field =>
						'kind' in field
							? new SpreadAST(go(field.expr, here, inside))
							: ([field[0], go(field[1], here, inside)] as const)
					),
					node.optional
				)
			case 'let': {
				if (node === block) {
					found = true
					edits++
				}
				const bound =
					node === block
						? IN_BLOCK
						: within(
								names,
								node.bindings.map(([name]) => name)
							)
				return new LetAST(
					node.bindings
						.filter(([name]) => !(merging && node === block && name === from))
						.map(
							([name, value]) =>
								[
									node === block && name === from ? to : name,
									go(value, bound, inside),
								] as const
						),
					node.body === null ? null : go(node.body, bound, inside)
				)
			}
			case 'fn': {
				// A parameter's type is read before any argument is bound.
				const typeNames = within(names, node.generics)
				const typeScope = node.generics.length > 0 ? inside : scope
				const bodyNames = within(
					typeNames,
					node.params.map(p => p.name)
				)
				return new FnAST(
					node.generics,
					node.params.map(p => ({
						...p,
						type: go(p.type, typeNames, typeScope),
					})),
					go(node.returnType, typeNames, typeScope),
					node.body === null ? null : go(node.body, bodyNames, inside)
				)
			}
			case 'access':
				return new AccessAST(go(node.target, names, scope), node.key)
			case 'meta':
				return new MetaAST(
					go(node.metadata, names, scope) as RecordAST,
					go(node.expr, names, scope)
				)
			case 'spread':
				return new SpreadAST(go(node.expr, names, scope))
			case 'unquote':
				return new UnquoteAST(go(node.expr, names, scope))
			default:
				return node
		}
	}

	const go = (node: AST, names: Names, outer: Scope | null): AST => {
		const before = edits
		const next = rebuild(node, names, outer)
		return edits === before ? node : next
	}

	const next = go(root, OUTSIDE, null)
	return caught || !found ? null : next
}
