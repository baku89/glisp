/**
 * What a canvas adds to the language: `path`, from pave, and `vec2`, `point` and
 * `mat2d`, from linearly. Types have members, so that `path` is what a path is as
 * well as where the functions on them are.
 */

import {
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

/** Not every vec2 is a point: a size is not to be drawn. */
const point = said(vec2, 'point', 'mdi:circle-small')

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
	translate: makeTranslation,
	rotate: makeRotation,
	scale: makeScaling,
	mul: multiply,
})

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

/** A call to a member of `path`, as a next rung is written. */
const callOf = (member: string, args: readonly AST[]): AST =>
	new CallAST(parse(`path.${member}`), [...args])

/** The rungs: each shape is said in terms of the more general one it is a case of. */
const makeEllipse = makeTypedFn(
	[point, vec2],
	pathType,
	(center, radius) => ellipse(center as Vec, radius as Vec),
	['center', 'radius']
)
const makeCircle = withExpansion(
	makeTypedFn(
		[point, number],
		pathType,
		(center, radius) => circle(center as Vec, radius as number),
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
	(...points) => polyline(...(points as Vec[])),
	[],
	point
)
const makePolygon = makeTypedFn(
	[],
	pathType,
	(...points) => polygon(...(points as Vec[])),
	[],
	point
)
const makeRect = withExpansion(
	makeTypedFn(
		[point, point],
		pathType,
		(start, end) => rectangle(start as Vec, end as Vec),
		['start', 'end']
	),
	([start, end], { value }) => {
		if (start === undefined || end === undefined) return null
		const [left, top] = value(start) as Vec
		const [right, bottom] = value(end) as Vec
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
		(start, end) => line(start as Vec, end as Vec),
		['start', 'end']
	),
	([start, end]) =>
		start === undefined || end === undefined ? null : callOf('polyline', [start, end])
)
const makeNgon = withExpansion(
	makeTypedFn(
		[point, number, number],
		pathType,
		(center, radius, sides) =>
			regularPolygon(center as Vec, radius as number, Math.max(3, Math.round(sides as number))),
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
		arc(center as Vec, radius as number, start as number, end as number),
	['center', 'radius', 'start', 'end']
)
const makeCubic = makeTypedFn(
	[point, point, point, point],
	pathType,
	(start, control1, control2, end) =>
		cubicBezier(start as Vec, control1 as Vec, control2 as Vec, end as Vec),
	['start', 'control1', 'control2', 'end']
)
const makeTransformed = makeTypedFn(
	[pathType, mat2d],
	pathType,
	(path, matrix) => transform(path as Path, matrix as Mat),
	['path', 'by']
)
withMembers(pathType, {
	circle: makeCircle,
	ellipse: makeEllipse,
	rect: makeRect,
	line: makeLine,
	polyline: makePolyline,
	polygon: makePolygon,
	ngon: makeNgon,
	arc: makeArc,
	cubic: makeCubic,
	transform: makeTransformed,
})

/** What an argument would have to be, `route` going down through calls to it. */
export interface Change {
	readonly route: readonly number[]
	readonly value: unknown
}

const change = (arg: number, value: unknown): Change => ({ route: [arg], value })

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
	/** It is drawn with a broken line, being there only to take hold of. */
	readonly dashed?: boolean
	/** What has to change, for it to be at `to`, having been taken at `from`. */
	to(to: Vec, from: Vec): readonly Change[]
}

/** All that can be done to a call on a canvas. */
export interface Grip {
	readonly handles: readonly Handle[]
	/** What is only there to look at. */
	readonly guides: readonly Path[]
	/** What has to change, for the whole of it to be moved by `delta`. */
	move?(delta: Vec): readonly Change[]
}

export const NO_GRIP: Grip = { handles: [], guides: [] }

/** A grip the same, for the call that is the argument at `arg`. */
export const under = (arg: number, grip: Grip): Grip => {
	const lower = (changes: readonly Change[]): Change[] =>
		changes.map(({ route, value }) => ({ route: [arg, ...route], value }))
	const { move } = grip
	return {
		guides: grip.guides,
		handles: grip.handles.map(handle => ({
			...handle,
			to: (to, from) => lower(handle.to(to, from)),
		})),
		...(move === undefined ? {} : { move: (delta: Vec) => lower(move(delta)) }),
	}
}

/** A place that is all there is to something: the point itself. */
export const gripOfPoint = (at: Vec): Grip => ({
	handles: [{ kind: 'translate', at, to: to => [{ route: [], value: to }] }],
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
 * Take hold of a path written out, by its vertices and what controls its curves, as
 * they are all there is to say about it. A vertex takes its controls along.
 */
export function gripOfPathValue(path: Path): Grip {
	const curves = (path as unknown as { curves: readonly Curve[] }).curves
	const handles: Handle[] = []
	const guides: Path[] = []
	const whole = (value: Path): Change[] => [{ route: [], value }]
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
const pointsGrip = (points: readonly Vec[], guides: readonly Path[] = []): Grip => ({
	handles: points.map((at, i) => ({ kind: 'point', at, to: to => [change(i, to)] })),
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
				at: axisX,
				to: to => {
					const [x, y] = sub(to, t)
					return at([x / GIZMO_SIZE, y / GIZMO_SIZE, c, d, tx, ty])
				},
			},
			{
				kind: 'point',
				at: axisY,
				to: to => {
					const [x, y] = sub(to, t)
					return at([a, b, x / GIZMO_SIZE, y / GIZMO_SIZE, tx, ty])
				},
			},
			{
				kind: 'point',
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
					{ kind: 'translate', at: c, to: to => [change(0, to)] },
				],
				guides: [],
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
					{ kind: 'translate', at: c, to: to => [change(0, to)] },
				],
				guides: [],
				move: delta => [change(0, add(c, delta))],
			}
		},
	],
	[
		makeRect,
		([start, end]) => {
			const s = start as Vec
			const e = end as Vec
			const centered: Vec = [(s[0] + e[0]) / 2, (s[1] + e[1]) / 2]
			const moved = (delta: Vec): Change[] => [change(0, add(s, delta)), change(1, add(e, delta))]
			const left = (x: number) => change(0, [x, UNSET])
			const top = (y: number) => change(0, [UNSET, y])
			const right = (x: number) => change(1, [x, UNSET])
			const bottom = (y: number) => change(1, [UNSET, y])
			return {
				handles: [
					{ kind: 'path', angle: 0, path: line(s, [s[0], e[1]]), to: to => [left(to[0])] },
					{ kind: 'path', angle: 90, path: line(s, [e[0], s[1]]), to: to => [top(to[1])] },
					{ kind: 'path', angle: 0, path: line([e[0], s[1]], e), to: to => [right(to[0])] },
					{ kind: 'path', angle: 90, path: line([s[0], e[1]], e), to: to => [bottom(to[1])] },
					{ kind: 'translate', at: centered, to: to => moved(sub(to, centered)) },
					{ kind: 'point', at: s, to: to => [left(to[0]), top(to[1])] },
					{ kind: 'point', at: [e[0], s[1]], to: to => [right(to[0]), top(to[1])] },
					{ kind: 'point', at: [s[0], e[1]], to: to => [left(to[0]), bottom(to[1])] },
					{ kind: 'point', at: e, to: to => [right(to[0]), bottom(to[1])] },
				],
				guides: [],
				move: moved,
			}
		},
	],
	[makeLine, args => pointsGrip(args as Vec[])],
	[makePolyline, args => pointsGrip(args as Vec[])],
	[makePolygon, args => pointsGrip(args as Vec[])],
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
					{ kind: 'translate', at: c, to: to => [change(0, to)] },
				],
				guides: [arc(c, ring, 3.6, 120)],
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
					{ kind: 'translate', at: c, to: to => [change(0, to)] },
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
						at: axisX,
						angle: 0,
						to: to => [change(0, [to[0] / GIZMO_SIZE, UNSET])],
					},
					{
						kind: 'arrow',
						at: axisY,
						angle: 90,
						to: to => [change(0, [UNSET, to[1] / GIZMO_SIZE])],
					},
					{
						kind: 'point',
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

const BINDINGS: Readonly<Record<string, unknown>> = { path: pathType, vec2, point, mat2d }

/** `parent`, with what a canvas adds. */
export function withGraphics(parent: Env): Env {
	const bindings = new Map<string, { ast: AST; env: Env }>()
	for (const [name, value] of Object.entries(BINDINGS)) {
		bindings.set(name, { ast: host(value), env: null })
	}
	return { ast: new LetAST([], null), parent, bindings }
}
