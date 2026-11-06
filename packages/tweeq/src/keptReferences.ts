/**
 * What referred to something that has been taken away keeps the value it had, rather than
 * coming to nothing: the reference is written as that value, and an editor says that it has
 * been, for it to be undone if it is not wanted. Taking something away is an edit, so this is
 * too, and the program says all of it. What a person types away in code is left as they have it.
 */

import {
	type AST,
	type Env,
	evaluate,
	MetaAST,
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

/** `ast` as `value`, with what else was said of it. */
function frozen(ast: AST, value: unknown, env: Env): AST {
	const written = toAst(trimmed(value), env)
	return ast.kind === 'meta' ? new MetaAST(ast.metadata, written) : written
}

/** What `keptReferences` comes to: the program, and the rows in it now written as values. */
export interface Kept {
	readonly ast: AST
	readonly rows: readonly string[]
}

/**
 * `after`, which is `before` with something taken away, with each reference that that has
 * left with nothing to refer to written as what it came to in `before`. It is the whole of
 * the outermost row it is in that comes to a plain value, so that `(lerp a b 0.2)` is one
 * number, not a sum of numbers: and a row that comes to something else, such as a shape, is
 * gone into for that. A reference to what cannot be written so stays as it is.
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

	const changes: { path: string; ast: AST }[] = []
	const visit = (ast: AST, at: Env, path: string): void => {
		for (const slot of viewOf(ast, at).slots) {
			if (slot.absent) continue
			const here = path === '' ? slot.key : `${path}/${slot.key}`
			if (!hasBroken(slot.ast, slot.env)) continue
			// As it was, where it was: what it came to then.
			const was = reach(before, env, here)?.chain.at(-1)
			const value = was?.ast === slot.ast ? evaluate(readByName(was.ast), was.env).value : undefined
			if (value !== undefined && isPlain(value)) changes.push({ path: here, ast: frozen(slot.ast, value, slot.env) })
			else visit(slot.ast, slot.env, here)
		}
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
