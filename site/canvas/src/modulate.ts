/**
 * What a pen does to what is already there, rather than drawing something new: a shape
 * made of points gets more of them, or fewer, and comes to what it then is. What its
 * points are written as stays, so that a point that refers to something still does.
 */

import { type AST, CallAST, type Env, lit, parse, print, VecAST } from '@glisp/lang'
import { reach, withParent } from '@glisp/tweeq/rowsClipboard'
import { renameBindingAt } from '@glisp/tweeq/structure'

import type { Vec } from './graphics'
import { gripAt, paintedRow, roundedTo } from './scene'

type PointsKind = 'line' | 'polyline' | 'polygon'

const KIND_OF_HEAD: Readonly<Record<string, PointsKind>> = {
	'path.line': 'line',
	'path.polyline': 'polyline',
	'path.polygon': 'polygon',
}

const bare = (ast: AST): AST => (ast.kind === 'meta' ? ast.expr : ast)

/** The shape of points that a row is, past any style, if it is one. */
function pointsAt(root: AST, env: Env, row: string) {
	const inside = paintedRow(root, env, row)
	const reached = reach(root, env, inside)
	const last = reached?.chain.at(-1)
	const call = last && bare(last.ast)
	if (!reached || !last || call?.kind !== 'call') return null
	const kind = KIND_OF_HEAD[print(call.head)]
	if (kind === undefined) return null
	const grip = gripAt(root, env, row)
	if (grip === null || grip.transform.join() !== '1,0,0,1,0,0') return null
	const places = grip.handles.flatMap(({ at, place }) =>
		at !== undefined && typeof place === 'number' ? [at] : []
	)
	return { reached, last, call, kind, places }
}

/** What a shape of this many points is. Null if it is too few to be anything. */
function kindFor(count: number, closed: boolean): PointsKind | null {
	if (count < 2) return null
	if (count === 2) return 'line'
	return closed ? 'polygon' : 'polyline'
}

/** What a press would do to a row, at a place on it. */
export type Modulation =
	| { readonly kind: 'insert'; readonly index: number; readonly at: Vec }
	| { readonly kind: 'remove'; readonly index: number; readonly at: Vec }
	| { readonly kind: 'continue'; readonly end: 'start' | 'end'; readonly at: Vec }

function nearestOnSegment(from: Vec, to: Vec, at: Vec): Vec {
	const [dx, dy] = [to[0] - from[0], to[1] - from[1]]
	const length = dx * dx + dy * dy
	const t =
		length === 0
			? 0
			: Math.min(1, Math.max(0, ((at[0] - from[0]) * dx + (at[1] - from[1]) * dy) / length))
	return [from[0] + dx * t, from[1] + dy * t]
}

const distance = (a: Vec, b: Vec): number => Math.hypot(a[0] - b[0], a[1] - b[1])

/** What a pen would do to the row at `row`, pressed at `at`, within `reach_` of it. */
export function modulationAt(
	root: AST,
	env: Env,
	row: string,
	at: Vec,
	reach_: number
): Modulation | null {
	const shape = pointsAt(root, env, row)
	if (shape === null) return null
	const { places, kind } = shape
	const closed = kind === 'polygon'

	for (const [index, place] of places.entries()) {
		if (distance(place, at) > reach_) continue
		if (!closed && index === 0) return { kind: 'continue', end: 'start', at: place }
		if (!closed && index === places.length - 1) return { kind: 'continue', end: 'end', at: place }
		return { kind: 'remove', index, at: place }
	}
	for (const [i, from] of places.entries()) {
		const to = places[i + 1] ?? (closed ? places[0] : undefined)
		if (to === undefined) continue
		const on = nearestOnSegment(from, to, at)
		if (distance(on, at) <= reach_) return { kind: 'insert', index: i + 1, at: on }
	}
	return null
}

/** `root`, with the row's points as given, as what that many of them is, and its new name. */
function withPoints(
	root: AST,
	env: Env,
	row: string,
	points: readonly AST[],
	closed: boolean
): { ast: AST; row: string } | null {
	const shape = pointsAt(root, env, row)
	const kind = kindFor(points.length, closed)
	if (shape === null || kind === null) return null
	const next = new CallAST(parse(`path.${kind}`), [...points])
	const ast = withParent(shape.reached.chain, shape.last.replace(next))
	return renamedFor(ast, env, row, shape.kind, kind)
}

/** A name that says what it was, says what it is now, as long as it was only that. */
function renamedFor(
	ast: AST,
	env: Env,
	row: string,
	was: PointsKind,
	now: PointsKind
): { ast: AST; row: string } {
	const name = /^binding:(.*)$/.exec(row)?.[1]
	if (was === now || name === undefined || !new RegExp(`^${was}\\d+$`).test(name)) {
		return { ast, row }
	}
	const taken = ast.kind === 'let' ? new Set(ast.bindings.map(([bound]) => bound)) : new Set()
	let n = 1
	while (taken.has(`${now}${n}`)) n++
	const renamed = renameBindingAt(ast, env, row, `${now}${n}`)
	return renamed ? { ast: renamed, row: `binding:${now}${n}` } : { ast, row }
}

const pointAst = ([x, y]: Vec, step: number): AST =>
	new VecAST([lit(roundedTo(x, step)), lit(roundedTo(y, step))])

/** `root`, with a point more in the row, before the one at `index`. */
export function withPointInserted(
	root: AST,
	env: Env,
	row: string,
	index: number,
	at: Vec,
	step = 0.01
): { ast: AST; row: string } | null {
	const shape = pointsAt(root, env, row)
	if (shape === null) return null
	const { args } = shape.call
	return withPoints(
		root,
		env,
		row,
		[...args.slice(0, index), pointAst(at, step), ...args.slice(index)],
		shape.kind === 'polygon'
	)
}

/** `root`, without the point at `index` of the row. Null if that leaves too few. */
export function withPointRemoved(
	root: AST,
	env: Env,
	row: string,
	index: number
): { ast: AST; row: string } | null {
	const shape = pointsAt(root, env, row)
	if (shape === null) return null
	return withPoints(
		root,
		env,
		row,
		shape.call.args.filter((_, i) => i !== index),
		shape.kind === 'polygon'
	)
}

/** `root`, with the row's points going round to where they began. */
export function withPointsClosed(
	root: AST,
	env: Env,
	row: string
): { ast: AST; row: string } | null {
	const shape = pointsAt(root, env, row)
	return shape === null ? null : withPoints(root, env, row, shape.call.args, true)
}
