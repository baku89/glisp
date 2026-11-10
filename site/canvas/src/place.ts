/**
 * A place on what is drawn as code: an expression in parts of the program, each a row it refers
 * to, which is worked out to where the place is, and written where something is to be there. It is
 * an AST all the way, so that what is made of places, and what is worked back from them, is put
 * together as code is, and not as text.
 *
 * What a primitive says of its places, as `PlaceCode`, is read once into one of these.
 */

import {
	type AST,
	CallAST,
	callParameters,
	enterNode,
	type Env,
	evaluate,
	isTypedHostFn,
	LitAST,
	MetaAST,
	parse,
	PathAST,
	print,
	SymAST,
	VecAST,
} from '@glisp/lang'
import { reach, withParent } from '@glisp/tweeq/rowsClipboard'
import { defaultFor, referenceAt } from '@glisp/tweeq/structure'

import type { PlaceCode } from './graphics'

/**
 * An expression in which each name of `parts` stands for a part of the program: a row, as a path
 * of slot keys from the root.
 */
export interface Place {
	readonly ast: AST
	readonly parts: ReadonlyMap<string, string>
}

let named = 0
/** A name for a part, which nothing in a program is called. */
const partName = (): string => `__part${named++}`

/** `code`, which works a place out from the parts at `of/...`, as a `Place`. */
export function placeOf(code: PlaceCode, of: string): Place {
	const parts = new Map<string, string>()
	const said = new Map<string, string>()
	const written = code(path => {
		const known = said.get(path)
		if (known !== undefined) return known
		const name = partName()
		said.set(path, name)
		parts.set(name, of === '' ? path : `${of}/${path}`)
		return name
	})
	return { ast: parse(written), parts }
}

/** The place that is all of the row at `row`, which is a point. */
export function pointAt(row: string): Place {
	const [x, y] = [partName(), partName()]
	return { ast: new VecAST([new SymAST(x), new SymAST(y)]), parts: new Map([[x, `${row}/0`], [y, `${row}/1`]]) }
}

/** What a place is across and down, if it says each of those apart. */
export function partsOf({ ast }: Place): readonly [AST, AST] | null {
	const bare = ast.kind === 'meta' ? ast.expr : ast
	return bare.kind === 'vec' && bare.elements.length === 2 ? [bare.elements[0]!, bare.elements[1]!] : null
}

/** `ast` with each name in `to` as what it says, where it is not the name of something else there. */
export function substituted(ast: AST, to: ReadonlyMap<string, AST>): AST {
	switch (ast.kind) {
		case 'sym':
			return to.get(ast.name) ?? ast
		case 'call':
			return new CallAST(substituted(ast.head, to), ast.args.map(arg => substituted(arg, to)), ast.kwargs)
		case 'vec':
			return new VecAST(ast.elements.map(element => substituted(element, to)))
		case 'meta':
			return new MetaAST(ast.metadata, substituted(ast.expr, to))
		default:
			return ast
	}
}

/** The names of parts that `ast` has in it, of those in `parts`. */
export function partsIn(ast: AST, parts: ReadonlyMap<string, string>): string[] {
	const found = new Set<string>()
	const visit = (node: AST): void => {
		if (node.kind === 'sym' && parts.has(node.name)) found.add(node.name)
		else if (node.kind === 'call') [node.head, ...node.args].forEach(visit)
		else if (node.kind === 'vec') node.elements.forEach(visit)
		else if (node.kind === 'meta') visit(node.expr)
	}
	visit(ast)
	return [...found]
}

const call = (op: string, ...args: AST[]): AST => new CallAST(new SymAST(op), args)
const isNumber = (ast: AST, n: number): boolean => ast.kind === 'lit' && ast.value === n

/** `ast`, without adding or taking away nothing, or going by one, as what is left of a place without a part of it says. */
export function simplified(ast: AST): AST {
	if (ast.kind === 'vec') return new VecAST(ast.elements.map(simplified))
	if (ast.kind !== 'call' || ast.head.kind !== 'sym' || ast.args.length !== 2) return ast
	const [a, b] = ast.args.map(simplified) as [AST, AST]
	const op = ast.head.name
	if (op === '+' && isNumber(b, 0)) return a
	if (op === '+' && isNumber(a, 0)) return b
	if (op === '-' && isNumber(b, 0)) return a
	if (op === '*' && isNumber(b, 1)) return a
	if (op === '*' && isNumber(a, 1)) return b
	if (op === '/' && isNumber(b, 1)) return a
	// Taking away what is taken from nothing is adding it, and the other way.
	if (op === '-' && b.kind === 'call' && b.head.kind === 'sym' && b.args.length === 2 && isNumber(b.args[0]!, 0)) {
		if (b.head.name === '-') return call('+', a, b.args[1]!)
		if (b.head.name === '+') return call('-', a, b.args[1]!)
	}
	return call(op, a, b)
}

