/**
 * Giving an expression a name, or another name, without changing what anything refers to.
 * See host-api.md (Editing) and syntax.md (Names).
 *
 * A name is seen from all that is in the node it stands in, so a name given there can catch
 * a bare name that meant something farther out. What it would catch becomes a path to what it
 * meant, as `../../x`, and what referred to it by its old name goes on referring to it.
 */

import { named, unnamed } from './build.js'
import { lookupBareName, namedChildrenOf } from './eval.js'
import { isBindingName } from './rename.js'
import {
	AccessAST,
	type AST,
	CallAST,
	type Env,
	FnAST,
	LetAST,
	MetaAST,
	nameOf,
	PathAST,
	RecordAST,
	type RecordEntry,
	SpreadAST,
	SymAST,
	UnquoteAST,
	VecAST,
	withoutMeta,
} from './types.js'

/**
 * `root`, with `node` in it named `name`: a binding of a let-block, or what is in a vector, a
 * call or a record. Null if it is not there, if `name` cannot be a name or is another's in the
 * same node, or if what it would catch cannot be reached by a path, as from inside a function or
 * what a host binds.
 */
export function withNamed(root: AST, env: Env, node: AST, name: string): AST | null {
	if (!isBindingName(name)) return null
	const chain = chainTo(root, node)
	// What has metadata on it stands where the metadata does.
	while (chain !== null && chain.length >= 2 && chain.at(-2)!.kind === 'meta') chain.pop()
	if (chain === null || chain.length < 2) return null
	const holder = chain.at(-2)!
	const child = chain.at(-1)!
	const old = nameIn(holder, child)
	if (old === name) return root
	if (namesIn(holder).some(([other, value]) => other === name && value !== child)) return null

	const replaced = new Map<AST, AST>()
	let refused = false
	// What is outside of `holder`, from the nearest: where a caught name is looked for.
	const around = chain.slice(0, -2).reverse()

	const visit = (ast: AST, levels: readonly AST[], shadowed: boolean, followed: boolean, inFn: boolean): void => {
		if (ast.kind === 'sym') {
			if (ast.name === name && !shadowed) {
				const path = pathOut(ast.name, levels, inFn)
				if (path === null) refused = true
				else if (path !== undefined) replaced.set(ast, path)
			}
			if (old !== null && ast.name === old && followed) {
				// Under something else of that name, it goes by a path to what it referred to.
				const within = levels.length - levels.indexOf(holder) - 1
				const caught = shadowed && ast.name !== name
				if (caught && inFn) refused = true
				else replaced.set(ast, caught ? new PathAST([...new Array<'..'>(within).fill('..'), name]) : new SymAST(name))
			}
			return
		}
		const bare = withoutMeta(ast)
		if (bare !== ast) {
			visit(bare, levels, shadowed, followed, inFn)
			return
		}
		const bound = bindersOf(ast)
		const nextShadowed = shadowed || (ast !== holder && bound.includes(name))
		const nextFollowed = followed && (old === null || ast === holder || !bound.includes(old))
		const isLevel = ast.kind === 'let' || ast.kind === 'vec' || ast.kind === 'call' || ast.kind === 'record'
		const inner = isLevel ? [...levels, ast] : levels
		for (const each of childrenOf(ast)) visit(each, inner, nextShadowed, nextFollowed, inFn || ast.kind === 'fn')
	}

	/**
	 * A path from where `levels` ends to what `name` meant from outside of `holder`, null if no path
	 * reaches it, or undefined if it meant nothing, which it may go on meaning.
	 */
	const pathOut = (name: string, levels: readonly AST[], inFn: boolean): PathAST | null | undefined => {
		const within = levels.length - levels.indexOf(holder) - 1
		for (const [i, outer] of around.entries()) {
			const at = withoutMeta(outer)
			if (at.kind === 'fn' && at.params.some(p => p.name === name || at.generics.includes(name))) return null
			if (!bindersOf(at).includes(name)) continue
			if (inFn || around.slice(0, i).some(each => withoutMeta(each).kind === 'fn')) return null
			const climbs = within + 1 + around.slice(0, i).filter(isLevelNode).length
			return new PathAST([...new Array<'..'>(climbs).fill('..'), name])
		}
		return lookupBareName(name, env) === null ? undefined : null
	}

	visit(holder, chain.slice(0, -2).map(withoutMeta).filter(isLevelNode), false, true, false)
	return refused ? null : rebuilt(root, replaced, holder, child, name)
}

const isLevelNode = (ast: AST): boolean =>
	ast.kind === 'let' || ast.kind === 'vec' || ast.kind === 'call' || ast.kind === 'record'

/** The nodes from `root` down to `node`, metadata included where it is written. */
function chainTo(root: AST, node: AST): AST[] | null {
	if (root === node) return [root]
	for (const child of childrenOf(root)) {
		const below = chainTo(child, node)
		if (below !== null) return [root, ...below]
	}
	return null
}

