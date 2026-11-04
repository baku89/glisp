/**
 * What a canvas adds to the language: `path`, from pave, and `vec2` and `point`,
 * from linearly. Types have members, so that `path` is what a path is as well as
 * where the functions on them are.
 */

import {
	type AST,
	buildPrelude,
	type Env,
	evaluate,
	host,
	LetAST,
	lit,
	makeTupleType,
	makeType,
	makeTypedFn,
	parse,
	RecordAST,
	type TypeValue,
	withMembers,
	withTypeMeta,
} from '@glisp/lang'
import { vec2 as Vec2 } from 'linearly'
import { bounds } from 'pave/path/metrics'
import { transform } from 'pave/path/modifiers'
import { circle, rectangle } from 'pave/path/primitives'
import { toD } from 'pave/path/svg'

const said = (type: TypeValue, draw: string, icon: string): TypeValue =>
	withTypeMeta(
		type,
		new RecordAST([
			['draw', lit(draw)],
			['icon', lit(icon)],
		])
	)

const number = evaluate(parse('number'), buildPrelude()).value as TypeValue

type Vec = readonly [number, number]

const vec2 = makeTupleType([number, number])
withMembers(vec2, {
	add: makeTypedFn([vec2, vec2], vec2, (a, b) => Vec2.add(a as Vec, b as Vec), ['a', 'b']),
	sub: makeTypedFn([vec2, vec2], vec2, (a, b) => Vec2.sub(a as Vec, b as Vec), ['a', 'b']),
	scale: makeTypedFn(
		[vec2, number],
		vec2,
		(a, s) => Vec2.scale(a as Vec, s as number),
		['a', 'by']
	),
})

/** Not every vec2 is a point: a size is not to be drawn. */
const point = said(vec2, 'point', 'mdi:circle-small')

export function isPath(value: unknown): boolean {
	return (
		typeof value === 'object' &&
		value !== null &&
		Array.isArray((value as { curves?: unknown }).curves)
	)
}

/** How much of an icon's 24 a shape takes up, leaving room for its line. */
const ICON_EXTENT = 18

/** A path's own shape, fit into an icon, or null if it is not a path with a size. */
export function iconOfPath(value: unknown): string | null {
	if (!isPath(value)) return null
	const path = value as Parameters<typeof bounds>[0]
	const [[left, top], [right, bottom]] = bounds(path)
	const size = Math.max(right - left, bottom - top)
	if (!Number.isFinite(size) || size === 0) return null
	const scale = ICON_EXTENT / size
	const fit: [number, number, number, number, number, number] = [
		scale,
		0,
		0,
		scale,
		12 - (scale * (left + right)) / 2,
		12 - (scale * (top + bottom)) / 2,
	]
	return `stroke:${toD(transform(path, fit))}`
}

const pathType = said(makeType('path', isPath, { curves: [] }), 'path', 'mdi:vector-curve')

const makeCircle = makeTypedFn(
	[point, number],
	pathType,
	(center, radius) => circle(center as Vec, radius as number),
	['center', 'radius']
)
const makeRect = makeTypedFn(
	[point, point],
	pathType,
	(start, end) => rectangle(start as Vec, end as Vec),
	['start', 'end']
)
withMembers(pathType, { circle: makeCircle, rect: makeRect })

/** A place on a canvas to take hold of an argument of a call. */
export interface Handle {
	/** Which argument it moves. */
	readonly arg: number
	readonly at: Vec
	/** What the argument would be, for the handle to be at `to`. */
	wanted(to: Vec): unknown
}

const handleMakers = new Map<unknown, (args: readonly unknown[]) => Handle[]>([
	[
		makeCircle,
		([center, radius]) => {
			const c = center as Vec
			const r = radius as number
			return [
				{ arg: 0, at: c, wanted: to => to },
				{
					arg: 1,
					at: [c[0] + r, c[1]],
					wanted: to => Math.hypot(to[0] - c[0], to[1] - c[1]),
				},
			]
		},
	],
	[
		makeRect,
		([start, end]) => [
			{ arg: 0, at: start as Vec, wanted: to => to },
			{ arg: 1, at: end as Vec, wanted: to => to },
		],
	],
])

export const handlesOf = (fn: unknown, args: readonly unknown[]): Handle[] =>
	handleMakers.get(fn)?.(args) ?? []

const BINDINGS: Readonly<Record<string, unknown>> = { path: pathType, vec2, point }

/** `parent`, with what a canvas adds. */
export function withGraphics(parent: Env): Env {
	const bindings = new Map<string, { ast: AST; env: Env }>()
	for (const [name, value] of Object.entries(BINDINGS)) {
		bindings.set(name, { ast: host(value), env: null })
	}
	return { ast: new LetAST([], null), parent, bindings }
}