/** `a` less `b`, saying no more than it has to. */
export const less = (a: AST, b: AST): AST => simplified(call('-', a, b))

/** `a` and `b`, `t` of the way from one to the other, or the one, if they are the same. */
export const between = (a: AST, b: AST, t: number): AST =>
	print(a) === print(b) ? a : call('lerp', a, b, new LitAST(t))

/** What the parts of `place` are now, by the rows they are of, as numbers where they are. */
export function valuesOfParts(root: AST, env: Env, given: ReadonlyMap<string, string>): Map<string, AST> | null {
	const values = new Map<string, AST>()
	const parts = keyedIn(root, env, given)
	for (const [name, path] of parts) {
		const slot = reach(root, env, path)?.chain.at(-1)
		const value = slot === undefined ? partOfWhole(root, env, path) : evaluate(slot.ast, slot.env).value
		if (typeof value !== 'number') return null
		values.set(name, new LitAST(value))
	}
	return values
}

/** The number at the end of `path`, of what is not written out to be reached part by part, as a vector that is a reference. */
function partOfWhole(root: AST, env: Env, path: string): unknown {
	const element = /^(.*)\/(\d+)$/.exec(path)
	const whole = element === null ? undefined : reach(root, env, element[1]!)?.chain.at(-1)
	const value = whole === undefined ? undefined : evaluate(whole.ast, whole.env).value
	return Array.isArray(value) ? value[Number(element![2])] : undefined
}

/** Where `place` is in `root`, worked out. */
export function whereIs(root: AST, env: Env, place: Place, at: Env = env): readonly [number, number] | null {
	const values = valuesOfParts(root, env, place.parts)
	if (values === null) return null
	const value = evaluate(substituted(place.ast, values), at).value
	return Array.isArray(value) && value.length === 2 && value.every(n => typeof n === 'number')
		? (value as [number, number])
		: null
}

/**
 * What the part `by` comes to, for `expr` to be `target`, the other parts being as they are: as
 * code, in the parts, by taking away what the rest of `expr` is and dividing by how much `by` adds.
 * Null if `expr` is not as much more for each more of `by`, as a vertex at an angle is not.
 */
export function solvedFor(
	expr: AST,
	by: string,
	target: AST,
	values: ReadonlyMap<string, AST>,
	env: Env
): AST | null {
	const at = (n: number): number | null => {
		const value = evaluate(substituted(expr, new Map([...values, [by, new LitAST(n)]])), env).value
		return typeof value === 'number' ? value : null
	}
	const [zero, one, two] = [at(0), at(1), at(2)]
	if (zero === null || one === null || two === null) return null
	const gain = one - zero
	if (Math.abs(gain) < 1e-12 || Math.abs(two - one - gain) > 1e-9 * Math.max(1, Math.abs(gain))) return null
	const rest = simplified(substituted(expr, new Map([[by, new LitAST(0)]])))
	if (Math.abs(gain - 1) < 1e-12) return less(target, rest)
	if (Math.abs(gain + 1) < 1e-12) return less(rest, target)
	return simplified(call('/', less(target, rest), new LitAST(Number(gain.toPrecision(12)))))
}

/** `path`, a relative one going out `depth` more levels, as one is that is that much further in. */
function deeper(path: PathAST, depth: number): PathAST {
	if (depth === 0 || path.segments[0] === '/') return path
	return new PathAST([...new Array<string>(depth).fill('..'), ...path.segments])
}

/**
 * `parts`, each path to an argument by where it is, `argN`, as it is written there: by its name,
 * `kw:name`, where it is given by name, as `(axes origin: [10 20])` gives its origin.
 */
function keyedIn(root: AST, env: Env, parts: ReadonlyMap<string, string>): ReadonlyMap<string, string> {
	if (![...parts.values()].some(path => /(^|\/)arg\d+(\/|$)/.test(path))) return parts
	return new Map([...parts].map(([name, path]) => [name, keyed(root, env, path)]))
}

function keyed(root: AST, env: Env, path: string): string {
	const keys = path.split('/')
	for (const [i, key] of keys.entries()) {
		const at = /^arg(\d+)$/.exec(key)
		if (at === null || i === 0) continue
		const within = keys.slice(0, i).join('/')
		const last = reach(root, env, within)?.chain.at(-1)
		const node = last && (last.ast.kind === 'meta' ? last.ast.expr : last.ast)
		if (!last || node?.kind !== 'call' || reach(root, env, `${within}/${key}`) !== null) continue
		const named = callParameters(node, enterNode(node, last.env))?.names[Number(at[1])]
		if (named !== undefined && reach(root, env, `${within}/kw:${named}`) !== null) keys[i] = `kw:${named}`
	}
	return keys.join('/')
}

