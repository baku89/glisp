/**
 * What a canvas adds to the language: `path`, from pave, and `vec2`, `point` and
 * `mat2d`, from linearly. Types have members, so that `path` is what a path is as
 * well as where the functions on them are.
 */

import {
	AS_SOURCE,
	type AST,
	buildPrelude,
	CallAST,
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
	UNSET,
	toAst,
	VecAST,
	withDoc,
	withExpansion,
	withMembers,
	withTypeMeta,
} from '@glisp/lang'
import { mat2d as Mat2d, vec2 as Vec2 } from 'linearly'
import { bounds } from 'pave/path/metrics'
import { transform } from 'pave/path/modifiers'
import {
	arc,
	circle,
	cubicBezier,
	ellipse,
	line,
	polygon,
	polyline,
	rectangle,
	regularPolygon,
} from 'pave/path/primitives'
import { fromD, toD } from 'pave/path/svg'

const said = (type: TypeValue, draw: string, icon: string): TypeValue =>
	withTypeMeta(
		type,
		new RecordAST([
			['draw', lit(draw)],
			['icon', lit(icon)],
		])
	)

const number = evaluate(parse('number'), buildPrelude()).value as TypeValue

export type Path = Parameters<typeof transform>[0]
export type Vec = readonly [number, number]
export type Mat = readonly [number, number, number, number, number, number]

const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1]]
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]]
const dist = (a: Vec, b: Vec): number => Math.hypot(b[0] - a[0], b[1] - a[1])
const degrees = (v: Vec): number => (Math.atan2(v[1], v[0]) * 180) / Math.PI
const toward = (angle: number, length: number): Vec => {
	const radians = (angle * Math.PI) / 180
	return [Math.cos(radians) * length, Math.sin(radians) * length]
}
/** The same turn as `angle`, by the short way round. */
const shortest = (angle: number): number => ((((angle + 180) % 360) + 360) % 360) - 180

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

/** A number that has a part to play in a vector, which says so where it is shown. */
const part = (fields: readonly (readonly [string, string])[]): TypeValue =>
	withTypeMeta(number, new RecordAST(fields.map(([key, text]) => [key, lit(text)] as const)))

/** Not every vec2 is a point: a size is not to be drawn. */
const point = withTypeMeta(
	said(
		makeTupleType([
			part([
				['title', 'X'],
				['fieldIcon', 'char:X'],
			]),
			part([
				['title', 'Y'],
				['fieldIcon', 'char:Y'],
			]),
		]),
		'point',
		'mdi:circle-small'
	),
	new RecordAST([['input', lit('translate')]])
)

/** How far something goes each way. */
const size = makeTupleType([
	part([
		['title', 'Width'],
		['fieldIcon', 'ph:arrows-horizontal'],
	]),
	part([
		['title', 'Height'],
		['fieldIcon', 'ph:arrows-vertical'],
	]),
])

const mat2d = makeTupleType([number, number, number, number, number, number])
const makeTranslation = makeTypedFn(
	[vec2],
	mat2d,
	by => Mat2d.fromTranslation(by as Vec),
	['by']
)
const makeRotation = makeTypedFn(
	[number],
	mat2d,
	angle => Mat2d.fromRotation(angle as number),
	['angle']
)
const makeScaling = makeTypedFn([vec2], mat2d, by => Mat2d.fromScaling(by as Vec), ['by'])
const multiply = makeTypedFn(
	[],
	mat2d,
	(...matrices) =>
		(matrices as Mat[]).reduce<Mat>((a, b) => Mat2d.mul(a, b) as unknown as Mat, Mat2d.I as unknown as Mat),
	[],
	mat2d
)
withMembers(mat2d, {
	translate: withDoc(makeTranslation, 'A matrix that moves `by` this much.'),
	rotate: withDoc(makeRotation, 'A matrix that turns by `angle`, in degrees, around the origin.'),
	scale: withDoc(makeScaling, 'A matrix that scales `by` this much each way, from the origin.'),
	mul: withDoc(multiply, 'One matrix after another, the last applied first.'),
})

/**
 * A path, to the language: what is in it is pave's business, and could as well be in
 * WebAssembly. It is written as what it comes to, an SVG path's data.
 */
export class PathValue {
	constructor(readonly path: Path) {}

	[AS_SOURCE](): AST {
		return callOf('d', [lit(toD(this.path))])
	}
}

