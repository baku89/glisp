/**
 * What referred to something that has been taken away keeps the value it had, rather than
 * coming to nothing: the reference is written as that value, and an editor says that it has
 * been, for it to be undone if it is not wanted. Taking something away is an edit, so this is
 * too, and the program says all of it. What a person types away in code is left as they have it.
 */

import {
	type AST,
	CallAST,
	type Env,
	evaluate,
	isCoerce,
	MetaAST,
	print,
	readByName,
	resolve,
	toAst,
} from '@glisp/lang'

import { reach, withParent } from './rowsClipboard'
import { viewOf } from './structure'

/** Only what can be written as it is: numbers, strings, booleans, and vectors and records of them. */
function isPlain(value: unknown): boolean {
	if (typeof value === 'number') return Number.isFinite(value)
	if (typeof value === 'string' || typeof value === 'boolean') return true
	if (Array.isArray(value)) return value.length > 0 && value.every(isPlain)
	if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
		const fields = Object.values(value)
		return fields.length > 0 && fields.every(isPlain)
	}
	return false
}

/** As many digits as say anything: what arithmetic leaves past those is not to be written. */
const DIGITS = 12

/** `value`, with its numbers as many digits long as they say anything. */
function trimmed(value: unknown): unknown {
	if (typeof value === 'number') return Number(value.toPrecision(DIGITS))
	if (Array.isArray(value)) return value.map(trimmed)
	if (value !== null && typeof value === 'object') {
		return Object.fromEntries(Object.entries(value).map(([key, field]) => [key, trimmed(field)]))
	}
	return value
}

/** `ast` as `value`, with what else was said of it, and what it is cast to, as `^point` is. */
function frozen(ast: AST, value: unknown, env: Env): AST {
	const written = toAst(trimmed(value), env)
	const bare = ast.kind === 'meta' ? ast.expr : ast
	const kept = isCoerce(bare) ? new CallAST(bare.head, [written, ...bare.args.slice(1)], bare.kwargs) : written
	return ast.kind === 'meta' ? new MetaAST(ast.metadata, kept) : kept
}

/** Whether `ast` only works out a number, or puts values together, and so is that as a whole. */
function isWorkedOut(ast: AST, value: unknown): boolean {
	const bare = ast.kind === 'meta' ? ast.expr : ast
	if (bare.kind === 'vec' || bare.kind === 'record') return true
	return bare.kind === 'call' && !isCoerce(bare) && typeof value === 'number'
}

/** What `keptReferences` comes to: the program, and the rows in it now written as values. */
export interface Kept {
	readonly ast: AST
	readonly rows: readonly string[]
}

/**
 * `after`, which is `before` with something taken away, with each reference that that has
 * left with nothing to refer to written as what it came to in `before`. It is the reference
 * itself that is, as nearly as it can be: `(vec2.lerp a b 0.2)` goes on being a lerp, of what
 * `b` was. What only works out a number from it, or puts it together with others, is what it came
 * to as a whole, so that `(+ b 1)` is one number, not a sum of numbers. Where the reference is not
 * a plain value, it is what holds it, out as far as one is. A reference to what cannot be written
 * so stays as it is.
 */
export function keptReferences(before: AST, after: AST, env: Env): Kept {
	// What cannot be found now, that could be: a name, or the start of a path.
	const lost = (ast: AST): Set<AST> =>
		new Set(resolve(ast, env).diagnostics.flatMap(({ level, source }) => (level === 'error' ? [source.ast] : [])))
	const already = lost(before)
	const broken = new Set([...lost(after)].filter(node => !already.has(node)))
	if (broken.size === 0) return { ast: after, rows: [] }
	const hasBroken = (ast: AST, at: Env): boolean =>
		resolve(ast, at).references.some(({ node }) => broken.has(node))

	let changes: { path: string; ast: AST }[] = []
	// Whether anything in it has been written as what it came to, the innermost first.
	const visit = (ast: AST, at: Env, path: string): boolean => {
		let kept = false
		for (const slot of viewOf(ast, at).slots) {
			if (slot.absent) continue
			const here = path === '' ? slot.key : `${path}/${slot.key}`
			if (!hasBroken(slot.ast, slot.env)) continue
			// As it was, where it was: what it came to then.
			const was = reach(before, env, here)?.chain.at(-1)
			const value = was !== undefined && print(was.ast) === print(slot.ast) ? evaluate(readByName(was.ast), was.env).value : undefined
			const plain = value !== undefined && isPlain(value)
			if (visit(slot.ast, slot.env, here)) {
				kept = true
				// Arithmetic, or what only puts values together, is what it comes to as a whole,
				// as `(+ a 1)` is one number: what is more than that goes on being what it is.
				if (!plain || !isWorkedOut(slot.ast, value)) continue
				changes = changes.filter(({ path: inside }) => !inside.startsWith(`${here}/`))
			} else if (!plain) {
				continue
			}
			changes.push({ path: here, ast: frozen(slot.ast, value, slot.env) })
			kept = true
		}
		return kept
	}
	visit(after, env, '')

	// The deepest first, so that what holds each is still where it was.
	const ast = changes
		.sort((a, b) => b.path.split('/').length - a.path.split('/').length)
		.reduce((next, { path, ast }) => {
			const reached = reach(next, env, path)
			const last = reached?.chain.at(-1)
			return reached && last ? withParent(reached.chain, last.replace(ast)) : next
		}, after)
	return { ast, rows: changes.map(({ path }) => path) }
}