/** What is directly in `ast`, in the order it is written. */
export function childrenOf(ast: AST): AST[] {
	switch (ast.kind) {
		case 'call':
			return [ast.head, ...ast.args, ...(ast.kwargs?.values() ?? [])]
		case 'vec':
			return [...ast.elements]
		case 'record':
			return ast.fields.map(field => ('kind' in field ? field : field[1]))
		case 'let':
			return [...ast.bindings.map(([, value]) => value), ...(ast.body === null ? [] : [ast.body])]
		case 'fn':
			return ast.body === null ? [] : [ast.body]
		case 'meta':
			return [ast.expr]
		case 'unquote':
		case 'spread':
			return [ast.expr]
		case 'access':
			return [ast.target]
		default:
			return []
	}
}

/** The names `ast` binds for what is in it. */
function bindersOf(ast: AST): string[] {
	if (ast.kind === 'fn') return [...ast.params.map(p => p.name), ...ast.generics]
	return namedChildrenOf(ast).map(([name]) => name)
}

function namesIn(holder: AST): ReadonlyArray<readonly [string, AST]> {
	return namedChildrenOf(withoutMeta(holder))
}

/** The name `child` has in `holder`, if any. */
function nameIn(holder: AST, child: AST): string | null {
	const bare = withoutMeta(holder)
	if (bare.kind === 'let') return bare.bindings.find(([, value]) => value === child)?.[0] ?? null
	return nameOf(child)
}

/** `ast` with the nodes in `replaced` replaced, the binding of `child` in `holder` renamed. */
function rebuilt(ast: AST, replaced: ReadonlyMap<AST, AST>, holder: AST, child: AST, name: string): AST {
	const isBinding = withoutMeta(holder).kind === 'let'
	const go = (node: AST): AST => {
		const instead = replaced.get(node)
		if (instead !== undefined) return instead
		const next = mapped(node, go)
		// A binding is named by the block, and anything else by what is on it.
		if (node === child) return isBinding ? next : named(name, unnamed(next))
		if (node.kind === 'let' && withoutMeta(holder) === node) {
			const block = next as LetAST
			const index = node.bindings.findIndex(([, value]) => value === child)
			const bindings = block.bindings.map(([bound, value], i) => [i === index ? name : bound, value] as const)
			// The last of it, given a name, is its last binding.
			if (index === -1 && node.body === child) return new LetAST([...bindings, [name, block.body!]], null)
			return new LetAST(bindings, block.body)
		}
		return next
	}
	return go(ast)
}

/** `ast` with each of what is directly in it gone through `go`, itself if nothing changed. */
/** `root`, with each node in `replaced` replaced, and what is unchanged staying as it is. */
export function withReplaced(root: AST, replaced: ReadonlyMap<AST, AST>): AST {
	if (replaced.size === 0) return root
	const go = (node: AST): AST => replaced.get(node) ?? mapped(node, go)
	return go(root)
}

function mapped(ast: AST, go: (ast: AST) => AST): AST {
	const all = (list: readonly AST[]) => {
		const next = list.map(go)
		return next.every((each, i) => each === list[i]) ? null : next
	}
	switch (ast.kind) {
		case 'call': {
			const head = go(ast.head)
			const args = all(ast.args)
			const kwargs = ast.kwargs && [...ast.kwargs].map(([key, value]) => [key, go(value)] as const)
			const kwargsSame = kwargs === undefined || kwargs.every(([key, value]) => ast.kwargs!.get(key) === value)
			if (head === ast.head && args === null && kwargsSame) return ast
			return new CallAST(head, args ?? [...ast.args], kwargs && new Map(kwargs))
		}
		case 'vec': {
			const elements = all(ast.elements)
			return elements === null ? ast : new VecAST(elements)
		}
		case 'record': {
			const fields = ast.fields.map((field): RecordEntry =>
				'kind' in field ? (go(field) as SpreadAST) : [field[0], go(field[1])]
			)
			const same = fields.every((field, i) => {
				const was = ast.fields[i]!
				return 'kind' in field ? field === was : !('kind' in was) && field[1] === was[1]
			})
			return same ? ast : new RecordAST(fields, ast.optional)
		}
		case 'let': {
			const values = all(ast.bindings.map(([, value]) => value))
			const body = ast.body === null ? null : go(ast.body)
			if (values === null && body === ast.body) return ast
			return new LetAST(
				ast.bindings.map(([name, value], i) => [name, values?.[i] ?? value] as const),
				body
			)
		}
		case 'fn': {
			if (ast.body === null) return ast
			const body = go(ast.body)
			return body === ast.body ? ast : new FnAST(ast.generics, ast.params, ast.returnType, body)
		}
		case 'meta': {
			const expr = go(ast.expr)
			return expr === ast.expr ? ast : new MetaAST(ast.metadata, expr)
		}
		case 'unquote': {
			const expr = go(ast.expr)
			return expr === ast.expr ? ast : new UnquoteAST(expr)
		}
		case 'spread': {
			const expr = go(ast.expr)
			return expr === ast.expr ? ast : new SpreadAST(expr)
		}
		case 'access': {
			const target = go(ast.target)
			return target === ast.target ? ast : new AccessAST(target, ast.key)
		}
		default:
			return ast
	}
}