/**
 * `root`, with what is at the row `source` being `ast`, each part in it a reference to the row it
 * is of, from where it is. Null if a part cannot be reached from there.
 */
export function writtenAt(root: AST, env: Env, source: string, ast: AST, given: ReadonlyMap<string, string>): AST | null {
	const written = (at: AST): AST | null => {
		const parts = keyedIn(at, env, given)
		const whole = asWholes(ast, parts)
		return (whole && writtenAtAsIs(at, env, source, whole.ast, whole.parts)) ?? writtenAtAsIs(at, env, source, ast, parts)
	}
	// What is left unsaid, to be what it is by default, cannot be referred to until it is said.
	const said = withUnsaidSaid(root, env, given)
	return written(root) ?? (said === null ? null : written(said))
}

/**
 * `root`, with each argument that `parts` go into, left unsaid, said as what it is by default:
 * as the origin of `(axes)` is, for a point there to refer to it. Null if there is none, or if one
 * has no default to say.
 */
function withUnsaidSaid(root: AST, env: Env, parts: ReadonlyMap<string, string>): AST | null {
	let next = root
	for (const path of new Set(parts.values())) {
		const keys = path.split('/')
		for (const [i, key] of keys.entries()) {
			const at = /^arg(\d+)$/.exec(key)
			if (at === null || i === 0) continue
			const within = keys.slice(0, i).join('/')
			if (reach(next, env, `${within}/${key}`) !== null || reach(next, env, keyed(next, env, `${within}/${key}`)) !== null) continue
			const reached = reach(next, env, within)
			const last = reached?.chain.at(-1)
			const call = last && (last.ast.kind === 'meta' ? last.ast.expr : last.ast)
			if (!reached || !last || call?.kind !== 'call') return null
			const index = Number(at[1])
			const head = evaluate(call.head, last.env).value
			const type = isTypedHostFn(head) ? head.paramTypes[index] : undefined
			const name = callParameters(call, enterNode(call, last.env))?.names[index]
			if (type?.default === undefined || name === undefined || index < call.args.length) return null
			// As the type says to write it, locked if it is, as the origin of the axes is.
			const value = defaultFor(type, last.env)
			// Said by its name, as what comes before it may be unsaid too.
			const added =
				index === call.args.length
					? new CallAST(call.head, [...call.args, value], call.kwargs)
					: new CallAST(call.head, call.args, new Map([...(call.kwargs ?? []), [name, value]]))
			next = withParent(reached.chain, last.replace(last.ast.kind === 'meta' ? new MetaAST(last.ast.metadata, added) : added))
			break
		}
	}
	return next === root ? null : next
}

/**
 * `ast`, with each place in it as much of the way from one point to another, said across and down
 * apart, as `vec2.lerp` of the two points, wherever it is: as it is in what casts it to a point.
 * Null if there is none.
 */
function asWholes(ast: AST, parts: ReadonlyMap<string, string>): Place | null {
	const all = new Map(parts)
	let found = false
	const fold = (node: AST): AST => {
		const whole = lerpOfWholes(node, parts)
		if (whole !== null) {
			found = true
			for (const [name, path] of whole.parts) all.set(name, path)
			return whole.ast
		}
		if (node.kind === 'call') return new CallAST(node.head, node.args.map(fold), node.kwargs)
		if (node.kind === 'vec') return new VecAST(node.elements.map(fold))
		if (node.kind === 'meta') return new MetaAST(node.metadata, fold(node.expr))
		return node
	}
	const next = fold(ast)
	return found ? { ast: next, parts: all } : null
}

/**
 * A place between two points, said across and down apart, as a call on the two points as wholes:
 * as much of the way from one to the other as `vec2.lerp`, whose ratio slides it along the line
 * through them, past either as well, or halfway as `vec2.midpoint`, which is `lerp` with its ratio given.
 * Where each point is a row.
 */
function lerpOfWholes(ast: AST, parts: ReadonlyMap<string, string>): Place | null {
	const bare = ast.kind === 'meta' ? ast.expr : ast
	if (bare.kind !== 'vec' || bare.elements.length !== 2) return null
	const [x, y] = bare.elements.map(betweenOf)
	if (!x || !y || x.t !== y.t) return null
	// The row both of a point's parts are of, across and down.
	const pointOf = (across: AST, down: AST): string | null => {
		if (across.kind !== 'sym' || down.kind !== 'sym') return null
		const [a, d] = [parts.get(across.name), parts.get(down.name)]
		if (a === undefined || d === undefined || !a.endsWith('/0') || !d.endsWith('/1')) return null
		const row = a.slice(0, -2)
		return d.slice(0, -2) === row ? row : null
	}
	const [from, to] = [pointOf(x.a, y.a), pointOf(x.b, y.b)]
	if (from === null || to === null) return null
	const [a, b] = [partName(), partName()]
	const ends = [new SymAST(a), new SymAST(b)]
	return {
		ast:
			x.t === 'middle'
				? new CallAST(parse('vec2.midpoint'), ends)
				: new CallAST(parse('vec2.lerp'), [...ends, new LitAST(x.t)]),
		parts: new Map([[a, from], [b, to]]),
	}
}

