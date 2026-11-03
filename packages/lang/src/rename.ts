/**
 * Renaming a binding: an edit, so it makes a new AST, and what refers to the
 * binding by name follows along.
 */

import { parse } from './parse.js'
import {
	AccessAST,
	type AST,
	CallAST,
	FnAST,
	LetAST,
	MetaAST,
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

/**
 * `ast`, with what refers to `from` in its scope referring to `to`, leaving alone
 * what a nearer `from` shadows. Null if a nearer `to` would catch one of them.
 */
function renameReferences(ast: AST, from: string, to: string): AST | null {
	let caught = false
	const go = (node: AST, shadowed: boolean): AST => {
		switch (node.kind) {
			case 'sym':
				if (node.name !== from) return node
				if (shadowed) caught = true
				return new SymAST(to)
			case 'call':
				return new CallAST(
					go(node.head, shadowed),
					node.args.map(arg => go(arg, shadowed)),
					node.kwargs === undefined
						? undefined
						: new Map([...node.kwargs].map(([k, v]) => [k, go(v, shadowed)]))
				)
			case 'vec':
				return new VecAST(node.elements.map(e => go(e, shadowed)))
			case 'record':
				return new RecordAST(
					node.fields.map(field =>
						'kind' in field
							? new SpreadAST(go(field.expr, shadowed))
							: ([field[0], go(field[1], shadowed)] as const)
					),
					node.optional
				)
			case 'let': {
				const names = node.bindings.map(([name]) => name)
				if (names.includes(from)) return node
				const inner = shadowed || names.includes(to)
				return new LetAST(
					node.bindings.map(([name, value]) => [name, go(value, inner)] as const),
					node.body === null ? null : go(node.body, inner)
				)
			}
			case 'fn': {
				const names = [...node.generics, ...node.params.map(p => p.name)]
				if (names.includes(from)) return node
				const inner = shadowed || names.includes(to)
				return new FnAST(
					node.generics,
					node.params.map(p => ({ ...p, type: go(p.type, inner) })),
					go(node.returnType, inner),
					node.body === null ? null : go(node.body, inner)
				)
			}
			case 'access':
				return new AccessAST(go(node.target, shadowed), node.key)
			case 'meta':
				return new MetaAST(node.metadata, go(node.expr, shadowed))
			case 'spread':
				return new SpreadAST(go(node.expr, shadowed))
			case 'unquote':
				return new UnquoteAST(go(node.expr, shadowed))
			default:
				return node
		}
	}
	const next = go(ast, false)
	return caught ? null : next
}

/**
 * `block`, with its binding `from` called `to`, and what refers to it by name
 * following along. Null if it cannot be: it has no such binding, `to` is not a
 * name, is taken in the block, or something inside would catch a reference.
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

	const bindings: (readonly [string, AST])[] = []
	for (const [name, value] of block.bindings) {
		const next = renameReferences(value, from, to)
		if (next === null) return null
		bindings.push([name === from ? to : name, next])
	}
	const body = block.body === null ? null : renameReferences(block.body, from, to)
	if (block.body !== null && body === null) return null
	return new LetAST(bindings, body)
}
