/**
 * What a pen does to what is already there, rather than drawing something new: a shape
 * made of points gets more of them, or fewer, and comes to what it then is. What its
 * points are written as stays, so that a point that refers to something still does.
 */

import { type AST, CallAST, type Env, evaluate, lit, MetaAST, parse, print, readByName, RecordAST, VecAST } from '@glisp/lang'
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

/**
 * What a pen can go on drawing from either end of: an open shape of points, as clicks draw, or
 * of anchors with handles, as drags do, `path.cubic` being two of those.
 */
interface Strand {
	readonly reached: NonNullable<ReturnType<typeof reach>>
	readonly last: NonNullable<ReturnType<typeof reach>>['chain'][number]
	readonly call: CallAST
	readonly kind: 'points' | 'anchors'
	/** What each anchor is written as, from the start, as it goes in `path.anchors`. */
	readonly anchors: readonly AST[]
	/** Where its two ends are. */
	readonly ends: readonly [Vec, Vec]
}

const isTrue = (ast: AST | undefined): boolean => ast !== undefined && bare(ast).kind === 'lit' && (bare(ast) as { value: unknown }).value === true

function strandAt(root: AST, env: Env, row: string): Strand | null {
	const points = pointsAt(root, env, row)
	if (points !== null) {
		const { reached, last, call, kind, places } = points
		if (kind === 'polygon' || places.length < 2) return null
		return { reached, last, call, kind: 'points', anchors: call.args, ends: [places[0]!, places.at(-1)!] }
	}
	const inside = paintedRow(root, env, row)
	const reached = reach(root, env, inside)
	const last = reached?.chain.at(-1)
	const call = last && bare(last.ast)
	if (!reached || !last || call?.kind !== 'call') return null
	const head = print(call.head)
	let anchors: readonly AST[]
	if (head === 'path.anchors') {
		const [list] = call.args
		if (list === undefined || bare(list).kind !== 'vec' || isTrue(call.kwargs?.get('closed'))) return null
		anchors = (bare(list) as VecAST).elements
	} else if (head === 'path.cubic' && call.args.length === 4) {
		const [from, out, into, to] = call.args as [AST, AST, AST, AST]
		anchors = [
			new RecordAST([['at', from], ['out', out]]),
			new RecordAST([['at', to], ['in', into]]),
		]
	} else {
		return null
	}
	const grip = gripAt(root, env, row)
	if (grip === null || grip.transform.join() !== '1,0,0,1,0,0') return null
	const { value } = evaluate(readByName(last.ast), last.env)
	const curve = (value as { path?: { curves?: readonly { closed: boolean; vertices: readonly { point: Vec }[] }[] } })?.path?.curves?.[0]
	if (curve === undefined || curve.closed || curve.vertices.length < 2) return null
	return { reached, last, call, kind: 'anchors', anchors, ends: [curve.vertices[0]!.point, curve.vertices.at(-1)!.point] }
}

/** Which end of the row a pen pressed at `at` would go on from, within `reach_` of it. */
export function penEndAt(root: AST, env: Env, row: string, at: Vec, reach_: number): { end: 'start' | 'end'; at: Vec } | null {
	const strand = strandAt(root, env, row)
	if (strand === null) return null
	const [start, end] = strand.ends
	if (distance(start, at) <= reach_) return { end: 'start', at: start }
	if (distance(end, at) <= reach_) return { end: 'end', at: end }
	return null
}

/**
 * `root`, with an anchor more at one end of the row: a point, where nothing is `pulled`, and
 * otherwise one that curves, by the way it was pulled out. Points stay points as long as they
 * can, and a curve put together with them is all of it a path of anchors, which goes straight
 * where it has no handles, as a polyline does.
 */
export function withAnchorAdded(
	root: AST,
	env: Env,
	row: string,
	end: 'start' | 'end',
	at: Vec,
	pulled: Vec | null,
	step = 0.01
): { ast: AST; row: string } | null {
	const strand = strandAt(root, env, row)
	if (strand === null) return null
	if (strand.kind === 'points' && pulled === null) {
		return withPointInserted(root, env, row, end === 'end' ? strand.anchors.length : 0, at, step)
	}
	// It is come into the way it is pulled away from, going on from the end it is put at.
	const back: Vec = pulled === null ? at : [at[0] * 2 - pulled[0], at[1] * 2 - pulled[1]]
	const added: AST =
		pulled === null
			? pointAst(at, step)
			: new RecordAST([
					['at', pointAst(at, step)],
					[end === 'end' ? 'in' : 'out', pointAst(back, step)],
				])
	const anchors = end === 'end' ? [...strand.anchors, added] : [added, ...strand.anchors]
	const next = new CallAST(parse('path.anchors'), [new VecAST(anchors)])
	const ast = withParent(strand.reached.chain, strand.last.replace(strand.last.ast.kind === 'meta' ? new MetaAST(strand.last.ast.metadata, next) : next))
	return { ast, row }
}

/** `root`, with the row going round from its end back to its start. */
export function withAnchorsClosed(root: AST, env: Env, row: string): { ast: AST; row: string } | null {
	const strand = strandAt(root, env, row)
	if (strand === null) return null
	if (strand.kind === 'points') return withPointsClosed(root, env, row)
	const next = new CallAST(parse('path.anchors'), [new VecAST(strand.anchors)], new Map([['closed', lit(true)]]))
	const ast = withParent(strand.reached.chain, strand.last.replace(strand.last.ast.kind === 'meta' ? new MetaAST(strand.last.ast.metadata, next) : next))
	return { ast, row }
}

/** An anchor as a pen puts it in a path: where it is, and the handles it comes in and goes out by. */
export interface PathAnchor {
	readonly at: Vec
	readonly in?: Vec
	readonly out?: Vec
}

/**
 * `root`, with `added` joined on at one end of the row, in the order they go in it: all before
 * its start, or all after its end, as what is drawn up to an end of something open goes on into
 * it. Points stay points, and anything curved makes all of it a path of anchors.
 */
export function withAnchorsJoined(
	root: AST,
	env: Env,
	row: string,
	end: 'start' | 'end',
	added: readonly PathAnchor[],
	step = 0.01
): { ast: AST; row: string } | null {
	const strand = strandAt(root, env, row)
	if (strand === null || added.length === 0) return null
	const curved = added.some(anchor => anchor.in !== undefined || anchor.out !== undefined)
	const join = (before: readonly AST[], more: readonly AST[]): AST[] => (end === 'end' ? [...before, ...more] : [...more, ...before])
	if (strand.kind === 'points' && !curved) {
		return withPoints(root, env, row, join(strand.anchors, added.map(({ at }) => pointAst(at, step))), false)
	}
	const written = added.map(({ at, in: into, out }): AST =>
		into === undefined && out === undefined
			? pointAst(at, step)
			: new RecordAST([
					['at', pointAst(at, step)],
					...(into === undefined ? [] : [['in', pointAst(into, step)] as const]),
					...(out === undefined ? [] : [['out', pointAst(out, step)] as const]),
				])
	)
	const next = new CallAST(parse('path.anchors'), [new VecAST(join(strand.anchors, written))])
	const ast = withParent(strand.reached.chain, strand.last.replace(strand.last.ast.kind === 'meta' ? new MetaAST(strand.last.ast.metadata, next) : next))
	return { ast, row }
}

/** Where an end of the row is, if it is open, for a pen going on from it to be drawn from there. */
export function endOf(root: AST, env: Env, row: string, end: 'start' | 'end'): Vec | null {
	const strand = strandAt(root, env, row)
	return strand === null ? null : strand.ends[end === 'start' ? 0 : 1]
}