export const isPath = (value: unknown): value is PathValue => value instanceof PathValue

/** How much of an icon's 24 a shape takes up, leaving room for its line. */
const ICON_EXTENT = 18

/** A path's own shape, fit into an icon, or null if it is not a path with a size. */
export function iconOfPath(value: unknown): string | null {
	if (!isPath(value)) return null
	const { path } = value
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

const pathType = said(
	makeType('path', isPath, new PathValue({ curves: [] } as unknown as Path)),
	'path',
	'mdi:vector-curve'
)

/** A call to a member of `path`, as a next rung is written. */
const callOf = (member: string, args: readonly AST[]): AST =>
	new CallAST(parse(`path.${member}`), [...args])

const makeD = makeTypedFn(
	[evaluate(parse('string'), buildPrelude()).value as TypeValue],
	pathType,
	d => {
		try {
			return new PathValue(fromD(d as string))
		} catch {
			return pathType.default
		}
	},
	['d']
)

/** The rungs: each shape is said in terms of the more general one it is a case of. */
const makeEllipse = makeTypedFn(
	[point, size],
	pathType,
	(center, radius) => new PathValue(ellipse(center as Vec, radius as Vec)),
	['center', 'radius']
)
const makeCircle = withExpansion(
	makeTypedFn(
		[point, number],
		pathType,
		(center, radius) => new PathValue(circle(center as Vec, radius as number)),
		['center', 'radius']
	),
	([center, radius]) =>
		center === undefined || radius === undefined
			? null
			: callOf('ellipse', [center, new VecAST([radius, radius])])
)
const makePolyline = makeTypedFn(
	[],
	pathType,
	(...points) => new PathValue(polyline(...(points as Vec[]))),
	[],
	point
)
const makePolygon = makeTypedFn(
	[],
	pathType,
	(...points) => new PathValue(polygon(...(points as Vec[]))),
	[],
	point
)
const makeRect = withExpansion(
	makeTypedFn(
		[point, size],
		pathType,
		(topLeft, extent) =>
			new PathValue(rectangle(topLeft as Vec, add(topLeft as Vec, extent as Vec))),
		['topLeft', 'size']
	),
	([topLeft, size], { value }) => {
		if (topLeft === undefined || size === undefined) return null
		const [left, top] = value(topLeft) as Vec
		const [width, height] = value(size) as Vec
		const [right, bottom] = [left + width, top + height]
		return callOf('polygon', [
			toAst([left, top], null),
			toAst([right, top], null),
			toAst([right, bottom], null),
			toAst([left, bottom], null),
		])
	}
)
const makeLine = withExpansion(
	makeTypedFn(
		[point, point],
		pathType,
		(start, end) => new PathValue(line(start as Vec, end as Vec)),
		['start', 'end']
	),
	([start, end]) =>
		start === undefined || end === undefined ? null : callOf('polyline', [start, end])
)
/** As many as there can be sides, of which a shape has at least three. */
const sideCount = withTypeMeta(
	number,
	new RecordAST([
		['min', lit(3)],
		['step', lit(1)],
	])
)

const makeNgon = withExpansion(
	makeTypedFn(
		[point, number, sideCount],
		pathType,
		(center, radius, sides) =>
			new PathValue(
				regularPolygon(center as Vec, radius as number, Math.max(3, Math.round(sides as number)))
			),
		['center', 'radius', 'sides']
	),
	([center, radius, sides], { value }) => {
		if (center === undefined || radius === undefined || sides === undefined) return null
		const c = value(center) as Vec
		const r = value(radius) as number
		const count = Math.max(3, Math.round(value(sides) as number))
		const vertices = Array.from({ length: count }, (_, i) =>
			toAst(add(c, toward((360 / count) * i, r)), null)
		)
		return callOf('polygon', vertices)
	}
)
const makeArc = makeTypedFn(
	[point, number, number, number],
	pathType,
	(center, radius, start, end) =>
		new PathValue(arc(center as Vec, radius as number, start as number, end as number)),
	['center', 'radius', 'start', 'end']
)
const makeCubic = makeTypedFn(
	[point, point, point, point],
	pathType,
	(start, control1, control2, end) =>
		new PathValue(cubicBezier(start as Vec, control1 as Vec, control2 as Vec, end as Vec)),
	['start', 'control1', 'control2', 'end']
)
const makeTransformed = makeTypedFn(
	[pathType, mat2d],
	pathType,
	(path, matrix) => new PathValue(transform((path as PathValue).path, matrix as Mat)),
	['path', 'by']
)
withMembers(pathType, {
	d: withDoc(makeD, 'A path from its data, as an SVG path has it.'),
	circle: withDoc(makeCircle, 'A circle around `center`, as far out as `radius`.'),
	ellipse: withDoc(makeEllipse, 'An ellipse around `center`, with a `radius` each way.'),
	rect: withDoc(makeRect, 'A rectangle from its `topLeft`, of this `size`.'),
	line: withDoc(makeLine, 'A straight line from `start` to `end`.'),
	polyline: withDoc(makePolyline, 'Straight lines through each of the points, in turn.'),
	polygon: withDoc(makePolygon, 'Straight lines through each of the points, and back.'),
	ngon: withDoc(makeNgon, 'A regular polygon around `center`, with as many sides as `sides`.'),
	arc: withDoc(makeArc, 'Part of a circle around `center`, from the angle `start` to `end`, in degrees.'),
	cubic: withDoc(makeCubic, 'A curve from `start` to `end`, drawn toward `control1` and `control2`.'),
	transform: withDoc(makeTransformed, 'The same `path`, moved, turned and scaled `by` a matrix.'),
})

/** What an argument would have to be, `route` going down through calls to it. */
export interface Change {
	readonly route: readonly number[]
	readonly value: unknown
}

const change = (arg: number, value: unknown): Change => ({ route: [arg], value })

/** How a handle is being dragged, by what is held down. */
export interface HandleDrag {
	/** The opposite side goes the other way, so that the center stays where it is. */
	readonly symmetric?: boolean
}

/** A place on a canvas to take hold of a call by. */
export interface Handle {
	/**
	 * What it looks like, which tells what it does: `point` is a place, `translate`
	 * takes the whole, `arrow` pulls a length, `dia` a count, and `path` is its own
	 * line, such as an edge.
	 */
	readonly kind: 'point' | 'translate' | 'arrow' | 'dia' | 'path'
	/** Where it is, but for a `path`, which is everywhere along `path`. */
	readonly at?: Vec
	readonly path?: Path
	/** Which way it pulls, in degrees. */
	readonly angle?: number
	/**
	 * What it is the place of, for something else to refer to: the argument at this
	 * index, or the whole of what is taken hold of. Otherwise it is only a place.
	 */
	readonly place?: number | 'self'
	/** What it changes is much smaller than where it is on a canvas, as a scale is. */
	readonly fine?: boolean
	/** It is drawn with a broken line, being there only to take hold of. */
	readonly dashed?: boolean
	/** What has to change, for it to be at `to`, having been taken at `from`. */
	to(to: Vec, from: Vec, how?: HandleDrag): readonly Change[]
}

/** All that can be done to a call on a canvas. */
export interface Grip {
	readonly handles: readonly Handle[]
	/** What is only there to look at. */
	readonly guides: readonly Path[]
	/** What has to change, for the whole of it to be moved by `delta`. */
	move?(delta: Vec): readonly Change[]
	/** Where else on it matters, to line something else up with, besides its handles. */
	readonly snaps?: Snaps
}

/** Places, and straight lines, that something can snap to. */
export interface Snaps {
	readonly points?: readonly Vec[]
	readonly lines?: readonly (readonly [Vec, Vec])[]
}

/** The lines through `points`, in turn, and back to the first if it is closed. */
const linesThrough = (points: readonly Vec[], closed: boolean): (readonly [Vec, Vec])[] =>
	points.flatMap((at, i): (readonly [Vec, Vec])[] => {
		const next = points[i + 1] ?? (closed ? points[0] : undefined)
		return next === undefined || points.length < 2 ? [] : [[at, next]]
	})

export const NO_GRIP: Grip = { handles: [], guides: [] }

/** A grip the same, for the call that is the argument at `arg`. */
export const under = (arg: number, grip: Grip): Grip => {
	const lower = (changes: readonly Change[]): Change[] =>
		changes.map(({ route, value }) => ({ route: [arg, ...route], value }))
	const { move } = grip
	return {
		guides: grip.guides,
		...(grip.snaps === undefined ? {} : { snaps: grip.snaps }),
		handles: grip.handles.map(handle => ({
			...handle,
			to: (to, from, how) => lower(handle.to(to, from, how)),
		})),
		...(move === undefined ? {} : { move: (delta: Vec) => lower(move(delta)) }),
	}
}

/** A place that is all there is to something: the point itself. */
export const gripOfPoint = (at: Vec): Grip => ({
	handles: [{ kind: 'translate', place: 'self', at, to: to => [{ route: [], value: to }] }],
	guides: [],
	move: delta => [{ route: [], value: add(at, delta) }],
})

interface Vertex {
	readonly point: Vec
	readonly command: string
	readonly args?: readonly Vec[]
}
interface Curve {
	readonly vertices: readonly Vertex[]
	readonly closed: boolean
}

/** `path`, with its vertex at `v` of its curve at `c` made something else. */
const withVertices = (
	path: Path,
	c: number,
	change: (vertices: readonly Vertex[]) => readonly Vertex[]
): Path => {
	const curves = (path as unknown as { curves: readonly Curve[] }).curves
	return {
		curves: curves.map((curve, i) =>
			i === c ? { ...curve, vertices: change(curve.vertices) } : curve
		),
	} as unknown as Path
}

/** Only a curve's controls are places, as an arc's are its radii and such. */
const shiftVertex = (vertex: Vertex, delta: Vec): Vertex => ({
	...vertex,
	point: add(vertex.point, delta),
	...(vertex.command === 'C' && vertex.args
		? { args: vertex.args.map(arg => add(arg, delta)) }
		: {}),
})

/**
 * Take hold of a path's data, by its vertices and what controls its curves, as they
 * are all there is to say about it. A vertex takes its controls along.
 */
function gripOfD(path: Path): Grip {
	const curves = (path as unknown as { curves: readonly Curve[] }).curves
	const handles: Handle[] = []
	const guides: Path[] = []
	const whole = (value: Path): Change[] => [change(0, toD(value))]
	curves.forEach(({ vertices, closed }, c) => {
		vertices.forEach(({ point: at, command, args }, v) => {
			const previous = vertices[v - 1] ?? (closed ? vertices.at(-1) : undefined)
			if (command === 'C' && args?.length === 2 && previous !== undefined) {
				const [control1, control2] = args as readonly [Vec, Vec]
				guides.push(line(previous.point, control1), line(at, control2))
				args.forEach((control, a) => {
					handles.push({
						kind: 'point',
						at: control,
						to: to =>
							whole(
								withVertices(path, c, all =>
									all.map((vertex, i) =>
										i === v
											? {
													...vertex,
													args: vertex.args!.map((arg, j) => (j === a ? to : arg)),
												}
											: vertex
									)
								)
							),
					})
				})
			}
			handles.push({
				kind: 'point',
				at,
				to: to =>
					whole(
						withVertices(path, c, all => {
							const delta = sub(to, at)
							const next = (v + 1) % all.length
							return all.map((vertex, i) => {
								if (i === v) {
									const own = vertex.args
									return {
										...vertex,
										point: to,
										...(vertex.command === 'C' && own
											? { args: [own[0]!, add(own[1]!, delta)] }
											: {}),
									}
								}
								const follows = i === next && (closed || next > v)
								return follows && vertex.command === 'C' && vertex.args
									? { ...vertex, args: [add(vertex.args[0]!, delta), vertex.args[1]!] }
									: vertex
							})
						})
					),
			})
		})
	})
	return {
		handles,
		guides,
		move: delta =>
			whole(
				curves.reduce<Path>(
					(moved, _, c) =>
						withVertices(moved, c, all => all.map(vertex => shiftVertex(vertex, delta))),
					path
				)
			),
	}
}

const GIZMO_SIZE = 80
const NGON_RING = 40

/** A row of points, each of its own argument, that move together. */
const pointsGrip = (
	points: readonly Vec[],
	guides: readonly Path[] = [],
	snaps?: Snaps
): Grip => ({
	...(snaps === undefined ? {} : { snaps }),
	handles: points.map((at, i) => ({ kind: 'point', place: i, at, to: to => [change(i, to)] })),
	guides,
	move: delta => points.map((at, i) => change(i, add(at, delta))),
})

/** Take hold of a matrix written out, by its axes, its corner, and a ring to turn it. */
function matrixGrip(m: Mat, arg: number): Grip {
	const [a, b, c, d, tx, ty] = m
	const t: Vec = [tx, ty]
	const along = (x: number, y: number): Vec => [
		tx + (a * x + c * y) * GIZMO_SIZE,
		ty + (b * x + d * y) * GIZMO_SIZE,
	]
	const axisX = along(1, 0)
	const axisY = along(0, 1)
	const corner = along(1, 1)
	const at = (value: Mat): Change[] => [change(arg, value)]
	const inLocal = (to: Vec): Vec => {
		const det = a * d - b * c
		const [x, y] = sub(to, t)
		return [(d * x - c * y) / det / GIZMO_SIZE, (a * y - b * x) / det / GIZMO_SIZE]
	}
	return {
		handles: [
			{
				kind: 'path',
				fine: true,
				path: circle(t, GIZMO_SIZE / 2),
				dashed: true,
				to(to, from) {
					const turn = (degrees(sub(to, t)) - degrees(sub(from, t))) * (Math.PI / 180)
					const cos = Math.cos(turn)
					const sin = Math.sin(turn)
					return at([
						cos * a - sin * b,
						sin * a + cos * b,
						cos * c - sin * d,
						sin * c + cos * d,
						tx,
						ty,
					])
				},
			},
			{
				kind: 'point',
				fine: true,
				at: axisX,
				to: to => {
					const [x, y] = sub(to, t)
					return at([x / GIZMO_SIZE, y / GIZMO_SIZE, c, d, tx, ty])
				},
			},
			{
				kind: 'point',
				fine: true,
				at: axisY,
				to: to => {
					const [x, y] = sub(to, t)
					return at([a, b, x / GIZMO_SIZE, y / GIZMO_SIZE, tx, ty])
				},
			},
			{
				kind: 'point',
				fine: true,
				at: corner,
				to: to => {
					const [sx, sy] = inLocal(to)
					return at([a * sx, b * sx, c * sy, d * sy, tx, ty])
				},
			},
			{ kind: 'translate', at: t, to: to => at([a, b, c, d, to[0], to[1]]) },
		],
		guides: [line(t, axisX), line(t, axisY), line(axisX, corner), line(axisY, corner)],
		move: delta => at([a, b, c, d, tx + delta[0], ty + delta[1]]),
	}
}

type Maker = (args: readonly unknown[], inner: (arg: number) => Grip | null) => Grip

const makers = new Map<unknown, Maker>([
	[makeD, ([d]) => gripOfD(fromD(d as string))],
	[
		makeCircle,
		([center, radius]) => {
			const c = center as Vec
			const r = radius as number
			return {
				handles: [
					{
						kind: 'arrow',
						at: [c[0] + r, c[1]],
						angle: 0,
						to: to => [change(1, dist(c, to))],
					},
					{ kind: 'translate', place: 0, at: c, to: to => [change(0, to)] },
				],
				guides: [],
				snaps: { points: [0, 90, 180, 270].map(angle => add(c, toward(angle, r))) },
				move: delta => [change(0, add(c, delta))],
			}
		},
	],
	[
		makeEllipse,
		([center, radius]) => {
			const c = center as Vec
			const [rx, ry] = radius as Vec
			return {
				handles: [
					{
						kind: 'arrow',
						at: [c[0] + rx, c[1]],
						angle: 0,
						to: to => [change(1, [Math.abs(to[0] - c[0]), UNSET])],
					},
					{
						kind: 'arrow',
						at: [c[0], c[1] + ry],
						angle: 90,
						to: to => [change(1, [UNSET, Math.abs(to[1] - c[1])])],
					},
					{ kind: 'translate', place: 0, at: c, to: to => [change(0, to)] },
				],
				guides: [],
				snaps: {
					points: [
						[c[0] + rx, c[1]],
						[c[0], c[1] + ry],
						[c[0] - rx, c[1]],
						[c[0], c[1] - ry],
					],
				},
				move: delta => [change(0, add(c, delta))],
			}
		},
	],
	[
		makeRect,
		([topLeft, size]) => {
			const s = topLeft as Vec
			const e = add(s, size as Vec)
			const middle: Vec = [(s[0] + e[0]) / 2, (s[1] + e[1]) / 2]
			const moved = (delta: Vec): Change[] => [change(0, add(s, delta))]
			// From one side to the other, on each axis: the far side stays where it is,
			// or goes the other way, for the center to stay where it is.
			const across = (axis: 0 | 1, near: number, far: number): Change[] => {
				const [from, to] = near < far ? [near, far] : [far, near]
				const start = axis === 0 ? [from, UNSET] : [UNSET, from]
				const extent = axis === 0 ? [to - from, UNSET] : [UNSET, to - from]
				return [change(0, start), change(1, extent)]
			}
			const opposite = (axis: 0 | 1, at: number, far: number, how?: HandleDrag): number =>
				how?.symmetric ? middle[axis] * 2 - at : far
			const left = (x: number, how?: HandleDrag) => across(0, x, opposite(0, x, e[0], how))
			const right = (x: number, how?: HandleDrag) => across(0, opposite(0, x, s[0], how), x)
			const top = (y: number, how?: HandleDrag) => across(1, y, opposite(1, y, e[1], how))
			const bottom = (y: number, how?: HandleDrag) => across(1, opposite(1, y, s[1], how), y)
			return {
				handles: [
					{ kind: 'arrow', angle: 0, at: [s[0], middle[1]], to: (to, _, how) => left(to[0], how) },
					{ kind: 'arrow', angle: 90, at: [middle[0], s[1]], to: (to, _, how) => top(to[1], how) },
					{ kind: 'arrow', angle: 0, at: [e[0], middle[1]], to: (to, _, how) => right(to[0], how) },
					{ kind: 'arrow', angle: 90, at: [middle[0], e[1]], to: (to, _, how) => bottom(to[1], how) },
					{ kind: 'point', place: 0, angle: 45, at: s, to: (to, _, how) => [...left(to[0], how), ...top(to[1], how)] },
					{ kind: 'point', angle: -45, at: [e[0], s[1]], to: (to, _, how) => [...right(to[0], how), ...top(to[1], how)] },
					{ kind: 'point', angle: -45, at: [s[0], e[1]], to: (to, _, how) => [...left(to[0], how), ...bottom(to[1], how)] },
					{ kind: 'point', angle: 45, at: e, to: (to, _, how) => [...right(to[0], how), ...bottom(to[1], how)] },
				],
				guides: [],
				snaps: {
					points: [middle],
					lines: [
						[s, [e[0], s[1]]],
						[[e[0], s[1]], e],
						[e, [s[0], e[1]]],
						[[s[0], e[1]], s],
					],
				},
				move: moved,
			}
		},
	],
	[
		makeLine,
		args => {
			const [start, end] = args as [Vec, Vec]
			return pointsGrip(args as Vec[], [], {
				points: [[(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]],
				lines: [[start, end]],
			})
		},
	],
	[makePolyline, args => pointsGrip(args as Vec[], [], { lines: linesThrough(args as Vec[], false) })],
	[makePolygon, args => pointsGrip(args as Vec[], [], { lines: linesThrough(args as Vec[], true) })],
	[
		makeCubic,
		args => {
			const [start, control1, control2, end] = args as Vec[]
			return pointsGrip(args as Vec[], [line(start!, control1!), line(end!, control2!)])
		},
	],
	[
		makeNgon,
		([center, radius, sides]) => {
			const c = center as Vec
			const r = radius as number
			const ring = r + NGON_RING
			const count = Math.max(3, Math.round(sides as number))
			return {
				handles: [
					{
						kind: 'arrow',
						at: [c[0] + r, c[1]],
						angle: 0,
						to: to => [change(1, dist(c, to))],
					},
					{
						kind: 'dia',
						at: add(c, toward(360 / count, ring)),
						to: to => {
							const angle = Math.min(120, Math.max(3.6, degrees(sub(to, c))))
							return [change(2, Math.round(360 / angle))]
						},
					},
					{ kind: 'translate', place: 0, at: c, to: to => [change(0, to)] },
				],
				guides: [arc(c, ring, 3.6, 120)],
				snaps: (() => {
					const vertices = Array.from({ length: count }, (_, i) =>
						add(c, toward((360 / count) * i, r))
					)
					return { points: vertices, lines: linesThrough(vertices, true) }
				})(),
				move: delta => [change(0, add(c, delta))],
			}
		},
	],
	[
		makeArc,
		([center, radius, start, end]) => {
			const c = center as Vec
			const r = radius as number
			const from = start as number
			const until = end as number
			const middle = (from + until) / 2
			const angleFor = (angle: number, to: Vec): number =>
				angle + shortest(degrees(sub(to, c)) - angle)
			return {
				handles: [
					{
						kind: 'arrow',
						at: add(c, toward(middle, r)),
						angle: middle,
						to: to => [change(1, dist(c, to))],
					},
					{
						kind: 'point',
						at: add(c, toward(from, r)),
						to: to => [change(2, angleFor(from, to))],
					},
					{
						kind: 'point',
						at: add(c, toward(until, r)),
						to: to => [change(3, angleFor(until, to))],
					},
					{ kind: 'translate', place: 0, at: c, to: to => [change(0, to)] },
				],
				guides: [],
				move: delta => [change(0, add(c, delta))],
			}
		},
	],
	[
		makeTranslation,
		([by]) => {
			const at = by as Vec
			return {
				handles: [{ kind: 'translate', at, to: to => [change(0, to)] }],
				guides: [],
				move: delta => [change(0, add(at, delta))],
			}
		},
	],
	[
		makeRotation,
		([angle]) => {
			const turned = angle as number
			const at = toward(turned, GIZMO_SIZE)
			return {
				handles: [
					{
						kind: 'point',
						at,
						to: to => [change(0, turned + shortest(degrees(to) - turned))],
					},
				],
				guides: [line([0, 0], at), arc([0, 0], GIZMO_SIZE, 0, turned)],
			}
		},
	],
	[
		makeScaling,
		([by]) => {
			const [sx, sy] = by as Vec
			const axisX: Vec = [sx * GIZMO_SIZE, 0]
			const axisY: Vec = [0, sy * GIZMO_SIZE]
			return {
				handles: [
					{
						kind: 'arrow',
						fine: true,
						at: axisX,
						angle: 0,
						to: to => [change(0, [to[0] / GIZMO_SIZE, UNSET])],
					},
					{
						kind: 'arrow',
						fine: true,
						at: axisY,
						angle: 90,
						to: to => [change(0, [UNSET, to[1] / GIZMO_SIZE])],
					},
					{
						kind: 'point',
						fine: true,
						at: [axisX[0], axisY[1]],
						to: to => [change(0, [to[0] / GIZMO_SIZE, to[1] / GIZMO_SIZE])],
					},
				],
				guides: [line([0, 0], axisX), line([0, 0], axisY)],
			}
		},
	],
	[
		makeTransformed,
		([, matrix], inner) => {
			const m = matrix as Mat
			const shape = inner(0)
			const own = inner(1) ?? matrixGrip(m, 1)
			const [a, b, c, d] = m
			const det = a * d - b * c
			// What is moved is the matrix if that can say so. If not, the shape inside,
			// by as much as that comes to where the matrix has it.
			const inside = (delta: Vec): readonly Change[] =>
				det === 0 || shape?.move === undefined
					? []
					: shape.move([
							(d * delta[0] - c * delta[1]) / det,
							(a * delta[1] - b * delta[0]) / det,
						])
			return {
				handles: own.handles,
				guides: own.guides,
				move: own.move ?? inside,
			}
		},
	],
])

/**
 * The grip of a call of `fn`, if it has one. `inner` gives the grip of an argument
 * that is itself a call, and null if it is not.
 */
export const gripOf = (
	fn: unknown,
	args: readonly unknown[],
	inner: (arg: number) => Grip | null
): Grip | null => makers.get(fn)?.(args, inner) ?? null

/** Where the program's coordinates are for the argument at `arg` of a call of `fn`. */
export function withinArg(fn: unknown, arg: number, args: readonly unknown[]): Mat | null {
	if (fn === makeTransformed && arg === 0) return args[1] as Mat
	if (fn === multiply) {
		return (args as Mat[])
			.slice(0, arg)
			.reduce<Mat>((a, b) => Mat2d.mul(a, b) as unknown as Mat, Mat2d.I as unknown as Mat)
	}
	return null
}

const BINDINGS: Readonly<Record<string, unknown>> = { path: pathType, vec2, point, size, mat2d }

/** `parent`, with what a canvas adds. */
export function withGraphics(parent: Env): Env {
	const bindings = new Map<string, { ast: AST; env: Env }>()
	for (const [name, value] of Object.entries(BINDINGS)) {
		bindings.set(name, { ast: host(value), env: null })
	}
	return { ast: new LetAST([], null), parent, bindings }
}
