/**
 * `%` desugaring pass — runs before eval.
 *
 * For any AST node N ∈ {Application, Vector, Record} that *directly*
 * contains a bare `sym('%')`, the entire N is replaced by an internal
 * function-literal AST `(=> (x: _) [N with all % → x])`. The pass is
 * bottom-up so that each `%` belongs to its smallest enclosing form.
 *
 * Spec: docs/spec/syntax.md — Partial application — `%`
 *      docs/spec/eval.md — `%` — partial-application desugaring
 *
 * The parameter type `_` (top) is a placeholder; the type-inference pass is
 * expected to refine it from the surrounding context.
 */

import {
	type AST,
	AccessAST,
	CallAST,
	FnAST,
	LetAST,
	MetaAST,
	QuoteAST,
	RecordAST,
	type RecordEntry,
	SpliceAST,
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
	if (directlyContainsPercent(transformed)) {
		return wrapWithFn(transformed)
	}
	return transformed
}

function isPercent(ast: AST): boolean {
	return ast.kind === 'sym' && ast.name === '%'
}

/** Recurse into children, returning a possibly-new AST with desugared subtrees. */
function recurseChildren(ast: AST): AST {
	switch (ast.kind) {
		case 'lit':
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

		case 'quote': {
			const e = desugar(ast.expr)
			return e === ast.expr ? ast : new QuoteAST(e)
		}
		case 'unquote': {
			const e = desugar(ast.expr)
			return e === ast.expr ? ast : new UnquoteAST(e)
		}
		case 'spread': {
			const e = desugar(ast.expr)
			return e === ast.expr ? ast : new SpreadAST(e)
		}
		case 'splice': {
			const e = desugar(ast.expr)
			return e === ast.expr ? ast : new SpliceAST(e)
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

/**
 * Does `ast` directly contain a `%` symbol as one of its enumerable
 * children? (Children of `%` themselves don't count — those are handled
 * recursively by `desugar`.)
 */
function directlyContainsPercent(ast: AST): boolean {
	switch (ast.kind) {
		case 'call':
			if (isPercent(ast.head)) return true
			for (const a of ast.args) if (isPercent(a)) return true
			if (ast.kwargs) {
				for (const v of ast.kwargs.values()) if (isPercent(v)) return true
			}
			return false
		case 'vec':
			for (const e of ast.elements) if (isPercent(e)) return true
			return false
		case 'record':
			for (const entry of ast.fields) {
				if (entry instanceof SpreadAST) {
					if (isPercent(entry.expr)) return true
				} else {
					if (isPercent(entry[1])) return true
				}
			}
			return false
		default:
			return false
	}
}

let percentParamCounter = 0

function wrapWithFn(node: AST): FnAST {
	// The parameter name uses a leading `%` so it can't collide with any
	// user-written identifier (`%` is reserved as a token, not as part of
	// an identifier's body when used by itself).
	const paramName = `%${++percentParamCounter}`
	const replaced = replacePercent(node, paramName)
	return new FnAST(
		[],
		[{ name: paramName, type: new SymAST('_') }],
		new SymAST('_'),
		replaced
	)
}

/**
 * Substitute every direct `sym('%')` child of `node` with `sym(paramName)`.
 * Children that are not directly `%` are left alone — those have already
 * been desugared into their own closures.
 */
function replacePercent(node: AST, paramName: string): AST {
	const replacement = new SymAST(paramName)
	switch (node.kind) {
		case 'call': {
			const head = isPercent(node.head) ? replacement : node.head
			const args = node.args.map(a => (isPercent(a) ? replacement : a))
			let kwargs = node.kwargs
			if (kwargs !== undefined) {
				const newKwargs = new Map<string, AST>()
				for (const [k, v] of kwargs) {
					newKwargs.set(k, isPercent(v) ? replacement : v)
				}
				kwargs = newKwargs
			}
			return new CallAST(head, args, kwargs)
		}
		case 'vec': {
			const elements = node.elements.map(e => (isPercent(e) ? replacement : e))
			return new VecAST(elements)
		}
		case 'record': {
			const fields: RecordEntry[] = []
			for (const entry of node.fields) {
				if (entry instanceof SpreadAST) {
					if (isPercent(entry.expr)) {
						fields.push(new SpreadAST(replacement))
					} else {
						fields.push(entry)
					}
				} else {
					if (isPercent(entry[1])) {
						fields.push([entry[0], replacement])
					} else {
						fields.push(entry)
					}
				}
			}
			return new RecordAST(fields, node.optional)
		}
		default:
			return node
	}
}
