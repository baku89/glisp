/**
 * `%` desugaring pass — runs before eval.
 *
 * A node written with `#`, as `#(f a %)`, `#[% %]` or `#{x: %}`, is replaced
 * by an internal function-literal AST `(=> [x: _]: _ N)`, with every `%` in N
 * that is not in another `#` as `x`. The pass is bottom-up so that each `%`
 * belongs to the innermost `#` around it.
 *
 * Spec: docs/spec/syntax.md — Partial application — `%`
 *      docs/spec/eval.md — `%` — partial-application desugaring
 *
 * The parameter type `_` (top) is a placeholder; the type-inference pass is
 * expected to refine it from the surrounding context.
 */

import {
	type AST,
	LAMBDA,
	AccessAST,
	CallAST,
	FnAST,
	LetAST,
	MetaAST,
	RecordAST,
	type RecordEntry,
	SpreadAST,
	SymAST,
	UnquoteAST,
	VecAST,
} from './types.js'

const cache: WeakMap<AST, AST> = new WeakMap()

/**
 * Run the `%` desugaring pass on `ast`, returning the rewritten tree.
 * Idempotent — `desugar(desugar(x))` ≡ `desugar(x)`.
 */
export function desugar(ast: AST): AST {
	const cached = cache.get(ast)
	if (cached !== undefined) return cached
	const result = desugarBottomUp(ast)
	cache.set(ast, result)
	return result
}

function desugarBottomUp(ast: AST): AST {
	const transformed = recurseChildren(ast)
	if (transformed.kind !== 'meta' || transformed.metadata.get(LAMBDA) === undefined) return transformed
	const fn = wrapWithFn(transformed.expr)
	const others = transformed.metadata.fields.filter(f => 'kind' in f || f[0] !== LAMBDA)
	return others.length === 0 ? fn : new MetaAST(new RecordAST(others, transformed.metadata.optional), fn)
}

function isPercent(ast: AST): boolean {
	return ast.kind === 'sym' && ast.name === '%'
}

/** Recurse into children, returning a possibly-new AST with desugared subtrees. */
function recurseChildren(ast: AST, desugar: (child: AST) => AST = desugarChild): AST {
	switch (ast.kind) {
		case 'lit':
		case 'host':
		case 'sym':
		case 'path':
			return ast

		case 'call': {
			const head = desugar(ast.head)
			const args = ast.args.map(desugar)
			let kwargs = ast.kwargs
			if (kwargs !== undefined) {
				const newKwargs = new Map<string, AST>()
				let changed = false
				for (const [k, v] of kwargs) {
					const dv = desugar(v)
					if (dv !== v) changed = true
					newKwargs.set(k, dv)
				}
				if (changed) kwargs = newKwargs
			}
			if (
				head === ast.head &&
				sameArray(args, ast.args) &&
				kwargs === ast.kwargs
			) {
				return ast
			}
			return new CallAST(head, args, kwargs)
		}

		case 'access': {
			const target = desugar(ast.target)
			if (target === ast.target) return ast
			return new AccessAST(target, ast.key)
		}

		case 'vec': {
			const elements = ast.elements.map(desugar)
			if (sameArray(elements, ast.elements)) return ast
			return new VecAST(elements)
		}

		case 'record': {
			const fields: RecordEntry[] = []
			let changed = false
			for (const entry of ast.fields) {
				if (entry instanceof SpreadAST) {
					const inner = desugar(entry.expr)
					if (inner !== entry.expr) {
						fields.push(new SpreadAST(inner))
						changed = true
					} else {
						fields.push(entry)
					}
				} else {
					const dv = desugar(entry[1])
					if (dv !== entry[1]) {
						fields.push([entry[0], dv])
						changed = true
					} else {
						fields.push(entry)
					}
				}
			}
			if (!changed) return ast
			return new RecordAST(fields, ast.optional)
		}

		case 'let': {
			const bindings: Array<readonly [string, AST]> = []
			let changed = false
			for (const [n, v] of ast.bindings) {
				const dv = desugar(v)
				if (dv !== v) changed = true
				bindings.push([n, dv])
			}
			let body = ast.body
			if (body !== null) {
				const dbody = desugar(body)
				if (dbody !== body) changed = true
				body = dbody
			}
			if (!changed) return ast
			return new LetAST(bindings, body)
		}

		case 'fn': {
			// Desugar parameter types and body. Parameter names and the
			// generic list are left as-is (no `%` allowed there per spec).
			let changed = false
			const params = ast.params.map(p => {
				const t = desugar(p.type)
				if (t !== p.type) {
					changed = true
					return { ...p, type: t }
				}
				return p
			})
			const returnType = desugar(ast.returnType)
			if (returnType !== ast.returnType) changed = true
			let body = ast.body
			if (body !== null) {
				const db = desugar(body)
				if (db !== body) changed = true
				body = db
			}
			if (!changed) return ast
			return new FnAST(ast.generics, params, returnType, body)
		}

		case 'unquote': {
			const e = desugar(ast.expr)
			return e === ast.expr ? ast : new UnquoteAST(e)
		}
		case 'spread': {
			const e = desugar(ast.expr)
			return e === ast.expr ? ast : new SpreadAST(e)
		}

		case 'meta': {
			const md = desugar(ast.metadata) as RecordAST
			const ex = desugar(ast.expr)
			if (md === ast.metadata && ex === ast.expr) return ast
			return new MetaAST(md, ex)
		}
	}
}

function sameArray<T>(a: ReadonlyArray<T>, b: ReadonlyArray<T>): boolean {
	if (a === b) return true
	if (a.length !== b.length) return false
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
	return true
}

const desugarChild = (child: AST): AST => desugar(child)

function wrapWithFn(node: AST): FnAST {
	// The parameter name uses a leading `%` so it can't collide with any
	// user-written identifier (`%` is reserved as a token, not as part of
	// an identifier's body when used by itself). It is the same every time,
	// so the same source desugars to the same content. A nested `#` shadowing
	// it is harmless: what is in it has no `%` left, as it was desugared first.
	const paramName = '%1'
	return new FnAST(
		[],
		[{ name: paramName, type: new SymAST('_') }],
		new SymAST('_'),
		replacePercent(node, new SymAST(paramName))
	)
}

/** `node` with each `%` in it as `replacement`, all the way down. */
function replacePercent(node: AST, replacement: SymAST): AST {
	if (isPercent(node)) return replacement
	if (node.kind === 'fn') {
		// In a function written out, `%` can only be in what it does.
		if (node.body === null) return node
		const body = replacePercent(node.body, replacement)
		return body === node.body ? node : new FnAST(node.generics, node.params, node.returnType, body)
	}
	return recurseChildren(node, child => replacePercent(child, replacement))
}
