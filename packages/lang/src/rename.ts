/**
 * Renaming a binding: an edit, so it makes a new AST, and what refers to the
 * binding by name follows along.
 */

import { desugar } from './desugar.js'
import { childAt } from './eval.js'
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
} from './types.js'

/** Whether `name` can name a binding: it has to read back as that symbol. */
export function isBindingName(name: string): boolean {
	if (name === '%') return false
	try {
		const ast = parse(name)
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
	/** A nearer `from` has it, so a `from` here is something else. */
	readonly hidden: boolean
	/** A nearer `to` has it, so a `from` renamed here would be caught. */
	readonly near: boolean
}

/**
 * `block`, with its binding `from` called `to`, and what refers to it following
 * along: by name, leaving alone what a nearer `from` shadows, and by path, which
 * shadowing does not touch. Null if it cannot be: it has no such binding, `to` is
 * not a name, is taken in the block, or something inside would catch a reference.
 */
export function renameBinding(
	block: LetAST,
	from: string,
	to: string
): LetAST | null {
	if (!isBindingName(to)) return null
	if (!block.bindings.some(([name]) => name === from)) return null
	if (from === to) return block
	if (block.bindings.some(([name]) => name === to)) return null

	let caught = false

	const within = (names: Names, binders: readonly string[]): Names => ({
		hidden: names.hidden || binders.includes(from),
		near: names.near || binders.includes(to),
	})

	/**
	 * The path, with the segment that lands on the binding renamed. It is followed
	 * as far as it can be without a signature, which a call's arguments need, and
	 * above the block it cannot come back to anything it can see.
	 */
	const renamePath = (path: PathAST, start: Scope): PathAST => {
		const segments = [...path.segments]
		let scope: Scope | null = start
		let here: AST = start.ast
		let entered = true
		for (const [i, segment] of path.segments.entries()) {
			if (segment === '..') {
				if (entered) scope = scope?.parent ?? null
				if (scope === null) break
				here = scope.ast
				entered = true
				continue
			}
			if (here === block && segment === from) segments[i] = to
			const child: AST | null =
				here.kind === 'call'
					? (here.kwargs?.get(String(segment)) ?? null)
					: childAt(here, segment, null)
			if (child === null) break
			if (!entered) scope = { ast: here, parent: scope }
			here = child
			entered = false
		}
		return segments.some((segment, i) => segment !== path.segments[i])
			? new PathAST(segments)
			: path
	}

	const go = (node: AST, names: Names, outer: Scope): AST => {
		// `%` makes the node the body of a function, which a path counts as a level.
		const sugar = node.kind === 'fn' ? node : desugar(node)
		const scope: Scope =
			sugar.kind === 'fn' && node.kind !== 'fn'
				? { ast: sugar, parent: outer }
				: outer
		const inside: Scope = { ast: node, parent: scope }

		switch (node.kind) {
			case 'sym':
				if (node.name !== from || names.hidden) return node
				if (names.near) caught = true
				return new SymAST(to)
			case 'path':
				return renamePath(node, scope)
			case 'call':
				return new CallAST(
					go(node.head, names, inside),
					node.args.map(arg => go(arg, names, inside)),
					node.kwargs === undefined
						? undefined
						: new Map(
								[...node.kwargs].map(([k, v]) => [k, go(v, names, inside)])
							)
				)
			case 'vec':
				return new VecAST(node.elements.map(e => go(e, names, inside)))
			case 'record':
				return new RecordAST(
					node.fields.map(field =>
						'kind' in field
							? new SpreadAST(go(field.expr, names, inside))
							: ([field[0], go(field[1], names, inside)] as const)
					),
					node.optional
				)
			case 'let': {
				const bound = within(
					names,
					node.bindings.map(([name]) => name)
				)
				return new LetAST(
					node.bindings.map(
						([name, value]) => [name, go(value, bound, inside)] as const
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

	const inside: Scope = { ast: block, parent: null }
	const names: Names = { hidden: false, near: false }
	const bindings = block.bindings.map(
		([name, value]) => [name === from ? to : name, go(value, names, inside)] as const
	)
	const body = block.body === null ? null : go(block.body, names, inside)
	return caught ? null : new LetAST(bindings, body)
}