/** `(lerp a b t)`, with `t` a number, or `(/ (+ a b) 2)`, halfway, as what is between `a` and `b`. */
function betweenOf(ast: AST): { a: AST; b: AST; t: number | 'middle' } | null {
	if (ast.kind !== 'call' || ast.head.kind !== 'sym' || ast.args.length < 2) return null
	const [first, second, third] = ast.args
	if (ast.head.name === 'lerp' && third !== undefined && third.kind === 'lit' && typeof third.value === 'number') {
		return { a: first!, b: second!, t: third.value }
	}
	const by = second && (second.kind === 'meta' ? second.expr : second)
	if (ast.head.name === '/' && ast.args.length === 2 && by?.kind === 'lit' && by.value === 2) {
		const sum = first!
		if (sum.kind === 'call' && sum.head.kind === 'sym' && sum.head.name === '+' && sum.args.length === 2) {
			return { a: sum.args[0]!, b: sum.args[1]!, t: 'middle' }
		}
	}
	return null
}

function writtenAtAsIs(root: AST, env: Env, source: string, ast: AST, parts: ReadonlyMap<string, string>): AST | null {
	const references = new Map<string, AST>()
	for (const name of partsIn(ast, parts)) {
		const reference = referenceFrom(root, env, source, parts.get(name)!)
		if (reference === null) return null
		references.set(name, reference)
	}
	// What is further in than where it is written refers out from there.
	const placed = (node: AST, depth: number): AST => {
		if (node.kind === 'sym' && references.has(node.name)) return placedReference(references.get(node.name)!, depth)
		if (node.kind === 'call') return new CallAST(node.head, node.args.map(arg => placed(arg, depth + 1)), node.kwargs)
		if (node.kind === 'vec') return new VecAST(node.elements.map(element => placed(element, depth + 1)))
		if (node.kind === 'meta') return new MetaAST(node.metadata, placed(node.expr, depth))
		return node
	}
	const reached = reach(root, env, source)
	const last = reached?.chain.at(-1)
	if (!reached || !last) return null
	const next = placed(ast, 0)
	return withParent(reached.chain, last.replace(last.ast.kind === 'meta' ? new MetaAST(last.ast.metadata, next) : next))
}

/** A reference, written `depth` further in than where it refers from: a path in it, as in `(first p)`, further still. */
function placedReference(reference: AST, depth: number): AST {
	if (reference.kind === 'path') return deeper(reference, depth)
	if (reference.kind === 'call') return new CallAST(reference.head, reference.args.map(arg => placedReference(arg, depth + 1)), reference.kwargs)
	return reference
}

/**
 * A reference from the row `source` to the row `target`, as `referenceAt` writes it. A part of what
 * is not written out, as a vector that is a reference, is that much further along what that refers
 * to, which a path from the root says from anywhere.
 */
function referenceFrom(root: AST, env: Env, source: string, target: string): AST | null {
	const next = referenceAt(root, env, source, target)
	const reference = next && reach(next, env, source)?.chain.at(-1)?.ast
	if (reference) return reference.kind === 'meta' ? reference.expr : reference
	const element = /^(.*)\/(\d+)$/.exec(target)
	const whole = element === null ? undefined : reach(root, env, element[1]!)?.chain.at(-1)?.ast
	const bare = whole?.kind === 'meta' ? whole.expr : whole
	if (bare?.kind === 'path' && bare.segments[0] === '/') return new PathAST([...bare.segments, Number(element![2])])
	// Of a point that is worked out, or cast, there is nothing written to go in to: its two numbers
	// are its first and its last.
	const index = element === null ? null : Number(element[2])
	if (index !== 0 && index !== 1) return null
	const slot = reach(root, env, element![1]!)?.chain.at(-1)
	const value = slot && evaluate(slot.ast, slot.env).value
	if (!Array.isArray(value) || value.length !== 2) return null
	const referred = referenceAt(root, env, source, element![1]!)
	const toWhole = referred && reach(referred, env, source)?.chain.at(-1)?.ast
	if (!toWhole) return null
	return new CallAST(new SymAST(index === 0 ? 'first' : 'last'), [toWhole.kind === 'meta' ? toWhole.expr : toWhole])
}
