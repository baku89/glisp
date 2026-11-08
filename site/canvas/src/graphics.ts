/**
 * What a canvas adds to the language: `path`, from pave, and `vec2`, `point` and
 * `mat2d`, from linearly. Types have members, so that `path` is what a path is as
 * well as where the functions on them are.
 */

import {
	type TypedHostFn,
	AS_SOURCE,
	type AST,
	buildPrelude,
	CallAST,
	type Env,
	evaluate,
	host,
	LetAST,
	MetaAST,
	lit,
	makeRecordType,
	makeTupleType,
	makeType,
	makeLazyType,
	makeUnionType,
	makeTypedFn,
	parse,
	print,
	RecordAST,
	type TypeValue,
	UNIT,
	UNSET,
	toAst,
	VecAST,
	withDoc,
	randomAt,
	seedType,
	withExpansion,
	withInverse,
	withMembers,
	withDefaultFrom,
	withOptional,
	withTypeMeta,
	constructorOf,
	isTypeValue,
	withConstructor,
} from '@glisp/lang'
import { withInitial } from '@glisp/tweeq/filters'
import Color from 'colorjs.io'
import { mat2d as Mat2d, vec2 as Vec2 } from 'linearly'
import { bounds, length as pathLength } from 'pave/path/metrics'
import { merge } from 'pave/path/compound'
import { transform } from 'pave/path/modifiers'
import {
	arc,
	arcByPoints,
	capsule,
	empty,
	circle,
	cubicBezier,
	ellipse,
	ellipseFromFoci,
	fan,
	line,
	polygon,
	polyline,
	rectangle,
	regularPolygon,
	roundRect,
	star,
} from 'pave/path/primitives'
import { dubins } from 'pave/path/dubins'
import { clothoid, spiral } from 'pave/path/spirals'
import { superellipse } from 'pave/path/superellipse'
import { exclude, intersect, subtract, unite } from 'pave/path/boolean'
import { dash } from 'pave/path/dash'
import { bulge, twirl, wave } from 'pave/path/distortions'
import { convexHull } from 'pave/path/hull'
import { kaleidoscope, kaleidoscopeTile, mirror, reflect } from 'pave/path/mirror'
import { chamfer, fillet, flatten, reverse, subdivide, zigzag } from 'pave/path/modifiers'
import { blend, blendSeries, repeatAlong, type RepeatAlongOptions } from 'pave/path/layout'
import { pixelate, type PixelateAnchors, type PixelateMode } from 'pave/path/pixelate'
import { raycast } from 'pave/path/raycast'
import { Ray } from 'geome'
import { shadow, shadowFrom } from 'pave/path/shadow'
import { normal, ray as pathRay } from 'pave/path/location'
import { offset, offsetStroke } from 'pave/path/offset'
import { nearest } from 'pave/path/queries'
import { fromD, toD } from 'pave/path/svg'

import { type GraphPaperKind, PAPER_STEP } from './graphPaper'
import { outsideFinders, QR_LEVELS, type QrLevel, qrModules, qrOutline } from './qr'

const said = (type: TypeValue, draw: string, icon: string): TypeValue =>
	withTypeMeta(
		type,
		new RecordAST([
			['draw', lit(draw)],
			['icon', lit(icon)],
		])
	)

const number = evaluate(parse('number'), buildPrelude()).value as TypeValue

/** A number that is shown by its icon, as what it means, in place of that of a number. */
const numberShownBy = (icon: string): TypeValue =>
	withTypeMeta(number, new RecordAST([['icon', lit(icon)]]))
/** How far round, in degrees, which is said wherever one is written or typed. */
const degreesType = withTypeMeta(number, new RecordAST([['suffix', lit('°')]]))
const angleType = withTypeMeta(
	degreesType,
	new RecordAST([
		['icon', lit('ph:angle')],
		['input', lit('angle')],
	])
)
const cornerType = numberShownBy('tabler:border-radius')

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
/** A number that has a part to play in a vector, which says so where it is shown. */
const part = (fields: readonly (readonly [string, string | number])[]): TypeValue =>
	withTypeMeta(number, new RecordAST(fields.map(([key, text]) => [key, lit(text)] as const)))

/**
 * How much of something, from 0 to 1, which is half until it is said otherwise. It is a number
 * as far as what fits goes: it says what it means, and how it is to be taken hold of.
 */
const percentType = withTypeMeta(
	{ ...number, default: 0.5 },
	new RecordAST([
		['min', lit(0)],
		['max', lit(1)],
		['scale', lit(100)],
		['suffix', lit('%')],
		['icon', lit('mdi:percent-outline')],
	])
)

export const POINT_ICON = 'fill:M11.25 3h1.5v6h-1.5zM11.25 15h1.5v6h-1.5zM3 11.25h6v1.5H3zM15 11.25h6v1.5h-6z'
/** Two axes through the origin, as far as there is to see of them. */
export const AXES_ICON = 'stroke:M2 12h20M12 2v20'

/** How far something goes, which a pad can take hold of, though it is nowhere to be drawn. */
const translationType = withTypeMeta(
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
	new RecordAST([
		['input', lit('translate')],
		['icon', lit('ph:arrows-out-cardinal')],
		['name', lit('translation')],
	])
)

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
		POINT_ICON
	),
	new RecordAST([
		['input', lit('translate')],
		['name', lit('point')],
		// Where something is can change without what it is changing.
		['changesFirst', lit(true)],
	])
)

/** The place `ratio` of the way from `a` to `b`, which comes to a point, to be drawn as one. */
const makeLerp = makeTypedFn(
	[point, point, percentType],
	point,
	(a, b, ratio) => {
		const [[ax, ay], [bx, by], t] = [a as Vec, b as Vec, ratio as number]
		return [ax + (bx - ax) * t, ay + (by - ay) * t]
	},
	['a', 'b', 'ratio']
)

/**
 * The place halfway from `a` to `b`: `lerp` with its ratio given, which is what it comes to one
 * rung down. Moved, it takes `b` along, or `a` if `b` cannot go.
 */
const makeMidpoint = withExpansion(
	withInverse(
		makeTypedFn(
			[point, point],
			point,
			(a, b) => {
				const [[ax, ay], [bx, by]] = [a as Vec, b as Vec]
				return [(ax + bx) / 2, (ay + by) / 2]
			},
			['a', 'b']
		),
		(index, result, args) => {
			const [[mx, my], [ox, oy]] = [result as Vec, args[1 - index] as Vec]
			return [2 * mx - ox, 2 * my - oy]
		}
	),
	([a, b]) => (a === undefined || b === undefined ? null : new CallAST(parse('vec2.lerp'), [a, b, lit(0.5)]))
)

/** A place moved `by` this much, which comes to a point as well. */
const makeNudge = makeTypedFn(
	[point, translationType],
	point,
	(at, by) => add(at as Vec, by as Vec),
	['point', 'by']
)

withMembers(vec2, {
	add: makeTypedFn([translationType, translationType], vec2, (a, b) => Vec2.add(a as Vec, b as Vec), ['a', 'b']),
	sub: makeTypedFn([translationType, translationType], vec2, (a, b) => Vec2.sub(a as Vec, b as Vec), ['a', 'b']),
	scale: makeTypedFn(
		[translationType, number],
		vec2,
		(a, s) => Vec2.scale(a as Vec, s as number),
		['a', 'by']
	),
	lerp: withDoc(makeLerp, 'The place `ratio` of the way from `a` to `b`.', 'Lerp'),
	midpoint: withDoc(makeMidpoint, 'The place halfway from `a` to `b`.', 'Midpoint'),
	nudge: withDoc(makeNudge, 'A `point` moved `by` this much, as a place of its own.', 'Nudge'),
})

/** How far something goes each way. */
const size = withTypeMeta(
	makeTupleType([
		part([
			['title', 'Width'],
			['fieldIcon', 'ph:arrows-horizontal'],
			['min', 0],
		]),
		part([
			['title', 'Height'],
			['fieldIcon', 'ph:arrows-vertical'],
			['min', 0],
		]),
	]),
	new RecordAST([
		['input', lit('size')],
		['icon', lit('ph:frame-corners')],
		['name', lit('size')],
	])
)

/** How long the side of something is. */
const sideType = part([['min', 0]])

/** The same type, and what is said of it, starting as `value`. */
const withDefault = (type: TypeValue, value: unknown): TypeValue => {
	const plain = Object.create(type.plain ?? type, { default: { value } }) as TypeValue
	return type.meta ? withTypeMeta(plain, type.meta) : plain
}
/** How many times as large each way, shown as a percentage, and going by a ratio as a size does. */
const scaleType = withTypeMeta(
	withDefault(
		makeTupleType([
			part([
				['title', 'Width'],
				['fieldIcon', 'ph:arrows-horizontal'],
				['scale', 100],
				['suffix', '%'],
			]),
			part([
				['title', 'Height'],
				['fieldIcon', 'ph:arrows-vertical'],
				['scale', 100],
				['suffix', '%'],
			]),
		]),
		[1, 1]
	),
	new RecordAST([
		['input', lit('size')],
		['icon', lit('ph:arrows-out')],
		['name', lit('scale')],
	])
)
/** Six numbers that are not much to read in a row, so it goes by what it is, as a path's data does. */
const mat2d = withTypeMeta(
	makeTupleType([number, number, number, number, number, number]),
	new RecordAST([
		['icon', lit('tabler:matrix')],
		['name', lit('matrix')],
		['summary', lit('Transform')],
	])
)
const makeTranslation = makeTypedFn(
	[translationType],
	mat2d,
	by => Mat2d.fromTranslation(by as Vec),
	['by']
)
const makeRotation = makeTypedFn(
	[angleType],
	mat2d,
	angle => Mat2d.fromRotation(angle as number),
	['angle']
)
const makeScaling = makeTypedFn([scaleType], mat2d, by => Mat2d.fromScaling(by as Vec), ['by'])
const makeTRS = withOptional(
	makeTypedFn(
		[translationType, angleType, scaleType, point],
		mat2d,
		(translation, rotation, scale, pivot) =>
			// Adding 0 is for the -0 that turning by nothing comes to, which is not anything to write.
			Mat2d.pivot(Mat2d.trs(translation as Vec, rotation as number, scale as Vec), pivot as Vec).map(n => n + 0),
		['translation', 'rotation', 'scale', 'pivot']
	),
	['rotation', 'scale', 'pivot']
)
const multiply = makeTypedFn(
	[],
	mat2d,
	(...matrices) =>
		(matrices as Mat[]).reduce<Mat>((a, b) => Mat2d.mul(a, b) as unknown as Mat, Mat2d.I as unknown as Mat),
	[],
	mat2d
)
withMembers(mat2d, {
	translate: withDoc(makeTranslation, 'A matrix that moves `by` this much.', 'Translation'),
	rotate: withDoc(makeRotation, 'A matrix that turns by `angle`, in degrees, around the origin.', 'Rotation'),
	scale: withDoc(makeScaling, 'A matrix that scales `by` this much each way, from the origin.', 'Scaling'),
	trs: withDoc(makeTRS, 'A matrix that scales by `scale` and turns by `rotation` in degrees, both around `pivot`, then moves by `translation`.', 'Translate, Rotate, Scale'),
	mul: withDoc(multiply, 'One matrix after another, the last applied first.', 'Multiply'),
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

/** A path and how it is drawn, which a path itself has nothing to say about. */
export class StyledValue {
	constructor(
		readonly path: PathValue,
		readonly paint: Paint
	) {}

	[AS_SOURCE](): AST {
		return styleOf(
			this.path[AS_SOURCE](),
			Object.fromEntries(PAINT_KEYS.map(key => [key, toAst(this.paint[key], null)]))
		)
	}
}

export const isStyled = (value: unknown): value is StyledValue => value instanceof StyledValue

/**
 * An area, which is not a shape: it is not drawn as one, and a path is not one of these. What
 * a path has around it is an area only by asking for it, as `path.bounds`.
 */
export class RectValue {
	constructor(
		readonly origin: Vec,
		readonly size: Vec
	) {}

	[AS_SOURCE](): AST {
		return new CallAST(parse('rect'), [toAst(this.origin, null), toAst(this.size, null)])
	}
}

export const isRect = (value: unknown): value is RectValue => value instanceof RectValue

/** The corners an area goes between. */
export const cornersOf = ({ origin, size }: RectValue): readonly [Vec, Vec] => [
	origin,
	[origin[0] + size[0], origin[1] + size[1]],
]

export const LINE_CAPS = ['butt', 'round', 'square'] as const
export const LINE_JOINS = ['miter', 'round', 'bevel'] as const

/** How a path is drawn. A color of `none` is not drawn, and a `dash` of nothing is solid. */
export interface Paint {
	readonly fill: string
	readonly stroke: string
	readonly width: number
	readonly cap: (typeof LINE_CAPS)[number]
	readonly join: (typeof LINE_JOINS)[number]
	readonly dash: readonly number[]
	readonly dashOffset: number
	readonly miterLimit: number
}

/** What a style is for whatever it does not say. */
export const NO_PAINT: Paint = {
	fill: 'none',
	stroke: 'none',
	width: 1,
	cap: 'butt',
	join: 'miter',
	dash: [],
	dashOffset: 0,
	miterLimit: 4,
}

/** In the order `style` takes them, after the path. */
export const PAINT_KEYS = Object.keys(NO_PAINT) as ReadonlyArray<keyof Paint>

/** A call to `style`, saying only what is not as it would be anyway. */
export function styleOf(path: AST, paint: Partial<Record<keyof Paint, AST>>): CallAST {
	const said = PAINT_KEYS.flatMap((key): Array<[string, AST]> => {
		const value = paint[key]
		return value === undefined || print(value) === print(toAst(NO_PAINT[key], null)) ? [] : [[key, value]]
	})
	return new CallAST(parse('style'), [path], said.length > 0 ? new Map(said) : undefined)
}

export const isPath = (value: unknown): value is PathValue => value instanceof PathValue

/** How much of an icon's 24 a shape takes up, leaving room for its line. */
const ICON_EXTENT = 18

/**
 * A path's own shape, fit into an icon, in the colors it is painted, or null if it is not
 * a path with a size. How wide its line is does not come along, as the shape is not to scale.
 */
export function iconOfPath(value: unknown): string | null {
	const drawn = isStyled(value) ? value.path : value
	if (!isPath(drawn)) return null
	const { path } = drawn
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
	const d = toD(transform(path, fit))
	const paint = isStyled(value) ? value.paint : NO_PAINT
	const stroke = paint.width > 0 ? paint.stroke : 'none'
	return paint.fill === 'none' && stroke === 'none'
		? `stroke:${d}`
		: `paint:${paint.fill}|${stroke}|${d}`
}

export const pathType = said(
	makeType('path', isPath, new PathValue({ curves: [] } as unknown as Path)),
	'path',
	'mdi:vector-curve'
)

/** A call to a member of `path`, as a next rung is written. */
const callOf = (member: string, args: readonly AST[]): AST =>
	new CallAST(parse(`path.${member}`), [...args])

/** Too long to read in a row, and rarely written by hand. */
const pathData = withTypeMeta(
	evaluate(parse('string'), buildPrelude()).value as TypeValue,
	new RecordAST([
		['input', lit('long-text')],
		['icon', lit('ph:path')],
		['name', lit('path data')],
		['summary', lit('Path Data')],
		['language', lit('path-data')],
	])
)

const makeD = makeTypedFn(
	[pathData],
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
const makeEllipse = withOptional(
	makeTypedFn(
		[point, size, angleType],
		pathType,
		(center, radius, angle) =>
			new PathValue(ellipse(center as Vec, radius as Vec, Number.isFinite(angle) ? (angle as number) : 0)),
		['center', 'radius', 'angle']
	),
	['angle']
)
/** Where an ellipse is, by its foci: pave says, and it goes on from there as an ellipse. */
const ellipseOfFoci = (focus1: Vec, focus2: Vec, through: Vec) => {
	const path = ellipseFromFoci(focus1, focus2, through)
	const { args } = (path as unknown as { curves: readonly Curve[] }).curves[0]!.vertices[0]!
	const [radius, angle] = args as unknown as [Vec, number]
	return { path, radius, angle, center: [(focus1[0] + focus2[0]) / 2, (focus1[1] + focus2[1]) / 2] as Vec }
}
const makeEllipseFromFoci = withExpansion(
	makeTypedFn(
		[point, point, point],
		pathType,
		(focus1, focus2, through) =>
			new PathValue(ellipseOfFoci(focus1 as Vec, focus2 as Vec, through as Vec).path),
		['focus1', 'focus2', 'through']
	),
	([focus1, focus2, through], { value }) => {
		if (focus1 === undefined || focus2 === undefined || through === undefined) return null
		const { center, radius, angle } = ellipseOfFoci(
			value(focus1) as Vec,
			value(focus2) as Vec,
			value(through) as Vec
		)
		return callOf('ellipse', [toAst(center, null), toAst(radius, null), toAst(angle, null)])
	}
)
/** The circle with `a` and `b` at either end of a line through its center. */
const circleOfDiameter = (a: Vec, b: Vec) => ({
	center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Vec,
	radius: dist(a, b) / 2,
})

/**
 * The circle through `a`, `b` and `c`. Three in a line are not on any circle, and are on the one
 * that the two furthest apart are either end of, for there to be something there.
 */
function circleThrough(a: Vec, b: Vec, c: Vec): { center: Vec; radius: number } {
	const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]))
	if (Math.abs(d) < 1e-9 * Math.max(1, dist(a, b) * dist(b, c))) {
		const pairs: [Vec, Vec][] = [[a, b], [b, c], [a, c]]
		const [p, q] = pairs.reduce((far, pair) => (dist(...pair) > dist(...far) ? pair : far))
		return circleOfDiameter(p, q)
	}
	const [sa, sb, sc] = [a, b, c].map(([x, y]) => x * x + y * y) as [number, number, number]
	const center: Vec = [
		(sa * (b[1] - c[1]) + sb * (c[1] - a[1]) + sc * (a[1] - b[1])) / d,
		(sa * (c[0] - b[0]) + sb * (a[0] - c[0]) + sc * (b[0] - a[0])) / d,
	]
	return { center, radius: dist(center, a) }
}

/** A center and a radius as code, by what a call is given. */
type RoundCode = (p: (path: string) => string) => { readonly x: string; readonly y: string; readonly r: string }

/** The center of a circle and where it is furthest each way, as places to snap to and to refer to. */
const roundPlaces = ({ center, radius }: { center: Vec; radius: number }, code: RoundCode) => {
	const at = (dx: number, dy: number): Vec => [center[0] + dx * radius, center[1] + dy * radius]
	const side = (sx: '+' | '-' | null, sy: '+' | '-' | null): PlaceCode => p => {
		const { x, y, r } = code(p)
		return `[${sx === null ? x : `(${sx} ${x} ${r})`} ${sy === null ? y : `(${sy} ${y} ${r})`}]`
	}
	return [
		{ at: center, name: 'center', code: side(null, null) },
		{ at: at(1, 0), name: 'right', code: side('+', null) },
		{ at: at(0, 1), name: 'bottom', code: side(null, '+') },
		{ at: at(-1, 0), name: 'left', code: side('-', null) },
		{ at: at(0, -1), name: 'top', code: side(null, '-') },
	]
}

/** How far apart two places are, as code. */
const distanceCode = (ax: string, ay: string, bx: string, by: string): string =>
	`(sqrt (+ (* (- ${bx} ${ax}) (- ${bx} ${ax})) (* (- ${by} ${ay}) (- ${by} ${ay}))))`

/** The circle with its arguments at either end of a line through its center, as code. */
const diameterCode: RoundCode = p => {
	const [ax, ay, bx, by] = [p('arg0/0'), p('arg0/1'), p('arg1/0'), p('arg1/1')]
	// Half is what the middle is, and not what moving it would change.
	return {
		x: `(/ (+ ${ax} ${bx}) @2)`,
		y: `(/ (+ ${ay} ${by}) @2)`,
		r: `(/ ${distanceCode(ax, ay, bx, by)} @2)`,
	}
}

/** The circle through its three arguments, as code: around where they are all as far from. */
const throughCode: RoundCode = p => {
	const [ax, ay, bx, by, cx, cy] = ['arg0/0', 'arg0/1', 'arg1/0', 'arg1/1', 'arg2/0', 'arg2/1'].map(p) as [string, string, string, string, string, string]
	const square = (x: string, y: string) => `(+ (* ${x} ${x}) (* ${y} ${y}))`
	const [sa, sb, sc] = [square(ax, ay), square(bx, by), square(cx, cy)]
	const sum = (...terms: string[]) => terms.reduce((a, b) => `(+ ${a} ${b})`)
	const d = `(* @2 ${sum(`(* ${ax} (- ${by} ${cy}))`, `(* ${bx} (- ${cy} ${ay}))`, `(* ${cx} (- ${ay} ${by}))`)})`
	const x = `(/ ${sum(`(* ${sa} (- ${by} ${cy}))`, `(* ${sb} (- ${cy} ${ay}))`, `(* ${sc} (- ${ay} ${by}))`)} ${d})`
	const y = `(/ ${sum(`(* ${sa} (- ${cx} ${bx}))`, `(* ${sb} (- ${ax} ${cx}))`, `(* ${sc} (- ${bx} ${ax}))`)} ${d})`
	return { x, y, r: distanceCode(x, y, ax, ay) }
}

/** What a circle from places comes to, as a circle around its center: the next rung of it. */
const asCircle = ({ center, radius }: { center: Vec; radius: number }): AST =>
	callOf('circle', [toAst(center, null), toAst(radius, null)])

const makeCircleFromDiameter = withExpansion(
	makeTypedFn(
		[point, point],
		pathType,
		(a, b) => {
			const { center, radius } = circleOfDiameter(a as Vec, b as Vec)
			return new PathValue(circle(center, radius))
		},
		['a', 'b']
	),
	([a, b], { value }) =>
		a === undefined || b === undefined ? null : asCircle(circleOfDiameter(value(a) as Vec, value(b) as Vec))
)

const makeCircleThrough = withExpansion(
	makeTypedFn(
		[point, point, point],
		pathType,
		(a, b, c) => {
			const { center, radius } = circleThrough(a as Vec, b as Vec, c as Vec)
			return new PathValue(circle(center, radius))
		},
		['a', 'b', 'c']
	),
	([a, b, c], { value }) =>
		a === undefined || b === undefined || c === undefined
			? null
			: asCircle(circleThrough(value(a) as Vec, value(b) as Vec, value(c) as Vec))
)

/**
 * The arc from `start` through `through` to `end`: around the circle through all three, and the
 * way round that goes by `through`, in degrees as `path.arc` has them. Null for three in a line.
 */
function arcOfThree(start: Vec, through: Vec, end: Vec): { center: Vec; radius: number; from: number; to: number } | null {
	const turned = (through[0] - start[0]) * (end[1] - start[1]) - (through[1] - start[1]) * (end[0] - start[0])
	if (Math.abs(turned) < 1e-6) return null
	const { center, radius } = circleThrough(start, through, end)
	const angle = ([x, y]: Vec) => degrees([x - center[0], y - center[1]])
	const round = (a: number) => ((a % 360) + 360) % 360
	const from = angle(start)
	const [toThrough, toEnd] = [round(angle(through) - from), round(angle(end) - from)]
	return { center, radius, from, to: from + (toThrough < toEnd ? toEnd : toEnd - 360) }
}

/** An arc from `start` through `by` to `end`, or a line for those all in one line. */
function arcThrough(start: Vec, by: Vec, end: Vec): Path {
	const turned = (by[0] - start[0]) * (end[1] - start[1]) - (by[1] - start[1]) * (end[0] - start[0])
	return Math.abs(turned) < 1e-6 ? line(start, end) : arcByPoints(start, by, end)
}

const makeArcThrough = withExpansion(
	makeTypedFn(
		[point, point, point],
		pathType,
		(start, through, end) => new PathValue(arcThrough(start as Vec, through as Vec, end as Vec)),
		['start', 'through', 'end']
	),
	([start, through, end], { value }) => {
		if (start === undefined || through === undefined || end === undefined) return null
		const arc = arcOfThree(value(start) as Vec, value(through) as Vec, value(end) as Vec)
		return arc === null
			? null
			: callOf('arc', [toAst(arc.center, null), toAst(arc.radius, null), toAst(arc.from, null), toAst(arc.to, null)])
	}
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
	(...points) => new PathValue(points.length === 0 ? empty : polyline(...(points as Vec[]))),
	[],
	point,
	'points'
)
const makePolygon = makeTypedFn(
	[],
	pathType,
	(...points) => new PathValue(points.length === 0 ? empty : polygon(...(points as Vec[]))),
	[],
	point,
	'points'
)
const makeRect = withExpansion(
	makeTypedFn(
		[point, size],
		pathType,
		(origin, extent) =>
			new PathValue(rectangle(origin as Vec, add(origin as Vec, extent as Vec))),
		['origin', 'size']
	),
	([origin, size], { value }) => {
		if (origin === undefined || size === undefined) return null
		const [left, top] = value(origin) as Vec
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
const makeSquare = withExpansion(
	makeTypedFn(
		[point, sideType],
		pathType,
		(origin, side) =>
			new PathValue(
				rectangle(origin as Vec, add(origin as Vec, [side as number, side as number]))
			),
		['origin', 'size']
	),
	([origin, side]) =>
		origin === undefined || side === undefined
			? null
			: callOf('rect', [origin, new VecAST([side, side])])
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
const finiteAngle = (value: unknown): number => (Number.isFinite(value) ? (value as number) : 0)

/** As many as there can be sides, of which a shape has at least three. */
const sideCount = withTypeMeta(
	number,
	new RecordAST([
		['min', lit(3)],
		['step', lit(1)],
	])
)

const makeNgon = withExpansion(
	withOptional(
		makeTypedFn(
			[point, number, sideCount, angleType],
			pathType,
			(center, radius, sides, angle) =>
				new PathValue(
					regularPolygon(
						center as Vec,
						radius as number,
						Math.max(3, Math.round(sides as number)),
						Number.isFinite(angle) ? (angle as number) : 0
					)
				),
			['center', 'radius', 'sides', 'angle']
		),
		['angle']
	),
	([center, radius, sides, angle], { value }) => {
		if (center === undefined || radius === undefined || sides === undefined) return null
		const c = value(center) as Vec
		const r = value(radius) as number
		const count = Math.max(3, Math.round(value(sides) as number))
		const first = angle === undefined ? 0 : finiteAngle(value(angle))
		const vertices = Array.from({ length: count }, (_, i) =>
			toAst(add(c, toward(first + (360 / count) * i, r)), null)
		)
		return callOf('polygon', vertices)
	}
)
const makeArc = makeTypedFn(
	[point, number, angleType, angleType],
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
/** What is written can be anything, and what pave is asked for has to be something it can draw. */
const finite = (value: unknown): number => (Number.isFinite(value) ? (value as number) : 0)
const outward = (value: unknown): number => Math.max(0, finite(value))
const tipCount = (value: unknown): number => Math.max(2, Math.round(finite(value)))

const tipsOf = withTypeMeta(
	number,
	new RecordAST([
		['min', lit(2)],
		['step', lit(1)],
	])
)

const makeStar = withExpansion(
	withOptional(
		makeTypedFn(
			[point, number, number, tipsOf, angleType],
			pathType,
			(center, outer, inner, tips, angle) =>
				new PathValue(
					star(center as Vec, outward(outer), outward(inner), tipCount(tips), finite(angle))
				),
			['center', 'outerRadius', 'innerRadius', 'points', 'angle']
		),
		['angle']
	),
	([center, outer, inner, tips, angle], { value }) => {
		if (center === undefined || outer === undefined || inner === undefined || tips === undefined) {
			return null
		}
		const c = value(center) as Vec
		const count = tipCount(value(tips))
		const first = angle === undefined ? 0 : finite(value(angle))
		const vertices = Array.from({ length: count * 2 }, (_, i) =>
			toAst(
				add(c, toward(first + (180 / count) * i, outward(value(i % 2 === 0 ? outer : inner)))),
				null
			)
		)
		return callOf('polygon', vertices)
	}
)
const makeCapsule = makeTypedFn(
	[point, point, number],
	pathType,
	(start, end, radius) => new PathValue(capsule(start as Vec, end as Vec, outward(radius))),
	['start', 'end', 'radius']
)
const makeRoundRect = makeTypedFn(
	[point, size, cornerType],
	pathType,
	(origin, extent, radius) =>
		new PathValue(roundRect(origin as Vec, add(origin as Vec, extent as Vec), outward(radius))),
	['origin', 'size', 'radius']
)
/** How far what is worked out can be from what it should be, on the canvas. */
const toleranceType = withTypeMeta(
	withDefault(number, 0.05),
	new RecordAST([
		['min', lit(0.001)],
		['step', lit(0.01)],
	])
)
/** As fine as can be worked out, whatever is said. */
const toleranceOf = (tolerance: unknown): number => Math.max(finite(tolerance ?? 0.05) || 0.05, 0.001)
const makeSuperellipse = withOptional(
	makeTypedFn(
		[point, size, number, toleranceType],
		pathType,
		(center, radius, shape, tolerance) =>
			new PathValue(
				superellipse(center as Vec, radius as Vec, Number.isNaN(shape) ? 2 : (shape as number), {
					tolerance: toleranceOf(tolerance),
				})
			),
		['center', 'radius', 'shape', 'tolerance']
	),
	['tolerance']
)
const makeFan = makeTypedFn(
	[point, number, number, angleType, angleType],
	pathType,
	(center, inner, outer, start, end) =>
		new PathValue(
			fan(center as Vec, outward(inner), outward(outer), finite(start), finite(end))
		),
	['center', 'innerRadius', 'outerRadius', 'start', 'end']
)
const makeSpiral = withOptional(
	makeTypedFn(
		[point, number, number, number, toleranceType],
		pathType,
		(center, start, end, turns, tolerance) =>
			new PathValue(
				spiral(center as Vec, outward(start), outward(end), finite(turns), {
					tolerance: toleranceOf(tolerance),
				})
			),
		['center', 'startRadius', 'endRadius', 'turns', 'tolerance']
	),
	['tolerance']
)
/** How a clothoid is, as pave can draw it. */
const clothoidOf = (args: readonly unknown[]): Path =>
	clothoid(
		args[0] as Vec,
		finite(args[1]),
		outward(args[2]),
		finite(args[3]),
		finite(args[4]),
		{ tolerance: toleranceOf(args[5]) }
	)
const makeClothoid = withOptional(
	makeTypedFn(
		[point, angleType, number, number, number, toleranceType],
		pathType,
		(...args) => new PathValue(clothoidOf(args)),
		['start', 'angle', 'length', 'startCurvature', 'endCurvature', 'tolerance']
	),
	['tolerance']
)
const makeTransformed = makeTypedFn(
	[pathType, mat2d],
	pathType,
	(path, matrix) => new PathValue(transform((path as PathValue).path, matrix as Mat)),
	['path', 'by']
)
const stringType = evaluate(parse('string'), buildPrelude()).value as TypeValue
const colorMeta = new RecordAST([
	['input', lit('color')],
	['icon', lit('ph:palette')],
	['name', lit('color')],
])
/**
 * A color is a string, that CSS and SVG would read as one: which it can be told from
 * only by trying, and one that cannot be read is left for them to not draw.
 */
const colorOf = (fallback: string): TypeValue => withDefault(withTypeMeta(stringType, colorMeta), fallback)
const colorType = colorOf('#000000')
/** A color to draw with, which can be no color at all. */
const paintColor = colorOf('none')

export const toHex = (color: Color): string =>
	color.to('srgb').toGamut({ space: 'srgb' }).toString({ format: 'hex', collapse: false })

const parsed = (value: unknown): Color => {
	try {
		return new Color(value as string)
	} catch {
		return new Color('#000000')
	}
}

/** The channels of a color, in the space a function makes it in, to go back through. */
const channelsOf = (value: unknown, space: 'srgb' | 'hsl'): number[] => {
	const color = parsed(value).to(space)
	const [a, b, c] = color.coords
	const scale = space === 'hsl' ? [1, 0.01, 0.01] : [1, 1, 1]
	return [(a || 0) * scale[0]!, (b || 0) * scale[1]!, (c || 0) * scale[2]!, color.alpha ?? 1]
}

const makeRgb = makeTypedFn(
	[number, number, number],
	colorType,
	(r, g, b) => toHex(new Color('srgb', [r, g, b] as [number, number, number])),
	['red', 'green', 'blue']
)
const makeHsl = makeTypedFn(
	[degreesType, number, number],
	colorType,
	(h, s, l) => toHex(new Color('hsl', [h as number, (s as number) * 100, (l as number) * 100])),
	['hue', 'saturation', 'lightness']
)
const makeAlpha = withInverse(
	makeTypedFn(
		[colorType, number],
		colorType,
		(c, a) => {
			const color = parsed(c).clone()
			color.alpha = a as number
			return toHex(color)
		},
		['color', 'alpha']
	),
	(index, result, [c]) => (index === 1 ? channelsOf(result, 'srgb')[3] : c)
)
const makeGray = withInverse(
	makeTypedFn(
		[number],
		colorType,
		v => toHex(new Color('srgb', [v, v, v] as [number, number, number])),
		['value']
	),
	(_, result) => channelsOf(result, 'srgb')[0]
)
/** Lighter by this much in OKLCH, in which it looks like that much. */
const lighter = (value: unknown, by: number): string => {
	const color = parsed(value).to('oklch')
	color.coords[0] = Math.min(1, Math.max(0, (color.coords[0] || 0) + by))
	return toHex(color)
}
const LIGHTNESS_STEP = 0.1
const makeBrighter = makeTypedFn(
	[colorType, number],
	colorType,
	(c, by) => lighter(c, (by as number) * LIGHTNESS_STEP),
	['color', 'by']
)
const makeDarker = makeTypedFn(
	[colorType, number],
	colorType,
	(c, by) => lighter(c, -(by as number) * LIGHTNESS_STEP),
	['color', 'by']
)
const makeInverted = withInverse(
	makeTypedFn(
		[colorType],
		colorType,
		c => {
			const color = parsed(c).to('srgb')
			const [r, g, b] = color.coords
			return toHex(new Color('srgb', [1 - (r || 0), 1 - (g || 0), 1 - (b || 0)], color.alpha))
		},
		['color']
	),
	(_, result) => {
		const color = parsed(result).to('srgb')
		const [r, g, b] = color.coords
		return toHex(new Color('srgb', [1 - (r || 0), 1 - (g || 0), 1 - (b || 0)], color.alpha))
	}
)
export const styledType = withTypeMeta(
	said(
		makeType('styled', isStyled, new StyledValue(pathType.default as PathValue, NO_PAINT)),
		'path',
		'mdi:vector-curve'
	),
	// What wants a path and is pointed at one of these refers to the one that is in it.
	new RecordAST([['holds', lit('path')]])
)
/** An enum of how a line is drawn, each value saying what its icon is. */
const enumOf = (icons: Readonly<Record<string, string>>): TypeValue => {
	const values = Object.entries(icons).map(
		([value, icon]) => `(: ${JSON.stringify(value)} icon: ${JSON.stringify(icon)})`
	)
	return evaluate(parse(`(| ${values.join(' ')})`), buildPrelude()).value as TypeValue
}

/** What colors go from one to another by, and how it looks on the way. */
const colorSpaceType = enumOf({
	oklch: 'ph:circle-half',
	oklab: 'ph:drop-half',
	srgb: 'ph:monitor',
	hsl: 'ph:palette',
	lab: 'ph:drop',
	lch: 'ph:circle-half-tilt',
})
const spaceOf = (space: unknown): string => (typeof space === 'string' ? space : 'oklch')
const between = (a: unknown, b: unknown, t: number, space: unknown): string =>
	toHex(parsed(a).mix(parsed(b), t, { space: spaceOf(space) }) as Color)
/** Two colors, `ratio` of the way, through a space that can be said. */
const makeBetween = (): TypedHostFn =>
	withOptional(
		makeTypedFn(
			[colorType, colorType, percentType, colorSpaceType],
			colorType,
			(a, b, t, space) => between(a, b, t as number, space),
			['a', 'b', 'ratio', 'space']
		),
		['space']
	)
const mixed = makeBetween()
const makeRamp = withOptional(
	makeTypedFn(
		[withDefault(makeTupleType([], colorType), ['#000000', '#ffffff']), percentType, colorSpaceType],
		colorType,
		(colors, ratio, space) => {
			const stops = colors as readonly string[]
			if (stops.length === 0) return '#000000'
			const along = Math.max(0, Math.min(1, ratio as number)) * (stops.length - 1)
			const at = Math.min(Math.floor(along), stops.length - 2)
			return stops.length === 1
				? toHex(parsed(stops[0]))
				: between(stops[at], stops[at + 1], along - at, space)
		},
		['colors', 'ratio', 'space']
	),
	['space']
)
/** The channels of a color in OKLCH, in which how far they go is how far they look to go. */
const oklchOf = (value: unknown): readonly [number, number, number, number] => {
	const color = parsed(value).to('oklch')
	const [l, c, h] = color.coords
	return [l || 0, c || 0, h || 0, color.alpha ?? 1]
}
const fromOklch = (l: number, c: number, h: number, alpha: number): string =>
	toHex(
		new Color(
			'oklch',
			[Math.max(0, Math.min(1, l)), Math.max(0, c), ((h % 360) + 360) % 360],
			Math.max(0, Math.min(1, alpha))
		)
	)
const makeOklch = withOptional(
	makeTypedFn(
		[number, number, degreesType, withDefault(number, 1)],
		colorType,
		(l, c, h, alpha) => fromOklch(l as number, c as number, h as number, (alpha ?? 1) as number),
		['lightness', 'chroma', 'hue', 'alpha']
	),
	['alpha']
)
/** As a relative color is in CSS: what `color` has, each of them moved by as much as is said. */
const makeRelative = withOptional(
	makeTypedFn(
		[colorType, withDefault(number, 0), withDefault(number, 0), withDefault(degreesType, 0), withDefault(number, 0)],
		colorType,
		(color, l, c, h, alpha) => {
			const [ownL, ownC, ownH, ownAlpha] = oklchOf(color)
			return fromOklch(
				ownL + ((l ?? 0) as number),
				ownC + ((c ?? 0) as number),
				ownH + ((h ?? 0) as number),
				ownAlpha + ((alpha ?? 0) as number)
			)
		},
		['color', 'lightness', 'chroma', 'hue', 'alpha']
	),
	['lightness', 'chroma', 'hue', 'alpha']
)
const makeComplement = makeTypedFn(
	[colorType],
	colorType,
	color => {
		const [l, c, h, alpha] = oklchOf(color)
		return fromOklch(l, c, h + 180, alpha)
	},
	['color']
)
const channelOf = (at: 0 | 1 | 2 | 3, type: TypeValue): TypedHostFn =>
	makeTypedFn([colorType], type, color => oklchOf(color)[at], ['color'])

withMembers(colorType, {
	rgb: withDoc(makeRgb, 'A color from how much `red`, `green` and `blue` it has, from 0 to 1.', 'RGB'),
	hsl: withDoc(makeHsl, 'A color from its `hue` in degrees, and `saturation` and `lightness` from 0 to 1.', 'HSL'),
	oklch: withDoc(makeOklch, 'A color from how light it looks from 0 to 1, its `chroma`, and its `hue` in degrees, as OKLCH has them.', 'OKLCH'),
	gray: withDoc(makeGray, 'A gray, from black at 0 to white at 1.', 'Gray'),
	alpha: withDoc(makeAlpha, 'A `color`, as see-through as `alpha` says, from 0 to 1.', 'Alpha'),
	mix: withDoc(mixed, 'What `a` and `b` come to together, as far from `a` as `ratio` says, by way of a `space`.', 'Mix'),
	lerp: withDoc(makeBetween(), 'The color `ratio` of the way from `a` to `b`, by way of a `space`.', 'Lerp'),
	ramp: withDoc(makeRamp, 'The color `ratio` of the way along all of `colors`, as along a gradient.', 'Ramp'),
	from: withDoc(makeRelative, 'A `color` with its OKLCH channels moved by as much as is said, as a relative color is in CSS.', 'Relative Color'),
	brighten: withDoc(makeBrighter, 'A `color`, lighter by how much it looks.', 'Brighten'),
	darken: withDoc(makeDarker, 'A `color`, darker by how much it looks.', 'Darken'),
	invert: withDoc(makeInverted, 'The opposite of a `color`, channel by channel.', 'Invert'),
	complement: withDoc(makeComplement, 'A `color` with its hue on the other side, and as light as it was.', 'Complement'),
	lightnessOf: withDoc(channelOf(0, number), 'How light a `color` looks, from 0 to 1.', 'Lightness of'),
	chromaOf: withDoc(channelOf(1, number), 'How much of its hue a `color` has.', 'Chroma of'),
	hueOf: withDoc(channelOf(2, degreesType), 'The hue of a `color`, in degrees.', 'Hue of'),
	alphaOf: withDoc(channelOf(3, number), 'How opaque a `color` is, from 0 to 1.', 'Alpha of'),
})

/** Where a line stops is the upright, which each goes up to or past. */
const LINE_END = 'M12 5h1v14h-1z'
export const lineCapType = enumOf({
	butt: `fill:M3 8h9v8H3z${LINE_END}`,
	round: `fill:M3 8h9a4 4 0 0 1 0 8H3z${LINE_END}`,
	square: `fill:M3 8h13v8H3z${LINE_END}`,
})
export const lineJoinType = enumOf({
	miter: 'fill:M3 6h15v15h-6v-9H3z',
	round: 'fill:M3 6h9a6 6 0 0 1 6 6v9h-6v-9H3z',
	bevel: 'fill:M3 6h9l6 6v9h-6v-9H3z',
})

const numberOf = (fallback: number): TypeValue =>
	Object.create(number, { default: { value: fallback } }) as TypeValue

const makeStyled = withDoc(
	withOptional(
		makeTypedFn(
			[
				pathType,
				paintColor,
				paintColor,
				numberOf(NO_PAINT.width),
				lineCapType,
				lineJoinType,
				makeTupleType([], number),
				numberOf(NO_PAINT.dashOffset),
				numberOf(NO_PAINT.miterLimit),
			],
			styledType,
			(path, fill, stroke, width, cap, join, dash, dashOffset, miterLimit) =>
				new StyledValue(path as PathValue, {
					fill,
					stroke,
					width,
					cap,
					join,
					dash,
					dashOffset,
					miterLimit,
				} as Paint),
			['path', ...PAINT_KEYS]
		),
		PAINT_KEYS
	),
	'A `path`, with what it is filled with, and how its line is drawn: its color and `width`, its ends (`cap`), its corners (`join`, as far as `miterLimit`), and its `dash`, begun `dashOffset` along.',
	'Style'
)

/** What is drawn of an area. */
export const outlineOf = (area: RectValue): Path => {
	const [from, to] = cornersOf(area)
	return rectangle(from, to)
}

export const rectType = said(
	makeType('rect', isRect, new RectValue([0, 0], [100, 100])),
	'frame',
	'mdi:crop-free'
)

const makeArea = makeTypedFn(
	[point, size],
	rectType,
	(origin, extent) => new RectValue(origin as Vec, extent as Vec),
	['origin', 'size']
)

/** How far from a path something goes, which is 10 until it is said otherwise. */
const distanceType: TypeValue = { ...number, default: 10 }
const miterLimitType: TypeValue = { ...number, default: 10 }

const makeOffset = withOptional(
	makeTypedFn(
		[pathType, distanceType, lineJoinType, miterLimitType, toleranceType],
		pathType,
		(path, distance, join, miterLimit, tolerance) =>
			new PathValue(
				offset((path as PathValue).path, distance as number, {
					lineJoin: join as CanvasLineJoin,
					miterLimit: miterLimit as number,
					tolerance: toleranceOf(tolerance),
				})
			),
		['path', 'distance', 'join', 'miterLimit', 'tolerance']
	),
	['join', 'miterLimit', 'tolerance']
)

const makeOffsetStroke = withOptional(
	makeTypedFn(
		[pathType, distanceType, lineCapType, lineJoinType, miterLimitType, toleranceType],
		pathType,
		(path, width, cap, join, miterLimit, tolerance) =>
			new PathValue(
				offsetStroke((path as PathValue).path, width as number, {
					lineCap: cap as CanvasLineCap,
					lineJoin: join as CanvasLineJoin,
					miterLimit: miterLimit as number,
					tolerance: toleranceOf(tolerance),
				})
			),
		['path', 'width', 'cap', 'join', 'miterLimit', 'tolerance']
	),
	['cap', 'join', 'miterLimit', 'tolerance']
)

const makeBlend = makeTypedFn(
	[pathType, pathType, percentType],
	pathType,
	(a, b, ratio) =>
		new PathValue(blend((a as PathValue).path, (b as PathValue).path, ratio as number)),
	['a', 'b', 'ratio']
)

/** One path made from two or more, by how much of each there is to have. */
const combining = (
	combine: (paths: Path[]) => Path,
	names: readonly [string, string],
	rest: string
): TypedHostFn =>
	makeTypedFn(
		[pathType, pathType],
		pathType,
		(...paths) => new PathValue(combine((paths as PathValue[]).map(({ path }) => path))),
		[...names],
		pathType,
		rest
	)

const makeUnite = combining(unite, ['a', 'b'], 'others')
const makeSubtract = combining(([subject, ...tools]) => subtract(subject!, tools), ['subject', 'tool'], 'tools')
const makeIntersect = combining(intersect, ['a', 'b'], 'others')
const makeExclude = combining(exclude, ['a', 'b'], 'others')

const makeBounds = makeTypedFn(
	[pathType],
	rectType,
	value => {
		const [[left, top], [right, bottom]] = bounds((value as PathValue).path)
		// A path with nothing on it has no bounds to speak of, and is nowhere.
		if (!Number.isFinite(left)) return new RectValue([0, 0], [0, 0])
		return new RectValue([left, top], [right - left, bottom - top])
	},
	['path']
)

const pathOf = (value: unknown): Path => (value as PathValue).path

/** How a path is around the middle of it, and how far that goes. */
const aroundOf = (path: Path): { middle: Vec; reach: number } => {
	const [[left, top], [right, bottom]] = bounds(path)
	return {
		middle: [(left + right) / 2, (top + bottom) / 2],
		reach: Math.max(right - left, bottom - top) / 2,
	}
}

const makeRoundCorners = makeTypedFn(
	[pathType, withDefault(cornerType, 10)],
	pathType,
	(path, radius) => new PathValue(fillet(pathOf(path), radius as number)),
	['path', 'radius']
)
const makeChamfer = makeTypedFn(
	[pathType, distanceType],
	pathType,
	(path, distance) => new PathValue(chamfer(pathOf(path), distance as number)),
	['path', 'distance']
)
/** Only a bar, from edge to edge, with no ends to say that it stops anywhere. */
export const STRAIGHT_LINE_ICON = 'stroke:M1 23L23 1'
/**
 * A straight line, going on for ever: a place on it, and which way it goes. Which way it goes
 * is the side of it that a mirror keeps, and how it comes about has handles of its own.
 */
const lineType = withTypeMeta(
	makeTupleType([
		withTypeMeta(point, new RecordAST([['title', lit('Through')]])),
		withTypeMeta(vec2, new RecordAST([['title', lit('Direction')]])),
	]),
	new RecordAST([
		['draw', lit('line')],
		['icon', lit(STRAIGHT_LINE_ICON)],
		['name', lit('line')],
		['summary', lit('Line')],
	])
)
export type StraightLine = readonly [Vec, Vec]
const makeLineFromPoints = makeTypedFn(
	[point, point],
	lineType,
	(from, to) => [from as Vec, sub(to as Vec, from as Vec)],
	['from', 'to']
)
const makeLineAt = withOptional(
	makeTypedFn(
		[point, angleType],
		lineType,
		(through, angle) => [through as Vec, toward(angle as number, 1)],
		['through', 'angle']
	),
	['angle']
)
withMembers(lineType, {
	fromPoints: withDoc(makeLineFromPoints, 'The line through `from` and `to`, going that way.', 'Line Through Points'),
	at: withDoc(makeLineAt, 'The line `through` a place, going toward `angle`, in degrees.', 'Line at an Angle'),
})
/** A line to start from, which says how it is one, for it to have handles to take hold of. */
const lineOfType = withDefaultFrom(
	lineType,
	new RecordAST([['default', parse('(line.fromPoints [0 0] [0 100])')]]),
	{
		ast: new LetAST([], null),
		parent: buildPrelude(),
		bindings: new Map([['line', { ast: host(lineType), env: null }]]),
	}
).type
/** An arrow from where it starts, as a ray goes one way only. */
export const RAY_ICON = 'ph:arrow-up-right'
/**
 * A ray, going on for ever one way: where it starts, and which way it goes, in degrees. It is
 * what geome calls a Ray, and comes to the matrix whose x-axis goes along it.
 */
const rayType = withTypeMeta(
	makeRecordType(
		new Map([
			['origin', withTypeMeta(point, new RecordAST([['title', lit('Origin')]]))],
			['angle', angleType],
		])
	),
	new RecordAST([
		['draw', lit('ray')],
		['icon', lit(RAY_ICON)],
		['name', lit('ray')],
		['summary', lit('Ray')],
	])
)
const makeRayFromPoints = makeTypedFn(
	[point, point],
	rayType,
	// Through where it starts, it goes the way it went before, which is along x
	(origin, through) => Ray.fromPoints(origin as Vec, through as Vec) ?? Ray.of(origin as Vec, 0),
	['origin', 'through']
)
const makeRayAt = withOptional(
	makeTypedFn(
		[point, angleType],
		rayType,
		(origin, angle) => Ray.of(origin as Vec, (angle ?? 0) as number),
		['origin', 'angle']
	),
	['angle']
)
const makeRayAlong = withOptional(
	makeTypedFn(
		[pathType, distanceType],
		rayType,
		(path, at) => pathRay(pathOf(path), { offset: (at ?? 0) as number }),
		['path', 'at']
	),
	['at']
)
withMembers(rayType, {
	fromPoints: withDoc(makeRayFromPoints, 'The ray from `origin`, going through `through`.', 'Ray Through Points'),
	at: withDoc(makeRayAt, 'The ray from `origin`, going toward `angle`, in degrees.', 'Ray at an Angle'),
	along: withDoc(makeRayAlong, 'The ray from the place `at` that far along `path`, going the way the path goes there.', 'Ray Along a Path'),
})
/** What is across a line, which has to go some way for there to be an other side. */
const acrossIt = (fn: (path: Path, axis: readonly [Vec, Vec]) => Path) =>
	(path: unknown, across: unknown): PathValue => {
		const [through, direction] = across as StraightLine
		return new PathValue(
			direction[0] === 0 && direction[1] === 0
				? pathOf(path)
				: fn(pathOf(path), [through, add(through, direction)])
		)
	}
/** A line down the far side of `path`, that it is on the side of. */
const lineAlongside = (path: unknown): readonly unknown[] => {
	const [[, top], [right, bottom]] = bounds(pathOf(path))
	return [new CallAST(parse('line.fromPoints'), [toAst([right, top], null), toAst([right, bottom], null)])]
}
const makeMirror = withInitial(
	makeTypedFn([pathType, lineOfType], pathType, acrossIt(mirror), ['path', 'line']),
	lineAlongside
)
const makeReflect = withInitial(
	makeTypedFn([pathType, lineOfType], pathType, acrossIt(reflect), ['path', 'line']),
	lineAlongside
)
/** A path to start from, where there is none yet, written as what it is rather than its data. */
const startingAs = (written: string, path: Path): TypeValue => {
	const plain = Object.create(pathType.plain ?? pathType, {
		default: { value: new PathValue(path) },
		defaultAst: { value: parse(written) },
	}) as TypeValue
	return pathType.meta ? withTypeMeta(plain, pathType.meta) : plain
}
/** How many mirrors meet, which are at least the one. */
const mirrorCount = withTypeMeta(
	withDefault(number, 6),
	new RecordAST([
		['min', lit(1)],
		['step', lit(1)],
	])
)
/** The most mirrors, as what is between them gets too thin to see well before that. */
const MOST_MIRRORS = 180
const mirrorsOf = (count: unknown): number =>
	Math.max(1, Math.min(Math.round(finite(count)), MOST_MIRRORS))
const makeKaleidoscope = withInitial(
	withOptional(
		makeTypedFn(
			[pathType, point, mirrorCount, angleType],
			pathType,
			(path, center, count, angle) =>
				new PathValue(kaleidoscope(pathOf(path), center as Vec, mirrorsOf(count), finite(angle))),
			['path', 'center', 'count', 'angle']
		),
		['angle']
	),
	(path: unknown) => [aroundOf(pathOf(path)).middle]
)
/** The corners of a shape that is all straight sides, for a tile to be. */
const cornersOfTile = (path: Path): Vec[] | null => {
	const [curve, ...others] = (path as unknown as { curves: readonly Curve[] }).curves
	if (curve === undefined || others.length > 0 || !curve.closed) return null
	return curve.vertices.every(({ command }) => command === 'L')
		? curve.vertices.map(({ point }) => point as unknown as Vec)
		: null
}
const makeKaleidoscopeTile = withInitial(
	makeTypedFn(
		[
			pathType,
			startingAs('(path.rect [0 0] [100 100])', rectangle([0, 0], [100, 100])),
			withDefault(rectType, new RectValue([-100, -100], [300, 300])),
		],
		pathType,
		(path, cell, area) => {
			const corners = cornersOfTile(pathOf(cell))
			if (corners === null) return path
			const [from, to] = cornersOf(area as RectValue)
			try {
				return new PathValue(kaleidoscopeTile(pathOf(path), corners, [from, to]))
			} catch {
				// Not a shape whose reflections fit together, which it may be on the way to.
				return path
			}
		},
		['path', 'cell', 'area']
	),
	(path: unknown) => {
		const [[left, top], [right, bottom]] = bounds(pathOf(path))
		const [width, height] = [right - left, bottom - top]
		// What has no width or no height has as much of one as of the other, for there to be a tile.
		const [w, h] = [width || height || 100, height || width || 100]
		return [
			new CallAST(parse('path.rect'), [toAst([left, top], null), toAst([w, h], null)]),
			new CallAST(parse('rect'), [toAst([left - w, top - h], null), toAst([w * 3, h * 3], null)]),
		]
	}
)
const lengthOf = (value: number): TypeValue => withDefault(number, value)
const booleanType = evaluate(parse('boolean'), buildPrelude()).value as TypeValue
const makeZigzag = withOptional(
	makeTypedFn(
		[pathType, lengthOf(5), lengthOf(20), withDefault(booleanType, false), withDefault(number, 0)],
		pathType,
		(path, amplitude, wavelength, smooth, phase) =>
			new PathValue(
				zigzag(pathOf(path), amplitude as number, wavelength as number, {
					smooth: (smooth ?? false) as boolean,
					phase: (phase ?? 0) as number,
				})
			),
		['path', 'amplitude', 'wavelength', 'smooth', 'phase']
	),
	['smooth', 'phase']
)
const makeWave = withOptional(
	makeTypedFn(
		[
			pathType,
			lengthOf(5),
			lengthOf(40),
			withDefault(angleType, 0),
			withDefault(angleType, 0),
			withDefault(point, [0, 0]),
			toleranceType,
		],
		pathType,
		(path, amplitude, wavelength, phase, angle, origin, tolerance) =>
			new PathValue(
				wave(pathOf(path), amplitude as number, wavelength as number, {
					phase: (phase ?? 0) as number,
					angle: (angle ?? 0) as number,
					origin: (origin ?? [0, 0]) as Vec,
					tolerance: toleranceOf(tolerance),
				})
			),
		['path', 'amplitude', 'wavelength', 'phase', 'angle', 'origin', 'tolerance']
	),
	['phase', 'angle', 'origin', 'tolerance']
)
const makeTwirl = withInitial(
	withOptional(
		makeTypedFn(
			[pathType, point, number, withDefault(angleType, 90), toleranceType],
			pathType,
			(path, center, radius, angle, tolerance) =>
				new PathValue(
					twirl(pathOf(path), center as Vec, radius as number, angle as number, {
						tolerance: toleranceOf(tolerance),
					})
				),
			['path', 'center', 'radius', 'angle', 'tolerance']
		),
		['tolerance']
	),
	(path: unknown) => {
		const { middle, reach } = aroundOf(pathOf(path))
		return [middle, reach * 1.5]
	}
)
const makeBulge = withInitial(
	withOptional(
		makeTypedFn(
			[pathType, point, number, withDefault(number, 0.5), toleranceType],
			pathType,
			(path, center, radius, strength, tolerance) =>
				new PathValue(
					bulge(pathOf(path), center as Vec, radius as number, strength as number, {
						tolerance: toleranceOf(tolerance),
					})
				),
			['path', 'center', 'radius', 'strength', 'tolerance']
		),
		['tolerance']
	),
	(path: unknown) => {
		const { middle, reach } = aroundOf(pathOf(path))
		return [middle, reach * 1.5]
	}
)
/** Which cells a shape fills: those it gets into, those it has the center of, or those it covers. */
const pixelateModeType = enumOf({
	center: 'ph:crosshair',
	overlap: 'ph:selection-all',
	full: 'ph:square-fill',
})
/** Where the outline of the cells has anchors: where it turns, or at every cell along it too. */
const pixelateAnchorsType = enumOf({
	corners: 'ph:corners-out',
	cells: 'ph:dots-nine',
})
/** How much of a QR code can be lost and it still reads: about 7, 15, 25 and 30 percent. */
const qrLevelType = withDefault(
	enumOf({
		L: 'ph:cell-signal-low',
		M: 'ph:cell-signal-medium',
		Q: 'ph:cell-signal-high',
		H: 'ph:cell-signal-full',
	}),
	'M'
)
/** Where the outline of a QR code has anchors: where it turns, at every module, or at every one but in the finders. */
const qrAnchorsType = enumOf({
	corners: 'ph:corners-out',
	cells: 'ph:dots-nine',
	cellsButFinders: 'ph:qr-code',
})
const makeQr = withOptional(
	makeTypedFn(
		[point, sideType, withDefault(stringType, 'https://glisp.app'), qrLevelType, qrAnchorsType],
		pathType,
		(origin, side, text, level, anchors) => {
			const modules = qrModules(String(text ?? ''), QR_LEVELS.includes(level as QrLevel) ? (level as QrLevel) : 'M')
			if (modules === null) return new PathValue(empty)
			const along = anchors === 'cells' || (anchors === 'cellsButFinders' && outsideFinders(modules.length))
			const loops = qrOutline(modules, origin as Vec, (side as number) / modules.length, along)
			return new PathValue(loops.length === 0 ? empty : merge(loops.map(loop => polygon(...(loop as Vec[])))))
		},
		['origin', 'size', 'text', 'level', 'anchors']
	),
	['level', 'anchors']
)
const makePixelate = withInitial(
	withOptional(
		makeTypedFn(
			[pathType, withDefault(rectType, new RectValue([0, 0], [10, 10])), pixelateModeType, pixelateAnchorsType],
			pathType,
			(path, cell, mode, anchors) => {
				try {
					return new PathValue(
						pixelate(pathOf(path), cornersOf(cell as RectValue) as [Vec, Vec], {
							mode: (mode ?? 'center') as PixelateMode,
							anchors: (anchors ?? 'corners') as PixelateAnchors,
						})
					)
				} catch {
					// A cell with no size, or too small for how far the shape goes, which it may be on the way to.
					return path
				}
			},
			['path', 'cell', 'mode', 'anchors']
		),
		['mode', 'anchors']
	),
	(path: unknown) => {
		const [[left, top], [right, bottom]] = bounds(pathOf(path))
		const side = Math.max(right - left, bottom - top) / 16 || 10
		return [new CallAST(parse('rect'), [toAst([left, top], null), toAst([side, side], null)])]
	}
)
const makeDash = withOptional(
	makeTypedFn(
		[pathType, withDefault(makeTupleType([], number), [10, 5]), withDefault(number, 0)],
		pathType,
		(path, pattern, offset) =>
			new PathValue(dash(pathOf(path), pattern as number[], { offset: (offset ?? 0) as number })),
		['path', 'pattern', 'offset']
	),
	['offset']
)
/** As many times as a matrix can be applied and still be drawn, either way. */
const MOST_TIMES = 1000
const timesType = (times: number): TypeValue =>
	withTypeMeta(withDefault(number, times), new RecordAST([['step', lit(1)]]))
/** `path` with `m` applied each whole number of times from `from` to `to`, going back by its inverse. */
function replicated(path: Path, m: Mat, from: number, to: number): Path {
	const times = (n: number): number => Math.max(-MOST_TIMES, Math.min(Math.round(n), MOST_TIMES))
	const first = Math.min(times(from), times(to))
	const last = Math.max(times(from), times(to))
	const inverse = first < 0 ? (Mat2d.invert(m) as unknown as Mat | null) : null
	const after = (a: Mat, b: Mat): Mat => Mat2d.mul(a, b) as unknown as Mat
	const I = Mat2d.I as unknown as Mat
	const copies: Path[] = []
	// Outward from the path itself, each from the one before it.
	for (let n = 0, at = I; n <= last; n++, at = after(at, m)) {
		if (n >= first) copies.push(transform(path, at))
	}
	if (inverse !== null) {
		for (let n = 1, at = inverse; n <= -first; n++, at = after(at, inverse)) {
			if (-n <= last) copies.unshift(transform(path, at))
		}
	}
	return merge(copies)
}
/** The same matrix, starting as what is easiest to read of one: moving a little to the right. */
const nextCopyType = withDefaultFrom(
	mat2d,
	new RecordAST([['default', parse('(mat2d.trs [50 0])')]]),
	{
		ast: new LetAST([], null),
		parent: buildPrelude(),
		bindings: new Map([['mat2d', { ast: host(mat2d), env: null }]]),
	}
).type
const makeReplicate = makeTypedFn(
	[pathType, nextCopyType, timesType(0), timesType(3)],
	pathType,
	(path, by, from, to) =>
		new PathValue(replicated(pathOf(path), by as Mat, from as number, to as number)),
	['path', 'by', 'from', 'to']
)
/** `a`, as many steps as it is given between, and `b`, as one path. */
const makeBlendSteps = makeTypedFn(
	[
		pathType,
		pathType,
		withTypeMeta(
			withDefault(number, 3),
			new RecordAST([
				['min', lit(0)],
				['step', lit(1)],
			])
		),
	],
	pathType,
	(a, b, steps) => {
		const [from, to] = [pathOf(a), pathOf(b)]
		const between = Math.max(0, Math.min(Math.round(steps as number), MOST_TIMES))
		return new PathValue(merge([from, ...blendSeries(from, to, between), to]))
	},
	['a', 'b', 'steps']
)
/** How copies go along a path: by itself, it is whatever has no copy on top of another. */
const repeatAlignType = enumOf({
	auto: 'mdi:auto-fix',
	uniform: 'mdi:distribute-horizontal-center',
	start: 'mdi:align-horizontal-left',
	center: 'mdi:align-horizontal-center',
	end: 'mdi:align-horizontal-right',
})
const makeRepeatAlong = withOptional(
	makeTypedFn(
		[
			startingAs('(path.circle [0 0] 100)', circle([0, 0], 100)),
			startingAs('(path.circle [0 0] 10)', circle([0, 0], 10)),
			withTypeMeta(
				withDefault(number, 10),
				new RecordAST([
					['min', lit(0)],
					['step', lit(1)],
				])
			),
			withDefault(number, 0),
			withDefault(booleanType, true),
			repeatAlignType,
			withTypeMeta(withDefault(number, 0), new RecordAST([['min', lit(0)]])),
		],
		pathType,
		(along, stamp, count, offset, rotate, align, spacing) => {
			const path = pathOf(along)
			const shape = pathOf(stamp)
			const [[left, top], [right, bottom]] = bounds(shape)
			// A shape is drawn somewhere, and it is its middle that goes on the path.
			const centered = Number.isFinite(left)
				? transform(shape, Mat2d.fromTranslation([-(left + right) / 2, -(top + bottom) / 2]))
				: shape
			const closes = path.curves.length === 1 && path.curves[0]!.closed
			return new PathValue(
				repeatAlong(path, centered, {
					count: Math.min(Math.round((count ?? 10) as number), MOST_TIMES),
					// As far as it takes each, of a length that is not too many of them.
					...(((spacing ?? 0) as number) > 0
						? { spacing: Math.max(spacing as number, pathLength(path) / MOST_TIMES) }
						: {}),
					offset: (offset ?? 0) as number,
					rotate: (rotate ?? true) as boolean,
					align: ((align ?? 'auto') === 'auto' ? (closes ? 'start' : 'uniform') : align) as RepeatAlongOptions['align'],
				})
			)
		},
		['path', 'stamp', 'count', 'offset', 'rotate', 'align', 'spacing']
	),
	['count', 'offset', 'rotate', 'align', 'spacing']
)
const makeShadow = makeTypedFn(
	[pathType, withDefault(translationType, [40, 40])],
	pathType,
	(path, by) => {
		const [x, y] = by as Vec
		const length = Math.hypot(x, y)
		return new PathValue(length === 0 ? pathOf(path) : shadow(pathOf(path), [x, y], length))
	},
	['path', 'by']
)
const makeShadowFrom = withInitial(
	makeTypedFn(
		[pathType, point, withDefault(number, 2)],
		pathType,
		(path, light, scale) => new PathValue(shadowFrom(pathOf(path), light as Vec, scale as number)),
		['path', 'light', 'scale']
	),
	(path: unknown) => {
		const [[left, top]] = bounds(pathOf(path))
		return [[left - 40, top - 40]]
	}
)
/** How far a ray that hits nothing goes on, past anywhere to look. */
const RAY_REACH = 20000
const makeRay = withInitial(
	makeTypedFn(
		[pathType, point, point],
		pathType,
		(path, from, through) => {
			const start = from as Vec
			const way = sub(through as Vec, start)
			if (way[0] === 0 && way[1] === 0) return new PathValue(empty)
			const hit = raycast(pathOf(path), start, way)[0]
			const by = RAY_REACH / Math.hypot(way[0], way[1])
			return new PathValue(
				line(start, hit?.point ?? [start[0] + way[0] * by, start[1] + way[1] * by])
			)
		},
		['path', 'from', 'through']
	),
	(path: unknown) => {
		const [[left, top], [right, bottom]] = bounds(pathOf(path))
		const y = (top + bottom) / 2
		return [
			[left - 40, y],
			[(left + right) / 2, y],
		]
	}
)
const makeSubdivide = makeTypedFn(
	[
		pathType,
		withTypeMeta(
			withDefault(number, 2),
			new RecordAST([
				['min', lit(1)],
				['step', lit(1)],
			])
		),
	],
	pathType,
	(path, division) => new PathValue(subdivide(pathOf(path), division as number)),
	['path', 'division']
)
const makeFlatten = makeTypedFn(
	[pathType, withDefault(number, 1)],
	pathType,
	(path, tolerance) => new PathValue(flatten(pathOf(path), tolerance as number)),
	['path', 'tolerance']
)
const makeReverse = makeTypedFn([pathType], pathType, path => new PathValue(reverse(pathOf(path))), ['path'])
const makeConvexHull = makeTypedFn(
	[],
	pathType,
	(...paths) => new PathValue(paths.length === 0 ? empty : convexHull(merge(paths.map(pathOf)))),
	[],
	pathType,
	'path'
)

withMembers(rectType, {
	new: withDoc(makeArea, 'An area from its `origin`, of this `size`, such as a page to export.', 'Area'),
})
// What a rect is made of is where it is and how big, which is what calling it takes
withConstructor(rectType, makeArea)

// -----------------------------------------------------------------------------
// An artboard: a page on the canvas, with what is on it measured from its corner
// -----------------------------------------------------------------------------

const ARTBOARD_FILL = '#ffffff'

/**
 * A page of the canvas: an `area`, filled, holding `layers` that are measured from its
 * top left corner, so that it goes where it is moved with all of them, and what goes past
 * its edge is cut off there if it `clip`s.
 */
export class ArtboardValue {
	constructor(
		readonly area: RectValue,
		readonly layers: readonly unknown[],
		readonly fill: string,
		readonly clip: boolean
	) {}
}

export const isArtboard = (value: unknown): value is ArtboardValue => value instanceof ArtboardValue

/** Where what is on an artboard is measured from, on the canvas. */
export const artboardMatrix = ({ area }: ArtboardValue): Mat => [1, 0, 0, 1, area.origin[0], area.origin[1]]

export const ARTBOARD_ICON = 'mdi:artboard'

export const artboardType = withTypeMeta(
	said(
		makeType('artboard', isArtboard, new ArtboardValue(new RectValue([0, 0], [100, 100]), [], ARTBOARD_FILL, true)),
		'artboard',
		ARTBOARD_ICON
	),
	// Gone into, an artboard is what is on it.
	new RecordAST([['holds', lit('layers')]])
)

/** A sketch, before it is defined below: what an artboard holds is one, and a sketch holds artboards. */
let sketchType: TypeValue | null = null
const sketchRef = makeLazyType('Sketch', () => sketchType)

/** Whether `fn` makes an artboard, whose argument at 1 is what is on it. */
export const makesArtboard = (fn: unknown): boolean => fn === makeArtboard

/** Which of the arguments of an artboard holds what is on it. */
export const ARTBOARD_LAYERS = 1

const makeArtboard = withDoc(
	withOptional(
		makeTypedFn(
			[rectType, sketchRef, colorOf(ARTBOARD_FILL), withDefault(booleanType, true)],
			artboardType,
			(area, layers, fill, clip) =>
				new ArtboardValue(area as RectValue, (layers as unknown[]) ?? [], fill as string, clip as boolean),
			['area', 'layers', 'fill', 'clip']
		),
		['layers', 'fill', 'clip']
	),
	'A page of the canvas, over an `area` filled with `fill`, holding `layers` that are measured from its top left corner, and cut off at its edge if it `clip`s. It is exported by itself as that area.',
	'Artboard'
)

/**
 * What is on a sketch, as far as a canvas goes: a path, styled or not, a guide, an artboard, or
 * a sketch of its own. A sketch is a vector of these, so what a program draws (`main`), what an
 * artboard holds, and a group are all one type, and go the same way.
 */
sketchType = withTypeMeta(
	makeTupleType(
		[],
		withTypeMeta(
			makeUnionType([pathType, styledType, point, lineType, rayType, rectType, artboardType, sketchRef]),
			// Any of these may be on a sketch: it is not for one of them to be chosen over another.
			new RecordAST([['choices', lit(false)]])
		)
	),
	new RecordAST([
		['name', lit('Sketch')],
		['summary', lit('Sketch')],
		['icon', lit('ph:tree-view')],
	])
)

/**
 * What is shown whole among layers, with what it is made from under it, rather than left to an
 * inspector: a sketch lists all it holds, and anything else what is of these in it.
 */
export const SHOWN_WHOLE: readonly TypeValue[] = [pathType, styledType, artboardType, sketchType]


// -----------------------------------------------------------------------------
// What the brushes draw, each of which comes to the same however often it is worked out
// -----------------------------------------------------------------------------

const placesType = makeTupleType([], point)

/** Where a Dubins path stops on the way, the way it goes through there, and how tightly it came there if it says. */
type DubinsStop = readonly [Vec, number, number?]
const dubinsStopsType = makeTupleType(
	[],
	makeTupleType(
		[
			withTypeMeta(point, new RecordAST([['title', lit('At')]])),
			withTypeMeta(angleType, new RecordAST([['title', lit('Angle')]])),
		],
		withTypeMeta(number, new RecordAST([['title', lit('Radius')]]))
	)
)
/** A stop as what can be worked on: an x, a y, an angle, and a radius if it has one. */
const flatStop = ([[x, y], angle, ...rest]: DubinsStop): number[] => [x, y, angle, ...(rest as number[])]
const nestedStop = ([x = 0, y = 0, angle = 0, ...rest]: readonly number[]): DubinsStop =>
	[[x, y], angle, ...rest] as unknown as DubinsStop
const manyStyled = makeTupleType([], styledType)

const lerped = (a: number, b: number, t: number): number => a + (b - a) * t
const merged = (paths: readonly Path[]): PathValue =>
	new PathValue(paths.length === 0 ? empty : merge([...paths]))

/**
 * Where a path goes through, and how it comes in and goes out of there: a place by itself,
 * which a path goes straight in and out of, or one with handles, which it curves toward.
 * A handle not said is none, so a curve on one side only is said by one handle.
 */
const anchorWithHandles = withTypeMeta(
	makeRecordType(
		new Map([
			['at', point],
			['in', point],
			['out', point],
		]),
		new Set(['in', 'out'])
	),
	new RecordAST([['name', lit('handles')]])
)
const anchorType = makeUnionType([point, anchorWithHandles])
const anchorsType = makeTupleType([], anchorType)

/** An anchor as its place and handles, whichever way it is written. */
export interface AnchorParts {
	readonly at: Vec
	readonly in?: Vec
	readonly out?: Vec
}

export const partsOfAnchor = (anchor: unknown): AnchorParts =>
	Array.isArray(anchor) ? { at: anchor as unknown as Vec } : (anchor as AnchorParts)

const placeInD = ([x, y]: Vec): string => `${Number(x.toFixed(4))},${Number(y.toFixed(4))}`

/** An SVG path's data, through `anchors` in turn, and back to the first if `closed`. */
export function dOfAnchorValues(anchors: readonly unknown[], closed: boolean): string {
	const all = anchors.map(partsOfAnchor)
	const [first] = all
	if (first === undefined) return ''
	const stops = closed ? [...all.slice(1), first] : all.slice(1)
	let from = first
	const parts = [`M ${placeInD(first.at)}`]
	for (const to of stops) {
		parts.push(
			from.out === undefined && to.in === undefined
				? `L ${placeInD(to.at)}`
				: `C ${placeInD(from.out ?? from.at)} ${placeInD(to.in ?? to.at)} ${placeInD(to.at)}`
		)
		from = to
	}
	if (closed) parts.push('Z')
	return parts.join(' ')
}

const pathOfAnchors = (anchors: readonly unknown[], closed: boolean): PathValue => {
	const d = dOfAnchorValues(anchors, closed)
	return d === '' ? new PathValue(empty) : new PathValue(fromD(d))
}

/** A path through anchors, each of which can be worked on as it is, and its next rung is its data. */
const makeAnchors = withExpansion(
	withOptional(
		makeTypedFn(
			[anchorsType, booleanType],
			pathType,
			(anchors, closed) => pathOfAnchors(anchors as unknown[], closed as boolean),
			['anchors', 'closed']
		),
		['closed']
	),
	([anchors, closed], { value }) =>
		anchors === undefined
			? null
			: callOf('d', [lit(dOfAnchorValues(value(anchors) as unknown[], closed === undefined ? false : value(closed) === true))])
)

const makeDubinsChain = makeTypedFn(
	[dubinsStopsType, numberOf(20)],
	pathType,
	(stops, radius) => {
		const all = (stops as DubinsStop[]).map(flatStop)
		return merged(
			all.slice(1).map((stop, i) => {
				// As tightly as the stop it is coming to says, or else as all of them do.
				const [ax = 0, ay = 0, aAngle = 0] = all[i]!
				const [bx = 0, by = 0, bAngle = 0, bRadius = radius as number] = stop
				return dubins([ax, ay], aAngle, [bx, by], bAngle, Math.max(bRadius, 1e-3))
			})
		)
	},
	['stops', 'radius']
)

const painted = (path: Path, fill: string): StyledValue =>
	new StyledValue(new PathValue(path), { ...NO_PAINT, fill })

const makeSpray = withDoc(
	makeTypedFn(
		[placesType, seedType, numberOf(5), numberOf(20), numberOf(40), colorType, colorType],
		manyStyled,
		(places, seed, smallest, largest, scatter, fill, fill2) =>
			(places as Vec[]).map(([x, y], i) => {
				const random = (what: string): number => randomAt([seed as never, what], i)
				const s = scatter as number
				// Evenly over a disc, so that it is as far as a circle says in any direction.
				const out = Math.sqrt(random('out')) * s
				const around = random('around') * Math.PI * 2
				const at: Vec = [x + Math.cos(around) * out, y + Math.sin(around) * out]
				const radius = lerped(smallest as number, largest as number, random('radius'))
				return painted(circle(at, radius), mixed(fill, fill2, random('color')) as string)
			}),
		['places', 'seed', 'smallest', 'largest', 'scatter', 'fill', 'fill2']
	),
	'Dots scattered within `scatter` of each of `places`, as `seed` has it, between `smallest` and `largest`, and between the colors `fill` and `fill2`.',
	'Spray'
)

const makeTriangleStrip = withDoc(
	makeTypedFn(
		[placesType, seedType, colorType, colorType],
		manyStyled,
		(places, seed, fill, fill2) => {
			const all = places as Vec[]
			return all.slice(2).map((c, i) =>
				painted(polygon(all[i]!, all[i + 1]!, c), mixed(fill, fill2, randomAt(seed, i)) as string)
			)
		},
		['places', 'seed', 'fill', 'fill2']
	),
	'A triangle of each three of `places` in a row, as `seed` has it between the colors `fill` and `fill2`.',
	'Triangle Strip'
)

withMembers(pathType, {
	dubinsChain: withDoc(makeDubinsChain, 'The shortest way between each two of `stops`, each a place, the way it is going, and how tightly it can turn on the way to there, or else as tightly as `radius`.', 'Dubins Chain'),
	bounds: withDoc(makeBounds, 'The area that `path` just fits in.', 'Bounds'),
	offset: withDoc(makeOffset, 'The outline of `path`, this `distance` out from it, or in, if that is below 0, going around corners by `join`.', 'Offset'),
	offsetStroke: withDoc(makeOffsetStroke, 'The outline of a line along `path`, this `width`, ending by `cap` and going around corners by `join`.', 'Offset Stroke'),
	roundCorners: withDoc(makeRoundCorners, 'The same `path`, with its corners rounded by `radius`.', 'Round Corners'),
	chamfer: withDoc(makeChamfer, 'The same `path`, with its corners cut off `distance` back along each side.', 'Chamfer'),
	mirror: withDoc(makeMirror, 'The `path`, and what it is across `line`, as one.', 'Mirror'),
	reflect: withDoc(makeReflect, 'What `path` is across `line`.', 'Reflect'),
	kaleidoscope: withDoc(makeKaleidoscope, 'What of `path` is in the wedge from `angle` in degrees around `center`, reflected back and forth around it between as many mirrors as `count`.', 'Kaleidoscope'),
	kaleidoscopeTile: withDoc(makeKaleidoscopeTile, 'What of `path` is in `cell`, reflected back and forth across its sides, as far as it takes to cover `area`. A `cell` is a rectangle, or a triangle of 60-60-60, 45-45-90 or 30-60-90 degrees, the only shapes whose reflections fit together.', 'Kaleidoscope Tile'),
	zigzag: withDoc(makeZigzag, 'The `path`, going from side to side by `amplitude`, once every `wavelength` along it.', 'Zigzag'),
	wave: withDoc(makeWave, 'The `path`, moved by a wave of this `amplitude` and `wavelength`.', 'Wave'),
	twirl: withDoc(makeTwirl, 'The `path`, turned around `center` by `angle` in degrees, less so out to `radius`.', 'Twirl'),
	bulge: withDoc(makeBulge, 'The `path`, pushed out from `center` by `strength`, less so out to `radius`.', 'Bulge'),
	pixelate: withDoc(makePixelate, 'The `path` as cells of a grid, which is `cell` repeated on all sides. Each `mode` fills different ones: those with their center inside (`center`), those it gets into at all (`overlap`), or those wholly inside (`full`). The outline has `anchors` only where it turns (`corners`), or at every cell along it (`cells`).', 'Pixelate'),
	dash: withDoc(makeDash, 'The parts of `path` that a line with this `pattern` of dashes and gaps would draw.', 'Dash'),
	subdivide: withDoc(makeSubdivide, 'The same `path`, with each segment made into `division` of them.', 'Subdivide'),
	flatten: withDoc(makeFlatten, 'The `path` in straight lines, as close to it as `tolerance`.', 'Flatten'),
	reverse: withDoc(makeReverse, 'The same `path`, going the other way.', 'Reverse'),
	convexHull: withDoc(makeConvexHull, 'The least convex shape that all of them fit in, as a band around them would be.', 'Convex Hull'),
	shadow: withDoc(makeShadow, 'What `path` passes over, going as far as `by`, as a shadow from a far off light.', 'Shadow'),
	shadowFrom: withDoc(makeShadowFrom, 'The shadow of `path` from a `light` at a place, reaching `scale` times as far from it.', 'Shadow from a Light'),
	ray: withDoc(makeRay, 'A line `from` a place `through` another, as far as where it first hits `path`.', 'Ray'),
	unite: withDoc(makeUnite, 'What is inside of any of them.', 'Unite'),
	subtract: withDoc(makeSubtract, 'What is inside of `subject`, and not inside of `tool` or any of `tools`.', 'Subtract'),
	intersect: withDoc(makeIntersect, 'What is inside of all of them.', 'Intersect'),
	exclude: withDoc(makeExclude, 'What is inside of one of them, and not where an even number overlap.', 'Exclude'),
	blend: withDoc(makeBlend, 'What is between `a` and `b`, as far from `a` as `ratio` says.', 'Blend'),
	blendSteps: withDoc(makeBlendSteps, 'The shapes from `a` to `b`, with as many `steps` evenly between them.', 'Blend Steps'),
	repeatAlong: withDoc(makeRepeatAlong, 'As many copies of `stamp` as `count` says, each with its middle on `path`, starting `offset` along it, turned the way it goes if `rotate` says.', 'Repeat Along'),
	d: withDoc(makeD, 'A path from its data, as an SVG path has it.', 'Path Data'),
	anchors: withDoc(makeAnchors, 'A path through `anchors` in turn, and back to the first if `closed`. Each is a place, or a place with handles, `in` and `out`, that the path curves toward on either side of it.', 'Path by Anchors'),
	circle: withDoc(makeCircle, 'A circle around `center`, as far out as `radius`.', 'Circle'),
	circleFromDiameter: withDoc(makeCircleFromDiameter, 'The circle with `a` and `b` at either end of a line through its center.', 'Circle from Diameter'),
	circleThrough: withDoc(makeCircleThrough, 'The circle through `a`, `b` and `c`.', 'Circle through Points'),
	ellipseFromFoci: withDoc(makeEllipseFromFoci, 'An ellipse around `focus1` and `focus2`, going `through` a point, which says how large it is, as an ellipse is where the distances to its foci come to the same.', 'Ellipse from Foci'),
	ellipse: withDoc(makeEllipse, 'An ellipse around `center`, with a `radius` along each of its axes, turned by `angle`, in degrees.', 'Ellipse'),
	rect: withDoc(makeRect, 'A rectangle from its `origin`, of this `size`.', 'Rectangle'),
	square: withDoc(makeSquare, 'A square from its `origin`, with sides of this `size`.', 'Square'),
	qr: withDoc(makeQr, 'The QR code of `text`, from its `origin`, with sides of this `size` and no margin around it. `level` says how much of it can be lost and still read: L, M, Q or H. `anchors` puts them where it turns, at every module along it too, or at every one but in the three squares in its corners, which stay as squares.', 'QR Code'),
	line: withDoc(makeLine, 'A straight line from `start` to `end`.', 'Line'),
	polyline: withDoc(makePolyline, 'Straight lines through each of the points, in turn.', 'Polyline'),
	polygon: withDoc(makePolygon, 'Straight lines through each of the points, and back.', 'Polygon'),
	ngon: withDoc(makeNgon, 'A regular polygon around `center`, with as many sides as `sides`, and its first vertex toward `angle`, in degrees.', 'Regular Polygon'),
	star: withDoc(makeStar, 'A star around `center`, of as many `points`, going between `outerRadius` and `innerRadius`, with its first point toward `angle`, in degrees.', 'Star'),
	roundRect: withDoc(makeRoundRect, 'A rectangle from its `origin`, of this `size`, with corners rounded by `radius`.', 'Rounded Rectangle'),
	capsule: withDoc(makeCapsule, 'What is within `radius` of the line from `start` to `end`: a line with round ends.', 'Capsule'),
	superellipse: withDoc(makeSuperellipse, 'Between shapes around `center`, by `shape`: 0 is a diamond, 1 an ellipse, 2 a squircle, and more comes toward a rectangle. Less than 0 has its sides drawn in.', 'Superellipse'),
	arc: withDoc(makeArc, 'Part of a circle around `center`, from the angle `start` to `end`, in degrees.', 'Arc'),
	arcThrough: withDoc(makeArcThrough, 'The arc from `start` to `end` that goes through `through`, or a line, for the three in a line.', 'Arc through Points'),
	fan: withDoc(makeFan, 'What is between `innerRadius` and `outerRadius` around `center`, from the angle `start` to `end`, in degrees.', 'Fan'),
	spiral: withDoc(makeSpiral, 'A line going around `center` as many `turns`, from `startRadius` out to `endRadius`.', 'Spiral'),
	clothoid: withDoc(makeClothoid, 'A line from `start`, going at `angle` in degrees, that bends steadily more along its `length`, from `startCurvature` to `endCurvature`. One over a curvature is the radius of the bend.', 'Clothoid'),
	cubic: withDoc(makeCubic, 'A curve from `start` to `end`, drawn toward `control1` and `control2`.', 'Cubic Curve'),
	transform: withDoc(makeTransformed, 'The same `path`, moved, turned and scaled `by` a matrix.', 'Transform'),
	replicate: withDoc(makeReplicate, 'Copies of `path`, with the matrix `by` applied each number of times `from` this `to` this. 0 is the `path` itself, and below 0 goes the other way.', 'Replicate'),
})

/** What an argument would have to be, `route` going down through calls to it. */
export interface Change {
	readonly route: readonly number[]
	readonly value: unknown
	/** The row it is of, if that is not the one it is applied to, for what goes across several. */
	readonly row?: string
}

const change = (arg: number, value: unknown): Change => ({ route: [arg], value })

/** How nearly in line two directions have to be, for a curve to be going straight through. */
const IN_LINE = 0.01

/**
 * Where the control across `at` from one that has gone from `was` to `moved` goes. With
 * Option it stays, which is the way to break a curve. With Command it stays in line, as long
 * as it was. Otherwise it is only if it was in line that it is kept so, the same length if
 * it was, for a corner to go on being one.
 */
export function otherControl(
	at: Vec,
	moved: Vec,
	other: Vec,
	was: Vec,
	how?: HandleDrag
): Vec {
	const [mx, my] = sub(moved, at)
	const [ox, oy] = sub(other, at)
	const [wx, wy] = sub(was, at)
	const [movedBy, otherBy, wasBy] = [Math.hypot(mx, my), Math.hypot(ox, oy), Math.hypot(wx, wy)]
	if (how?.symmetric || movedBy === 0) return other
	const inLine = (ox * wx + oy * wy < 0 && Math.abs(ox * wy - oy * wx) <= IN_LINE * otherBy * wasBy) || otherBy === 0
	if (!how?.smooth && !inLine) return other
	const by = !how?.smooth && Math.abs(otherBy - wasBy) <= IN_LINE * wasBy ? 1 : otherBy / movedBy
	return [at[0] - mx * by, at[1] - my * by]
}

/** How a handle is being dragged, by what is held down. */
export interface HandleDrag {
	/** The opposite side goes the other way, so that the center stays where it is. */
	readonly symmetric?: boolean
	/** An angle goes by steps, rather than wherever it is pulled. */
	readonly even?: boolean
	/** A control's other side stays in line with it, however long it was. */
	readonly smooth?: boolean
	/** It is not moved: these of the vertices of what it is of go, as `Handle.vertex` calls them. */
	readonly removing?: readonly string[]
	/** All of these of the parts of what it is of go along with it, however far it has been taken. */
	readonly moving?: readonly string[]
	/** It is not moved: these of the parts of what it is of go to where `map` says of each place. */
	readonly mapping?: { readonly parts: readonly string[]; readonly map: (at: Vec) => Vec }
}

/** A place on a canvas to take hold of a call by. */
export interface Handle {
	/**
	 * What it looks like, which tells what it does: `point` is a place, `translate`
	 * takes the whole, `arrow` pulls a length, `offset` moves an outline out along its normal,
	 * `direction` turns toward where it is,
	 * `dia` a count, and `path` is its own line, such as an edge.
	 */
	/** A `button` does what it does when pressed, with nowhere to be pulled. */
	readonly kind: 'point' | 'translate' | 'arrow' | 'offset' | 'direction' | 'dia' | 'path' | 'button'
	/** Where it is, but for a `path`, which is everywhere along `path`. */
	readonly at?: Vec
	readonly path?: Path
	/** Which way it pulls, in degrees. */
	readonly angle?: number
	/** What this place on it is called, to say what something has snapped to. */
	readonly name?: string
	/**
	 * What it is the place of, for something else to refer to: the argument at this
	 * index, or the whole of what is taken hold of. Otherwise it is only a place.
	 */
	readonly place?: number | 'self'
	/** How it is worked out, if it is not the place of anything. */
	readonly code?: PlaceCode
	/** What it changes is much smaller than where it is on a canvas, as a scale is. */
	readonly fine?: boolean
	/** A place it snaps to being straight across or down from, as one end of a line does with the other. */
	readonly linesUpWith?: Vec
	/**
	 * It goes along a line, as an `offset` does when reached for, and has nothing it is an
	 * outline of to lie along until then, so it always points the two ways it can go.
	 */
	readonly along?: boolean
	/** It is drawn with a broken line, being there only to take hold of. */
	readonly dashed?: boolean
	/** It pulls in toward what it is measured from, with outside being the other way. */
	readonly inward?: boolean
	/** What it turns around, when it goes by even angles, for the line that it is then on. */
	readonly pivot?: Vec
	/** A `direction` that turns something around, rather than saying which way something goes. */
	readonly rotates?: boolean
	/**
	 * A `direction` that `rotates` and is drawn as the arc it swings along, around its `pivot`, with
	 * a head each way: on a line, where a diamond would look like a place on the line rather than
	 * something taken across it.
	 */
	readonly swings?: boolean
	/** An `arrow` that pulls one side of a box, and so looks like what lies along that side. */
	readonly grip?: boolean
	/** It turns something by a corner of the box around it, from outside of that corner, and `at` is the corner. */
	readonly outsideCorner?: boolean
	/** It goes across several rows, each change saying of which, with no numbers of any one of them. */
	readonly across?: boolean
	/** The line it is held out on, which goes when it does. */
	readonly heldOn?: Path
	/**
	 * How far it turns what is selected, in degrees, if nothing written says how far round that is,
	 * so that the box around it can go round with it for as long as it stays selected.
	 */
	turnOf?(to: Vec, how?: HandleDrag): number
	/** What it turns around instead, when the other side goes the other way. */
	readonly middle?: Vec
	/** It stays where it is, when the rest of a grip is shown somewhere else. */
	readonly stays?: boolean
	/** It is about a corner, and is drawn square to say so. */
	readonly corner?: boolean
	/** What it is exactly, more than one thing, as a vertex is how far out and which way. */
	readonly parts?: readonly (readonly number[])[]
	/** It pulls what goes through somewhere else, and is not on it, as a curve's controls are. */
	readonly control?: boolean
	/** It is one of the points of a path's data, for the tool that goes by those, and what it is called there. */
	readonly vertex?: string
	/** It is a line or a curve between two points of a path, and what that is called there. */
	readonly segment?: string
	/** The two points it is between, if it is that. */
	readonly ends?: readonly [Vec, Vec]
	/** It is for the tool that goes by a path's points, and is in the way of all else. */
	readonly ofPoints?: boolean
	/** It does not end up where it is taken to, so it is not to refer to what it snapped to. */
	readonly constrained?: boolean
	/** What has to change, for it to be at `to`, having been taken at `from`. */
	to(to: Vec, from: Vec, how?: HandleDrag): readonly Change[]
	/**
	 * What taking hold of it is about, to someone doing that, whatever else has to change
	 * to bring it about: the top of a rect is its height, though its Y changes as well.
	 */
	readonly means?: readonly HandleMeaning[]
}

/** A number that a handle is about, and what it takes for that to be something else. */
export interface HandleMeaning {
	readonly route: readonly number[]
	readonly index?: number
	/** What has to change for it to be `value`, having been let go of at `to`. */
	set(value: number, to: Vec, how?: HandleDrag): readonly Change[]
}

/** All that can be done to a call on a canvas. */
export interface Grip {
	readonly handles: readonly Handle[]
	/** What is only there to look at. */
	readonly guides: readonly Path[]
	/** What it is made from, which it no longer shows, being what comes of it. */
	readonly sources?: readonly Path[]
	/** What has to change, for the whole of it to be moved by `delta`. */
	move?(delta: Vec): readonly Change[]
	/** Where in the row it is, if it is in something the row says more about. */
	readonly within?: string
	/** Where else on it matters, to line something else up with, besides its handles. */
	readonly snaps?: Snaps
	/** Where on it each number it is made of belongs, to be shown and typed there. */
	readonly marks?: readonly DimensionMark[]
	/** What it says to the box that goes around whatever is selected. Nothing if it cannot. */
	readonly box?: BoxAnswer
}

/**
 * A box goes around everything, and what is in it has to say what can be done to it by that box.
 * What the box cannot do for it, it has handles of its own for.
 */
export interface BoxAnswer {
	/** It can only be scaled by as much each way, for it to go on being what it is. */
	readonly even: boolean
	/** How far round it is, in degrees, which the box goes with, for its axes to be the box's. */
	readonly angle?: number
	/** What has to change, for it to be `x` and `y` times as large along the box, from `about`. */
	scaled(x: number, y: number, about: Vec): readonly Change[]
	/** What has to change, for it to be turned by `degrees` around `about`, if that can be said. */
	turned?(degrees: number, about: Vec): readonly Change[]
	/** Turning it around its own middle would come to the same, as with a circle. */
	readonly round?: boolean
	/** It speaks for several rows, as what is selected or what is in a group, each change saying of which. */
	readonly across?: boolean
}

/**
 * Which way from a place on a shape a number goes, so as to be clear of the shape.
 * `above-start` is above and along from there, as over the top of a corner.
 */
export type DimensionSide = 'above' | 'above-start' | 'below' | 'left' | 'right'

/** Where on a shape a number belongs: an edge for how long it is, a corner for where. */
export interface DimensionMark {
	readonly route: readonly number[]
	readonly index?: number
	readonly at: Vec
	readonly side: DimensionSide
}

/** The numbers of a place, together, at `at`, which is clear of the shape they are of. */
const pointMarks = (
	route: readonly number[],
	at: Vec,
	side: DimensionSide = 'above'
): DimensionMark[] => [
	{ route, index: 0, at, side },
	{ route, index: 1, at, side },
]

/**
 * How a place that no argument says is worked out from them, as code, for something to
 * refer to it. `part` gives a reference to something in the call, such as `arg0/1`.
 */
export type PlaceCode = (part: (path: string) => string) => string

/** Places, and straight lines, that something can snap to. */
export interface Snaps {
	readonly points?: readonly { readonly at: Vec; readonly name: string; readonly code?: PlaceCode }[]
	readonly lines?: readonly {
		readonly from: Vec
		readonly to: Vec
		readonly name: string
	}[]
}

/** The lines through `points`, in turn, and back to the first if it is closed. */
const linesThrough = (points: readonly Vec[], closed: boolean): NonNullable<Snaps['lines']>[number][] =>
	points.flatMap((from, i) => {
		const to = points[i + 1] ?? (closed ? points[0] : undefined)
		return to === undefined || points.length < 2 ? [] : [{ from, to, name: 'edge' }]
	})

export const NO_GRIP: Grip = { handles: [], guides: [] }

/**
 * Whether all there is to a handle is what it changes, with nothing there to begin something
 * else from: which is what it is still taken for, with a tool in hand.
 */
export const onlyShapes = ({ kind, control, place, code, name }: Handle): boolean =>
	kind !== 'path' &&
	(control === true ||
		kind === 'dia' ||
		(place === undefined && code === undefined && name === undefined))

/** A grip the same, for the call that is the argument at `arg`. */
export const under = (arg: number, grip: Grip): Grip => {
	const lower = (changes: readonly Change[]): Change[] =>
		changes.map(({ route, value }) => ({ route: [arg, ...route], value }))
	const { move } = grip
	return {
		guides: grip.guides,
		...(grip.sources === undefined ? {} : { sources: grip.sources }),
		within: grip.within === undefined ? `arg${arg}` : `arg${arg}/${grip.within}`,
		...(grip.snaps === undefined ? {} : { snaps: grip.snaps }),
		...(grip.marks === undefined
			? {}
			: { marks: grip.marks.map(mark => ({ ...mark, route: [arg, ...mark.route] })) }),
		...(grip.box === undefined
			? {}
			: {
					box: {
						...grip.box,
						scaled: (x: number, y: number, about: Vec) => lower(grip.box!.scaled(x, y, about)),
						...(grip.box.turned === undefined
							? {}
							: { turned: (by: number, about: Vec) => lower(grip.box!.turned!(by, about)) }),
					},
				}),
		handles: grip.handles.map(handle => ({
			...handle,
			to: (to, from, how) => lower(handle.to(to, from, how)),
			...(handle.parts === undefined ? {} : { parts: handle.parts.map(route => [arg, ...route]) }),
			...(handle.means === undefined
				? {}
				: {
						means: handle.means.map(meaning => ({
							...meaning,
							route: [arg, ...meaning.route],
							set: (value: number, to: Vec, how?: HandleDrag) => lower(meaning.set(value, to, how)),
						})),
					}),
		})),
		...(move === undefined ? {} : { move: (delta: Vec) => lower(move(delta)) }),
	}
}

/** A place that is all there is to something: the point itself. */
export const gripOfPoint = (at: Vec): Grip => ({
	marks: pointMarks([], at),
	handles: [{ kind: 'translate', place: 'self', at, to: to => [{ route: [], value: to }] }],
	guides: [],
	move: delta => [{ route: [], value: add(at, delta) }],
	// All there is to it is where it is, wherever that goes.
	box: {
		even: false,
		scaled: (x, y, [ax, ay]) => [{ route: [], value: [ax + (at[0] - ax) * x, ay + (at[1] - ay) * y] }],
		turned: (by, [ax, ay]) => {
			const [cos, sin] = [Math.cos((by * Math.PI) / 180), Math.sin((by * Math.PI) / 180)]
			const [x, y] = [at[0] - ax, at[1] - ay]
			return [{ route: [], value: [ax + x * cos - y * sin, ay + x * sin + y * cos] }]
		},
	},
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

/** The lines out to a curve's controls, which go with its points. */
const GUIDES_OF_POINTS = new WeakSet<Path>()
export const isGuideOfPoints = (guide: Path): boolean => GUIDES_OF_POINTS.has(guide)

/** What is called a line or a curve between two points of a path, which is the one going into `curve:vertex`. */
const segmentCalled = (c: number, v: number): string => `segment ${c}:${v}`

/** A curve cut at each of its segments that are gone, into what is left between them. */
function curvesLeftOf(vertices: readonly Vertex[], closed: boolean, c: number, gone: readonly string[]): { readonly at: readonly number[]; readonly closed: boolean }[] {
	const count = vertices.length
	const cuts = vertices.flatMap((_, v) => (gone.includes(segmentCalled(c, v)) ? [v] : []))
	const all = vertices.map((_, v) => v)
	if (cuts.length === 0) return [{ at: all, closed }]
	// What goes round begins again at the first of them, and the rest of it is as what does not.
	const start = closed ? cuts[0]! : 0
	const order = all.map(i => (i + start) % count)
	const pieces: number[][] = [[]]
	for (const v of order) {
		// What is open has nothing going into its first, however that is said.
		if (cuts.includes(v) && pieces.at(-1)!.length > 0) pieces.push([])
		pieces.at(-1)!.push(v)
	}
	return pieces.map(at => ({ at, closed: false }))
}

/**
 * `path` without what is called in `gone`: vertices as `curve:vertex`, their neighbors joined as near
 * to how they went as they can be, as a curve goes on out of the one before and into the one after,
 * and segments, which leave what they were between apart. Null if that would leave nothing of it.
 */
export function withoutVertices(path: Path, gone: readonly string[]): Path | null {
	const curves = (path as unknown as { curves: readonly Curve[] }).curves
	const next = curves.flatMap((curve, c) =>
		curvesLeftOf(curve.vertices, curve.closed, c, gone).flatMap(({ at, closed }) => {
			const vertices = at.map(v => curve.vertices[v]!)
			const isGone = (i: number): boolean => gone.includes(`${c}:${at[i]}`)
			const kept = vertices.flatMap((vertex, v) => {
				if (isGone(v)) return []
				// What it now comes from, and how the first of what is gone left that.
				let first = v
				for (let i = v - 1; i >= 0 && isGone(i); i--) first = i
				if (closed && first === 0) for (let i = vertices.length - 1; i > v && isGone(i); i--) first = i
				if (first === v || (!closed && first === 0)) return [vertex]
				const before = vertices[(first - 1 + vertices.length) % vertices.length]!
				const left = vertices[first]!
				if (vertex.command !== 'C' && left.command !== 'C') return [vertex]
				if (vertex.command !== 'C' && vertex.command !== 'L') return [vertex]
				return [
					{
						...vertex,
						command: 'C',
						args: [
							left.command === 'C' && left.args ? left.args[0]! : before.point,
							vertex.command === 'C' && vertex.args ? vertex.args[1]! : vertex.point,
						],
					},
				]
			})
			// A point is not anything drawn, and it takes three to go round.
			if (kept.length < 2) return []
			return [{ vertices: kept, closed: closed && kept.length > 2 }]
		})
	)
	return next.length === 0 ? null : ({ curves: next } as unknown as Path)
}

/** `path`, with what is called in `moving` going where `map` says: a segment is the two points it is between, and a point takes what controls it along. */
function withPartsMapped(path: Path, moving: readonly string[], map: (at: Vec) => Vec): Path {
	const curves = (path as unknown as { curves: readonly Curve[] }).curves
	return {
		curves: curves.map(({ vertices, closed }, c) => {
			const count = vertices.length
			const before = (v: number): number => (v > 0 ? v - 1 : closed ? count - 1 : -1)
			const going = new Set(
				vertices.flatMap((_, v) => [
					...(moving.includes(`${c}:${v}`) || moving.includes(segmentCalled(c, v)) ? [v] : []),
					...(moving.includes(segmentCalled(c, v)) ? [before(v)] : []),
				])
			)
			return {
				vertices: vertices.map((vertex, v) => {
					const own = going.has(v)
					const { args } = vertex
					return {
						...vertex,
						point: own ? map(vertex.point) : vertex.point,
						...(vertex.command === 'C' && args
							? { args: [going.has(before(v)) ? map(args[0]!) : args[0]!, own ? map(args[1]!) : args[1]!] }
							: {}),
					}
				}),
				closed,
			}
		}),
	} as unknown as Path
}

const STEPS_ALONG_A_CURVE = 48

/** How far along a curve its nearest to `to` is, kept from its ends, which are not for it to move. */
function alongCurve(from: Vec, control1: Vec, control2: Vec, end: Vec, to: Vec): number {
	let best = 0.5
	let away = Infinity
	for (let i = 1; i < STEPS_ALONG_A_CURVE; i++) {
		const t = i / STEPS_ALONG_A_CURVE
		const [a, b, c, d] = [(1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t ** 2, t ** 3]
		const x = a * from[0] + b * control1[0] + c * control2[0] + d * end[0]
		const y = a * from[1] + b * control1[1] + c * control2[1] + d * end[1]
		const distance = Math.hypot(x - to[0], y - to[1])
		if (distance < away) [best, away] = [t, distance]
	}
	return best
}

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
				const lines = [line(previous.point, control1), line(at, control2)]
				for (const guide of lines) GUIDES_OF_POINTS.add(guide)
				guides.push(...lines)
				args.forEach((control, a) => {
					// What it comes out of, and the control on the other side of that, if any.
					const anchor = a === 0 ? previous.point : at
					const across = a === 0 ? (v === 0 ? vertices.length - 1 : v - 1) : (v + 1) % vertices.length
					const reaches = a === 0 ? v > 0 || closed : v + 1 < vertices.length || closed
					handles.push({
						kind: 'point',
						name: 'control',
						control: true,
						ofPoints: true,
						at: control,
						pivot: anchor,
						to: (to, _, how) => {
							const moved = how?.even ? evenFrom(anchor, to) : to
							return whole(
								withVertices(path, c, all =>
									all.map((vertex, i) => {
										const args = vertex.args
										if (args === undefined || vertex.command !== 'C') return vertex
										const own = i === v ? args.map((arg, j) => (j === a ? moved : arg)) : args
										return {
											...vertex,
											args:
												reaches && i === across
													? own.map((arg, j) =>
															j === 1 - a ? otherControl(anchor, moved, arg, control, how) : arg
														)
													: own,
										}
									})
								)
							)
						},
					})
				})
			}
			handles.push({
				kind: 'point',
				name: 'anchor',
				ofPoints: true,
				vertex: `${c}:${v}`,
				at,
				to: (to, _, how) => {
					if (how?.removing) {
						const left = withoutVertices(path, how.removing)
						return left === null ? [] : whole(left)
					}
					if (how?.mapping) return whole(withPartsMapped(path, how.mapping.parts, how.mapping.map))
					if (how?.moving) return whole(withPartsMapped(path, how.moving, place => add(place, sub(to, at))))
					return whole(
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
					)
				},
			})
		})
	})
	curves.forEach(({ vertices, closed }, c) => {
		vertices.forEach((vertex, v) => {
			const previous = vertices[v - 1] ?? (closed ? vertices.at(-1) : undefined)
			if (previous === undefined) return
			const called = segmentCalled(c, v)
			const { args } = vertex
			const isCurve = vertex.command === 'C' && args?.length === 2
			handles.push({
				kind: 'offset',
				name: 'segment',
				ofPoints: true,
				segment: called,
				ends: [previous.point, vertex.point],
				path: {
					curves: [{ vertices: [{ point: previous.point, command: 'L' }, vertex], closed: false }],
				} as unknown as Path,
				to: (to, from, how) => {
					if (how?.removing) {
						const left = withoutVertices(path, how.removing)
						return left === null ? [] : whole(left)
					}
					if (how?.mapping) return whole(withPartsMapped(path, how.mapping.parts, how.mapping.map))
					const delta = sub(to, from)
					if (how?.moving || !isCurve) return whole(withPartsMapped(path, how?.moving ?? [called], at => add(at, delta)))
					// So that where it was taken goes where it is pulled, by as little as each control can.
					const [control1, control2] = args as readonly [Vec, Vec]
					const t = alongCurve(previous.point, control1, control2, vertex.point, from)
					const [b1, b2] = [3 * (1 - t) ** 2 * t, 3 * (1 - t) * t ** 2]
					const by = b1 * b1 + b2 * b2
					return whole(
						withVertices(path, c, all =>
							all.map((other, i) =>
								i === v
									? {
											...other,
											args: [
												add(control1, [(delta[0] * b1) / by, (delta[1] * b1) / by]),
												add(control2, [(delta[0] * b2) / by, (delta[1] * b2) / by]),
											],
										}
									: other
							)
						)
					)
				},
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

/** Where the sides of a circle are, from its center and how far out each way. */
const sidesOf = (rx: string, ry: string): Readonly<Record<string, PlaceCode>> => ({
	right: p => `[(+ ${p('arg0/0')} ${p(rx)}) ${p('arg0/1')}]`,
	bottom: p => `[${p('arg0/0')} (+ ${p('arg0/1')} ${p(ry)})]`,
	left: p => `[(- ${p('arg0/0')} ${p(rx)}) ${p('arg0/1')}]`,
	top: p => `[${p('arg0/0')} (- ${p('arg0/1')} ${p(ry)})]`,
})
const CIRCLE_SIDES = sidesOf('arg1', 'arg1')
const ELLIPSE_SIDES = sidesOf('arg1/0', 'arg1/1')

const QUADRANTS = [
	['right', 0],
	['bottom', 90],
	['left', 180],
	['top', 270],
] as const

/** Where the parts of a rect are, from its top left and size. */
const across = (p: (path: string) => string, start: string, size: string, along: number): string =>
	along === 0
		? p(start)
		: along === 1
			? `(+ ${p(start)} ${p(size)})`
			: `(+ ${p(start)} (/ ${p(size)} 2))`
/** At `x` and `y` of the way across, 2 being the middle, by what is its width and height. */
const placeIn =
	(width: string, height: string) =>
	(x: number, y: number): PlaceCode =>
	p =>
		`[${across(p, 'arg0/0', width, x)} ${across(p, 'arg0/1', height, y)}]`
const rectPlace = placeIn('arg1/0', 'arg1/1')
const squarePlace = placeIn('arg1', 'arg1')

/** A place as far out as `radius` around the center, toward `angle` in degrees, as code. */
const polarCode =
	(
		radius: (p: (path: string) => string) => string,
		angle: (p: (path: string) => string) => string
	): PlaceCode =>
	p =>
		`[(+ ${p('arg0/0')} (* ${radius(p)} (cos (to-rad ${angle(p)})))) (+ ${p('arg0/1')} (* ${radius(p)} (sin (to-rad ${angle(p)}))))]`

const GIZMO_SIZE = 80
const NGON_RING = 20
/** How far past an ellipse its axis goes, to what turns it. */
const ELLIPSE_FACING = 40
/** How far out a handle stays from what it is measured from, so as to be taken apart from it. */
const HANDLE_CLEAR = 12

/** How far in along each side the middle of a round corner is, for each of its radius. */
const ARC_IN = 1 - Math.SQRT1_2

/** How near to its corner what rounds it comes, for each to be taken hold of on its own side. */
const ROUND_CLEAR = 6

/** How far out from `c` something is, by an arrow that way, which stays clear of `c`. */
const radiusHandle = (arg: number, c: Vec, angle: number, radius: number): Handle => {
	const at = add(c, toward(angle, Math.max(radius, HANDLE_CLEAR)))
	return {
		kind: 'arrow',
		at,
		angle,
		to: to => [change(arg, Math.max(0, radius + dist(c, to) - dist(c, at)))],
	}
}

/** The same, of an outline around `c` that it moves in and out. */
const offsetHandle = (arg: number, c: Vec, angle: number, radius: number): Handle => ({
	...radiusHandle(arg, c, angle, radius),
	kind: 'offset',
})

/** How many of something go around `c`, by a dial on a ring out from it, from `first`. */
const countDial = (arg: number, c: Vec, ring: number, count: number, first = 0): Handle => ({
	kind: 'dia',
	at: add(c, toward(first + 360 / count, ring)),
	to: to => {
		const angle = Math.min(120, Math.max(3.6, shortest(degrees(sub(to, c)) - first)))
		return [change(arg, Math.round(360 / angle))]
	},
})

/** The angle around `c` that `to` is at, by the short way from `angle`. */
const angleNear = (c: Vec, angle: number, to: Vec): number =>
	angle + shortest(degrees(sub(to, c)) - angle)

/** How far apart the angles are that something goes by, if it is to go evenly. */
const ANGLE_STEP = 45

/** The angle to go to, for how it is being dragged. */
const angleHeld = (c: Vec, angle: number, to: Vec, how?: HandleDrag): number => {
	const near = angleNear(c, angle, to)
	return how?.even ? Math.round(near / ANGLE_STEP) * ANGLE_STEP : near
}

/** What turns something around `c`, held out past `from` for it to be clear of it, and the line it is held on. */
function turnedBy(arg: number, c: Vec, angle: number, from: number): { handle: Handle; guide: Path } {
	const at = add(c, toward(angle, from + ELLIPSE_FACING))
	const guide = line(add(c, toward(angle, from)), at)
	return {
		handle: {
			kind: 'direction',
			rotates: true,
			heldOn: guide,
			at,
			pivot: c,
			angle,
			to: (to, _, how) => [change(arg, angleHeld(c, angle, to, how))],
		},
		guide,
	}
}

/** As far from `c` as `to` is, at the nearest of the angles that go evenly. */
export const evenFrom = (c: Vec, to: Vec): Vec =>
	add(c, toward(Math.round(degrees(sub(to, c)) / ANGLE_STEP) * ANGLE_STEP, dist(c, to)))

/** The two ends of something, each going by even angles around the other. */
const evenEnds = (handles: readonly Handle[], a: Vec, b: Vec): Handle[] =>
	handles.map((handle, i) => {
		const other = i === 0 ? b : a
		const middle: Vec = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
		return {
			...handle,
			pivot: other,
			middle,
			to: (to: Vec, _: Vec, how?: HandleDrag) => {
				const around = how?.symmetric ? middle : other
				const at = how?.even ? evenFrom(around, to) : to
				return how?.symmetric
					? [change(i, at), change(1 - i, [middle[0] * 2 - at[0], middle[1] * 2 - at[1]])]
					: [change(i, at)]
			},
		}
	})

/**
 * What a place around `c` comes to, being how far out and which way, of which only one can
 * change: what cannot turn goes straight out along the way it faces, and what cannot go
 * out goes around. If neither can, it is left to say so.
 */
const polarTo = (
	radiusArg: number,
	angleArg: number,
	free: (arg: number) => boolean,
	c: Vec,
	at: Vec,
	angle: number,
	radius: number,
	to: Vec
): readonly Change[] | null => {
	const [out, turns] = [free(radiusArg), free(angleArg)]
	if (out === turns) return null
	if (turns) return [change(angleArg, angleNear(c, angle, to))]
	const [x, y] = toward(angle, 1)
	const moved = sub(to, at)
	return [change(radiusArg, Math.max(0, radius + moved[0] * x + moved[1] * y))]
}

/** The first vertex of what goes around `c`, pulled out as far, and turned as far, as it is. */
const vertexHandle = (
	radiusArg: number,
	angleArg: number,
	free: (arg: number) => boolean,
	c: Vec,
	angle: number,
	radius: number,
	code?: PlaceCode
): Handle => {
	const at = add(c, toward(angle, Math.max(radius, HANDLE_CLEAR)))
	return {
		kind: 'point',
		name: 'vertex',
		parts: [[radiusArg], [angleArg]],
		// Held clear of what it is measured from, it is not then quite at the vertex.
		...(code === undefined || radius < HANDLE_CLEAR ? {} : { code }),
		at,
		pivot: c,
		to: (to, _, how) => {
			const only = polarTo(radiusArg, angleArg, free, c, at, angle, radius, to)
			if (only !== null) return only
			const out = change(radiusArg, Math.max(0, radius + dist(c, to) - dist(c, at)))
			const turned = angleHeld(c, angle, to, how)
			// What is pulled straight out need not come to say which way it faces.
			return turned === angle ? [out] : [out, change(angleArg, turned)]
		},
	}
}

/** A row of points, each of its own argument, that move together. */
const pointsGrip = (
	points: readonly Vec[],
	guides: readonly Path[] = [],
	snaps?: Snaps,
	/** What comes first is taken last, where they are in the same place. */
	order: readonly number[] = points.map((_, i) => i)
): Grip => ({
	...(snaps === undefined ? {} : { snaps }),
	marks: points.flatMap((at, i) => pointMarks([i], at)),
	handles: order.map(i => ({
		kind: 'point',
		place: i,
		at: points[i]!,
		to: (to: Vec) => [change(i, to)],
	})),
	guides,
	move: delta => points.map((at, i) => change(i, add(at, delta))),
})

/**
 * Take hold of a path by its anchors. Each moves with its handles, and a handle that goes the
 * other way from the one across from it goes on doing so, as long as it stays, when that is moved.
 * Each change is of that anchor only, so that anything else written in the vector stays.
 */
function anchorsGrip(anchors: readonly unknown[], closed: boolean): Grip {
	const all = anchors.map(partsOfAnchor)
	const written = (i: number, next: AnchorParts): unknown => {
		const anchor = anchors[i]
		if (Array.isArray(anchor)) return next.at
		const keys = Object.keys(anchor as object) as (keyof AnchorParts)[]
		return Object.fromEntries(keys.map(key => [key, next[key] ?? UNSET]))
	}
	const only = (i: number, next: AnchorParts): Change[] => [
		change(0, anchors.map((_, j) => (j === i ? written(i, next) : UNSET))),
	]
	const movedBy = (anchor: AnchorParts, delta: Vec): AnchorParts => ({
		at: add(anchor.at, delta),
		...(anchor.in === undefined ? {} : { in: add(anchor.in, delta) }),
		...(anchor.out === undefined ? {} : { out: add(anchor.out, delta) }),
	})
	/** `other`, turned to go on going the other way from `moved`, if it went that way from where it was. */
	const across = (at: Vec, was: Vec, moved: Vec, other: Vec | undefined): Vec | undefined => {
		if (other === undefined) return undefined
		const a = sub(was, at)
		const b = sub(other, at)
		const cross = a[0] * b[1] - a[1] * b[0]
		const dot = a[0] * b[0] + a[1] * b[1]
		if (dot >= 0 || Math.abs(cross) > IN_LINE * Math.hypot(...a) * Math.hypot(...b)) return other
		const toward = sub(moved, at)
		const reach = Math.hypot(...toward)
		if (reach === 0) return other
		const length = Math.hypot(...b)
		return [at[0] - (toward[0] / reach) * length, at[1] - (toward[1] / reach) * length]
	}
	const handles = all.flatMap((anchor, i): Handle[] => {
		const pulled = (side: 'in' | 'out'): Handle[] => {
			const at = anchor[side]
			if (at === undefined) return []
			const other = side === 'in' ? 'out' : 'in'
			return [
				{
					kind: 'point',
					at,
					control: true,
					to: to => only(i, { ...anchor, [side]: to, [other]: across(anchor.at, at, to, anchor[other]) }),
				},
			]
		}
		return [
			...pulled('in'),
			...pulled('out'),
			{ kind: 'point', at: anchor.at, to: to => only(i, movedBy(anchor, sub(to, anchor.at))) },
		]
	})
	const ats = all.map(anchor => anchor.at)
	return {
		handles,
		guides: all.flatMap(anchor =>
			[anchor.in, anchor.out].flatMap(handle => (handle === undefined ? [] : [line(anchor.at, handle)]))
		),
		snaps: { lines: linesThrough(ats, closed) },
		move: delta => [change(0, all.map((anchor, i) => written(i, movedBy(anchor, delta))))],
	}
}

/** Take hold of what has all of its places in one vector, as its first argument. */
const placesGrip = (places: readonly Vec[]): Grip => ({
	handles: places.map((at, i) => ({
		kind: 'point',
		at,
		to: (to: Vec) => [change(0, places.map((other, j) => (j === i ? to : other)))],
	})),
	guides: [],
	move: delta => [change(0, places.map(at => add(at, delta)))],
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

type Maker = (
	args: readonly unknown[],
	inner: (arg: number) => Grip | null,
	proportional: (arg: number) => boolean,
	/** Whether the argument at `arg` can come to be something else, not being pinned, for one. */
	free: (arg: number) => boolean
) => Grip

const makers: Map<unknown, Maker> = new Map<unknown, Maker>([
	[
		makeD,
		([d]) => {
			// Data being written need not be a path yet, and then there is nothing to hold.
			try {
				return gripOfD(fromD(d as string))
			} catch {
				return NO_GRIP
			}
		},
	],
	// All there is to take hold of is what it is the style of.
	[makeStyled, (_, inner) => inner(0) ?? NO_GRIP],
	[
		makeCircle,
		([center, radius]) => {
			const c = center as Vec
			const r = radius as number
			return {
				marks: [...pointMarks([0], [c[0], c[1] - r]), { route: [1], at: [c[0] + r, c[1]], side: 'right' }],
				handles: [
					{
						kind: 'offset',
						name: 'right',
						at: [c[0] + r, c[1]],
						angle: 0,
						to: to => [change(1, dist(c, to))],
					},
					{ kind: 'translate', name: 'center', place: 0, at: c, to: to => [change(0, to)] },
				],
				guides: [],
				snaps: {
					points: QUADRANTS.map(([name, angle]) => ({
						at: add(c, toward(angle, r)),
						name,
						code: CIRCLE_SIDES[name]!,
					})),
				},
				move: delta => [change(0, add(c, delta))],
			}
		},
	],
	[
		makeEllipse,
		([center, radius, turned]) => {
			const c = center as Vec
			const [rx, ry] = radius as Vec
			const first = finiteAngle(turned)
			// Exactly where it is, unturned, as most are.
			const on = (x: number, y: number): Vec => {
				if (first === 0) return [c[0] + x, c[1] + y]
				const [cos, sin] = toward(first, 1)
				return [c[0] + x * cos - y * sin, c[1] + x * sin + y * cos]
			}
			const across = (to: Vec, axis: number): number => {
				const [x, y] = toward(first + axis, 1)
				return Math.abs((to[0] - c[0]) * x + (to[1] - c[1]) * y)
			}
			const facing = on(rx + ELLIPSE_FACING, 0)
			const faced = line(on(rx, 0), facing)
			// Saying where a side is by its numbers goes only for one that is not turned.
			// Out along its own axes, which are then not along those of the canvas.
			const turnedSides: Readonly<Record<string, PlaceCode>> = (() => {
				const cos = (p: (path: string) => string) => `(cos (to-rad ${p('arg2')}))`
				const sin = (p: (path: string) => string) => `(sin (to-rad ${p('arg2')}))`
				const at =
					(
						by: string,
						x: readonly [string, typeof cos],
						y: readonly [string, typeof cos]
					): PlaceCode =>
					p =>
						`[(${x[0]} ${p('arg0/0')} (* ${p(by)} ${x[1](p)})) (${y[0]} ${p('arg0/1')} (* ${p(by)} ${y[1](p)}))]`
				return {
					right: at('arg1/0', ['+', cos], ['+', sin]),
					left: at('arg1/0', ['-', cos], ['-', sin]),
					bottom: at('arg1/1', ['-', sin], ['+', cos]),
					top: at('arg1/1', ['+', sin], ['-', cos]),
				}
			})()
			const side = (name: string): { code: PlaceCode } => ({
				code: first === 0 ? ELLIPSE_SIDES[name]! : turnedSides[name]!,
			})
			return {
				marks: [
					...pointMarks([0], on(0, -ry)),
					{ route: [1], index: 0, at: on(rx, 0), side: 'right' },
					{ route: [1], index: 1, at: on(0, ry), side: 'below' },
					{ route: [2], at: facing, side: 'right' },
				],
				handles: [
					{
						kind: 'arrow',
						grip: true,
						name: 'right',
						at: on(rx, 0),
						angle: first,
						to: to => [change(1, [across(to, 0), UNSET])],
					},
					{
						kind: 'arrow',
						grip: true,
						name: 'bottom',
						at: on(0, ry),
						angle: first + 90,
						to: to => [change(1, [UNSET, across(to, 90)])],
					},
					{
						kind: 'direction',
						rotates: true,
						heldOn: faced,
						at: facing,
						pivot: c,
						angle: first,
						to: (to, _, how) => [change(2, angleHeld(c, first, to, how))],
					},
					{ kind: 'translate', name: 'center', place: 0, at: c, to: to => [change(0, to)] },
				],
				guides: [faced],
				snaps: {
					points: [
						{ at: on(rx, 0), name: 'right', ...side('right') },
						{ at: on(0, ry), name: 'bottom', ...side('bottom') },
						{ at: on(-rx, 0), name: 'left', ...side('left') },
						{ at: on(0, -ry), name: 'top', ...side('top') },
					],
				},
				move: delta => [change(0, add(c, delta))],
			}
		},
	],
	[
		makeEllipseFromFoci,
		args => {
			const [focus1, focus2, through] = args as [Vec, Vec, Vec]
			const grip = pointsGrip(args as Vec[], [line(focus1, through), line(focus2, through)])
			const [first, second, last] = grip.handles
			return { ...grip, handles: [...evenEnds([first!, second!], focus1, focus2), last!] }
		},
	],
	[
		makeCircleFromDiameter,
		args => {
			const [a, b] = args as [Vec, Vec]
			return pointsGrip(args as Vec[], [line(a, b)], { points: roundPlaces(circleOfDiameter(a, b), diameterCode) })
		},
	],
	[
		makeArcThrough,
		args => {
			const [start, through, end] = args as [Vec, Vec, Vec]
			const arc = arcOfThree(start, through, end)
			// Where it goes round is a place, as long as it goes round anything.
			const center = (p: (path: string) => string) => {
				const { x, y } = throughCode(p)
				return `[${x} ${y}]`
			}
			return pointsGrip(args as Vec[], [], { points: arc === null ? [] : [{ at: arc.center, name: 'center', code: center }] })
		},
	],
	[
		makeCircleThrough,
		args => {
			const [a, b, c] = args as [Vec, Vec, Vec]
			return pointsGrip(args as Vec[], [], { points: roundPlaces(circleThrough(a, b, c), throughCode) })
		},
	],
	[
		makeRect,
		([origin, size], _inner, proportional) => {
			const s = origin as Vec
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
			// A length, from the side that stays, out the way it was let go of: or either way
			// from the middle, if that is what stayed.
			const length = (
				axis: 0 | 1,
				far: number,
				side: (at: number, how?: HandleDrag) => Change[]
			): HandleMeaning => ({
				route: [1],
				index: axis,
				set(value, to, how) {
					const way = Math.sign(to[axis] - far) || 1
					return side(how?.symmetric ? middle[axis] + (way * value) / 2 : far + way * value, how)
				},
			})
			const widthBy = { left: length(0, e[0], left), right: length(0, s[0], right) }
			const heightBy = { top: length(1, e[1], top), bottom: length(1, s[1], bottom) }

			// With its width and height going together, a side takes the other axis along:
			// about the middle of it, for a side, and away from the corner across, for a corner.
			// What is 0 says nothing of a ratio, so that goes as if they did not.
			const extent: Vec = [Math.abs(e[0] - s[0]), Math.abs(e[1] - s[1])]
			const keeps = proportional(1) && extent[0] > 0 && extent[1] > 0
			interface Side {
				readonly axis: 0 | 1
				readonly far: number
				readonly at: number
				readonly go: (at: number, how?: HandleDrag) => Change[]
			}
			const sides = {
				left: { axis: 0, far: e[0], at: s[0], go: left },
				right: { axis: 0, far: s[0], at: e[0], go: right },
				top: { axis: 1, far: e[1], at: s[1], go: top },
				bottom: { axis: 1, far: s[1], at: e[1], go: bottom },
			} as const satisfies Record<string, Side>
			const stays = (side: Side, how?: HandleDrag): number =>
				how?.symmetric ? middle[side.axis] : side.far
			const reach = (side: Side, how?: HandleDrag): number => Math.abs(side.at - stays(side, how))
			const wayTo = (side: Side, at: number, how?: HandleDrag): number =>
				Math.sign(at - stays(side, how)) || 1
			const factor = (side: Side, at: number, how?: HandleDrag): number =>
				Math.abs(at - stays(side, how)) / reach(side, how)
			const scaled = (side: Side, by: number, way: number, how?: HandleDrag): Change[] =>
				side.go(stays(side, how) + way * by * reach(side, how), how)
			const sideTo = (side: Side, at: number, how?: HandleDrag): Change[] => {
				if (!keeps) return side.go(at, how)
				const other = side.axis === 0 ? 1 : 0
				const half = (extent[other] * factor(side, at, how)) / 2
				return [...side.go(at, how), ...across(other, middle[other] - half, middle[other] + half)]
			}
			const cornerBy = (a: Side, b: Side, by: number, to: Vec, how?: HandleDrag): Change[] => [
				...scaled(a, by, wayTo(a, to[a.axis], how), how),
				...scaled(b, by, wayTo(b, to[b.axis], how), how),
			]
			const cornerTo = (a: Side, b: Side, to: Vec, how?: HandleDrag): Change[] =>
				keeps
					? cornerBy(a, b, Math.max(factor(a, to[a.axis], how), factor(b, to[b.axis], how)), to, how)
					: [...a.go(to[a.axis], how), ...b.go(to[b.axis], how)]
			const scaledSideBy = (side: Side, by: number, to: Vec, how?: HandleDrag): Change[] =>
				sideTo(side, stays(side, how) + wayTo(side, to[side.axis], how) * by * reach(side, how), how)
			const sideMeans = (side: Side, plain: HandleMeaning): readonly HandleMeaning[] =>
				keeps
					? [
							{
								route: [1],
								index: side.axis,
								set: (value, to, how) => scaledSideBy(side, value / extent[side.axis], to, how),
							},
						]
					: [plain]
			const cornerMeans = (
				a: Side,
				b: Side,
				plainA: HandleMeaning,
				plainB: HandleMeaning
			): readonly HandleMeaning[] =>
				keeps
					? [a, b].map(side => ({
							route: [1],
							index: side.axis,
							set: (value: number, to: Vec, how?: HandleDrag) =>
								cornerBy(a, b, value / extent[side.axis], to, how),
						}))
					: [plainA, plainB]
			return {
				// Whichever way it was drawn, a length goes by the edge that is clear of the rest.
				marks: [
					...pointMarks([0], s, 'above-start'),
					{ route: [1], index: 0, at: [middle[0], Math.max(s[1], e[1])], side: 'below' },
					{ route: [1], index: 1, at: [Math.max(s[0], e[0]), middle[1]], side: 'right' },
				],
				handles: [
					{ kind: 'offset', name: 'left', code: rectPlace(0, 2), angle: 0, at: [s[0], middle[1]], means: sideMeans(sides.left, widthBy.left), to: (to, _, how) => sideTo(sides.left, to[0], how) },
					{ kind: 'offset', name: 'top', code: rectPlace(2, 0), angle: 90, at: [middle[0], s[1]], means: sideMeans(sides.top, heightBy.top), to: (to, _, how) => sideTo(sides.top, to[1], how) },
					{ kind: 'offset', name: 'right', code: rectPlace(1, 2), angle: 0, at: [e[0], middle[1]], means: sideMeans(sides.right, widthBy.right), to: (to, _, how) => sideTo(sides.right, to[0], how) },
					{ kind: 'offset', name: 'bottom', code: rectPlace(2, 1), angle: 90, at: [middle[0], e[1]], means: sideMeans(sides.bottom, heightBy.bottom), to: (to, _, how) => sideTo(sides.bottom, to[1], how) },
					{ kind: 'point', corner: true, name: 'top left', place: 0, angle: 45, at: s, constrained: keeps, means: cornerMeans(sides.left, sides.top, widthBy.left, heightBy.top), to: (to, _, how) => cornerTo(sides.left, sides.top, to, how) },
					{ kind: 'point', corner: true, name: 'top right', code: rectPlace(1, 0), angle: -45, at: [e[0], s[1]], means: cornerMeans(sides.right, sides.top, widthBy.right, heightBy.top), to: (to, _, how) => cornerTo(sides.right, sides.top, to, how) },
					{ kind: 'point', corner: true, name: 'bottom left', code: rectPlace(0, 1), angle: -45, at: [s[0], e[1]], means: cornerMeans(sides.left, sides.bottom, widthBy.left, heightBy.bottom), to: (to, _, how) => cornerTo(sides.left, sides.bottom, to, how) },
					{ kind: 'point', corner: true, name: 'bottom right', code: rectPlace(1, 1), angle: 45, at: e, means: cornerMeans(sides.right, sides.bottom, widthBy.right, heightBy.bottom), to: (to, _, how) => cornerTo(sides.right, sides.bottom, to, how) },
				],
				guides: [],
				snaps: {
					points: [{ at: middle, name: 'center', code: rectPlace(2, 2) }],
					lines: [
						{ from: s, to: [e[0], s[1]], name: 'top' },
						{ from: [e[0], s[1]], to: e, name: 'right' },
						{ from: e, to: [s[0], e[1]], name: 'bottom' },
						{ from: [s[0], e[1]], to: s, name: 'left' },
					],
				},
				move: moved,
			}
		},
	],
	[
		makeSquare,
		([origin, side]) => {
			const s = origin as Vec
			const size = side as number
			const e = add(s, [size, size])
			const middle: Vec = [s[0] + size / 2, s[1] + size / 2]
			const moved = (delta: Vec): Change[] => [change(0, add(s, delta))]
			// A side stays where it is across from what is being taken, and the rest follows.
			const sized = (next: number): Change => change(1, next)
			const fromFar = (x: number, y: number): Change[] => {
				const next = Math.max(e[0] - x, e[1] - y)
				return [change(0, [e[0] - next, e[1] - next]), sized(next)]
			}
			// Or the other side goes the other way, for the center to stay where it is.
			const around = (half: number): Change[] => [
				change(0, [middle[0] - half, middle[1] - half]),
				sized(half * 2),
			]
			return {
				marks: [
					...pointMarks([0], s, 'above-start'),
					{ route: [1], at: [middle[0], Math.max(s[1], e[1])], side: 'below' },
				],
				handles: [
					{ kind: 'offset', name: 'right', code: squarePlace(1, 2), angle: 0, at: [e[0], middle[1]], to: (to, _, how) => (how?.symmetric ? around(to[0] - middle[0]) : [sized(to[0] - s[0])]) },
					{ kind: 'offset', name: 'bottom', code: squarePlace(2, 1), angle: 90, at: [middle[0], e[1]], to: (to, _, how) => (how?.symmetric ? around(to[1] - middle[1]) : [sized(to[1] - s[1])]) },
					{
						kind: 'point',
						corner: true,
						name: 'top left',
						place: 0,
						angle: 45,
						at: s,
						means: [{ route: [1], set: value => [change(0, [e[0] - value, e[1] - value]), sized(value)] }],
						to: (to, _, how) =>
							how?.symmetric
								? around(Math.max(middle[0] - to[0], middle[1] - to[1]))
								: fromFar(to[0], to[1]),
					},
					{ kind: 'point', corner: true, name: 'bottom right', code: squarePlace(1, 1), angle: 45, at: e, to: (to, _, how) => (how?.symmetric ? around(Math.max(to[0] - middle[0], to[1] - middle[1])) : [sized(Math.max(to[0] - s[0], to[1] - s[1]))]) },
				],
				guides: [],
				snaps: {
					points: [
						{ at: middle, name: 'center', code: squarePlace(2, 2) },
						{ at: [e[0], s[1]], name: 'top right', code: squarePlace(1, 0) },
						{ at: [s[0], e[1]], name: 'bottom left', code: squarePlace(0, 1) },
					],
					lines: [
						{ from: s, to: [e[0], s[1]], name: 'top' },
						{ from: [e[0], s[1]], to: e, name: 'right' },
						{ from: e, to: [s[0], e[1]], name: 'bottom' },
						{ from: [s[0], e[1]], to: s, name: 'left' },
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
			const grip = pointsGrip(args as Vec[], [], {
				points: [
					{
						at: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2],
						name: 'middle',
						// Half is what the middle is, and not what moving it would change.
						code: p => `[(/ (+ ${p('arg0/0')} ${p('arg1/0')}) @2) (/ (+ ${p('arg0/1')} ${p('arg1/1')}) @2)]`,
					},
				],
				lines: [{ from: start, to: end, name: 'line' }],
			})
			return { ...grip, handles: evenEnds(grip.handles, start, end) }
		},
	],
	[makeTriangleStrip, args => placesGrip(args[0] as Vec[])],
	// As many places as a pointer went through, which is not something to take hold of one by one.
	[makeSpray, args => ({ ...placesGrip(args[0] as Vec[]), handles: [] })],
	[
		makeDubinsChain,
		args => {
			const stops = (args[0] as DubinsStop[]).map(flatStop)
			const usual = args[1] as number
			const atOf = ([x = 0, y = 0]: number[]): Vec => [x, y]
			const movedTo = ([, , angle = 0, ...rest]: number[], [x, y]: Vec): number[] => [x, y, angle, ...rest]
			const tipOf = (stop: number[]): Vec => {
				const radians = ((stop[2] ?? 0) * Math.PI) / 180
				const reach = stop[3] ?? usual
				const [x, y] = atOf(stop)
				return [x + Math.cos(radians) * reach, y + Math.sin(radians) * reach]
			}
			const withStop = (i: number, next: number[]): Change[] => [
				change(0, stops.map((other, j) => nestedStop(j === i ? next : other))),
			]
			return {
				handles: stops.flatMap((stop, i): Handle[] => {
					const at = atOf(stop)
					const angle = stop[2] ?? 0
					return [
						// It turns toward where it is taken, and how far that is is how tightly it comes to there.
						{
							kind: 'direction',
							at: tipOf(stop),
							pivot: at,
							angle,
							to: (to, _, how) => withStop(i, [at[0], at[1], angleHeld(at, angle, to, how), Math.max(dist(at, to), 1e-3)]),
						},
						{ kind: 'point', at, to: to => withStop(i, movedTo(stop, to)) },
					]
				}),
				guides: stops.map(stop => line(atOf(stop), tipOf(stop))),
				move: delta => [change(0, stops.map(stop => nestedStop(movedTo(stop, add(atOf(stop), delta)))))],
			}
		},
	],
	[makePolyline, args => pointsGrip(args as Vec[], [], { lines: linesThrough(args as Vec[], false) })],
	[makeAnchors, args => anchorsGrip(args[0] as unknown[], args[1] === true)],
	[makePolygon, args => pointsGrip(args as Vec[], [], { lines: linesThrough(args as Vec[], true) })],
	[
		makeCubic,
		args => {
			const [start, control1, control2, end] = args as Vec[]
			// A place where it goes through, before what only pulls it, wherever they coincide.
			const grip = pointsGrip(
				args as Vec[],
				[line(start!, control1!), line(end!, control2!)],
				undefined,
				[1, 2, 0, 3]
			)
			return {
				...grip,
				handles: grip.handles.map(handle =>
					handle.place === 1 || handle.place === 2 ? { ...handle, control: true } : handle
				),
			}
		},
	],
	[
		makeNgon,
		([center, radius, sides, turned], _inner, _proportional, free) => {
			const c = center as Vec
			const r = radius as number
			const first = finiteAngle(turned)
			const ring = r + NGON_RING
			const count = Math.max(3, Math.round(sides as number))
			const turning = turnedBy(3, c, first, r)
			// Its angle can be left unsaid, and then there is nothing to refer to.
			const vertexCode = (i: number): PlaceCode =>
				polarCode(
					p => p('arg1'),
					p => {
						const first = turned === undefined ? '0' : p('arg3')
						return i === 0 ? first : turned === undefined ? `(* (/ 360 ${p('arg2')}) ${i})` : `(+ ${first} (* (/ 360 ${p('arg2')}) ${i}))`
					}
				)
			return {
				marks: [
					...pointMarks([0], [c[0], c[1] - r]),
					{ route: [1], at: add(c, toward(first, r)), side: 'right' },
					{ route: [2], at: add(c, toward(first + 360 / count, ring)), side: 'right' },
					{ route: [3], at: add(c, toward(first, r)), side: 'below' },
				],
				handles: [
					vertexHandle(1, 3, free, c, first, r, vertexCode(0)),
					countDial(2, c, ring, count, first),
					turning.handle,
					{ kind: 'translate', name: 'center', place: 0, at: c, to: to => [change(0, to)] },
				],
				guides: [arc(c, ring, first + 3.6, first + 120), turning.guide],
				snaps: (() => {
					const vertices = Array.from({ length: count }, (_, i) =>
						add(c, toward(first + (360 / count) * i, r))
					)
					return {
						points: vertices.map((at, i) => ({ at, name: 'vertex', code: vertexCode(i) })),
						lines: linesThrough(vertices, true),
					}
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
			return {
				marks: [
					...pointMarks([0], c),
					{ route: [1], at: add(c, toward(middle, r)), side: 'right' },
					{ route: [2], at: add(c, toward(from, r)), side: 'right' },
					{ route: [3], at: add(c, toward(until, r)), side: 'right' },
				],
				handles: [
					{
						kind: 'offset',
						at: add(c, toward(middle, r)),
						angle: middle,
						to: to => [change(1, dist(c, to))],
					},
					{
						kind: 'point',
						name: 'start',
						code: polarCode(p => p('arg1'), p => p('arg2')),
						at: add(c, toward(from, r)),
						to: to => [change(2, angleNear(c, from, to))],
					},
					{
						kind: 'point',
						name: 'end',
						code: polarCode(p => p('arg1'), p => p('arg3')),
						at: add(c, toward(until, r)),
						to: to => [change(3, angleNear(c, until, to))],
					},
					{ kind: 'translate', name: 'center', place: 0, at: c, to: to => [change(0, to)] },
				],
				guides: [],
				move: delta => [change(0, add(c, delta))],
			}
		},
	],
	[
		makeStar,
		([center, outer, inner, tips, turned], _inner, _proportional, free) => {
			const c = center as Vec
			const out = outward(outer)
			const within = outward(inner)
			const count = tipCount(tips)
			const first = finite(turned)
			const ring = Math.max(out, within) + NGON_RING
			const turning = turnedBy(4, c, first, Math.max(out, within))
			const vertices = Array.from({ length: count * 2 }, (_, i) =>
				add(c, toward(first + (180 / count) * i, i % 2 === 0 ? out : within))
			)
			const vertexCode = (i: number): PlaceCode =>
				polarCode(
					p => p(i % 2 === 0 ? 'arg1' : 'arg2'),
					p => {
						const first = turned === undefined ? '0' : p('arg4')
						return i === 0 ? first : turned === undefined ? `(* (/ 180 ${p('arg3')}) ${i})` : `(+ ${first} (* (/ 180 ${p('arg3')}) ${i}))`
					}
				)
			return {
				marks: [
					...pointMarks([0], [c[0], c[1] - out]),
					{ route: [1], at: add(c, toward(first, out)), side: 'right' },
					{ route: [2], at: add(c, toward(first + 180 / count, within)), side: 'right' },
					{ route: [3], at: add(c, toward(first + 360 / count, ring)), side: 'right' },
					{ route: [4], at: add(c, toward(first, out)), side: 'below' },
				],
				handles: [
					vertexHandle(1, 4, free, c, first, out, vertexCode(0)),
					{
						...radiusHandle(2, c, first + 180 / count, within),
						name: 'vertex',
						...(within < HANDLE_CLEAR ? {} : { code: vertexCode(1) }),
					},
					countDial(3, c, ring, count, first),
					turning.handle,
					{ kind: 'translate', name: 'center', place: 0, at: c, to: to => [change(0, to)] },
				],
				guides: [arc(c, ring, first + 3.6, first + 120), turning.guide],
				snaps: {
					points: vertices.map((at, i) => ({ at, name: 'vertex', code: vertexCode(i) })),
					lines: linesThrough(vertices, true),
				},
				move: delta => [change(0, add(c, delta))],
			}
		},
	],
	[
		makeCapsule,
		([start, end, radius]) => {
			const [a, b] = [start as Vec, end as Vec]
			const r = outward(radius)
			const length = dist(a, b)
			// A capsule with no length has no side, and goes the same way around.
			const side: Vec =
				length === 0 ? [0, -1] : [(b[1] - a[1]) / length, (a[0] - b[0]) / length]
			const away = (at: Vec, by: number): Vec => [at[0] + side[0] * by, at[1] + side[1] * by]
			const middle: Vec = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
			const ends = pointsGrip([a, b], [], {
				lines: [
					{ from: away(a, r), to: away(b, r), name: 'edge' },
					{ from: away(a, -r), to: away(b, -r), name: 'edge' },
				],
			})
			const at = away(middle, r)
			return {
				...ends,
				marks: [...ends.marks!, { route: [2], at, side: 'right' }],
				handles: [
					...evenEnds(ends.handles, a, b),
					{
						kind: 'offset',
						at,
						angle: degrees(side),
						to: to =>
							[change(2, Math.abs((to[0] - a[0]) * side[0] + (to[1] - a[1]) * side[1]))],
					},
				],
			}
		},
	],
	[
		makeRoundRect,
		([origin, extent, radius], inner, proportional, free) => {
			const s = origin as Vec
			const [width, height] = extent as Vec
			const box = makers.get(makeRect)!([s, extent], inner, proportional, free)
			const most = Math.min(Math.abs(width), Math.abs(height)) / 2
			const r = Math.min(outward(radius), most)
			const x = Math.sign(width) || 1
			const y = Math.sign(height) || 1
			// On the curve of the first corner, unless that would be on the corner itself.
			const held = Math.min(Math.max(r * ARC_IN, ROUND_CLEAR * Math.SQRT1_2), most)
			const at: Vec = [s[0] + x * held, s[1] + y * held]
			return {
				...box,
				marks: [...box.marks!, { route: [2], at, side: 'below' }],
				// Last, to be what is taken where it comes to a corner.
				handles: [
					...box.handles,
					{
						kind: 'arrow',
						corner: true,
						at,
						angle: degrees([x, y]),
						inward: true,
						to: to => {
							const by = ((to[0] - at[0]) * x + (to[1] - at[1]) * y) / 2
							return [change(2, Math.min(most, Math.max(0, r + by / ARC_IN)))]
						},
					},
				],
			}
		},
	],
	[
		makeSuperellipse,
		([center, radius, shape], inner, proportional, free) => {
			const c = center as Vec
			const [rx, ry] = radius as Vec
			const { handles: all, marks: said, guides: _turning, ...box } = makers.get(makeEllipse)!(
				[c, radius],
				inner,
				proportional,
				free
			)
			// It does not turn, and what would be its angle is its shape.
			const handles = all.filter(({ kind }) => kind !== 'direction')
			const marks = said!.filter(({ route }) => route[0] !== 2)
			const held = Number.isNaN(shape) ? 2 : (shape as number)
			// How far out it is on the way to a corner, which is all that a shape says.
			const out = 2 ** (-1 / 2 ** held)
			const at: Vec = [c[0] + rx * out, c[1] + ry * out]
			return {
				...box,
				guides: [],
				marks: [...marks, { route: [2], at, side: 'right' }],
				handles: [
					{
						kind: 'arrow',
						corner: true,
						fine: true,
						at,
						angle: degrees([rx, ry]),
						to: to => {
							const x = rx === 0 ? 0 : (to[0] - c[0]) / rx
							const y = ry === 0 ? 0 : (to[1] - c[1]) / ry
							const along = Math.min(0.99, Math.max(0.01, (x + y) / 2))
							return [change(2, Math.log2(-Math.LN2 / Math.log(along)))]
						},
					},
					...handles,
				],
			}
		},
	],
	[
		makeFan,
		([center, inner, outer, start, end]) => {
			const c = center as Vec
			const within = outward(inner)
			const out = outward(outer)
			const from = finite(start)
			const until = finite(end)
			const middle = (from + until) / 2
			const fromAt = add(c, toward(from, out))
			const untilAt = add(c, toward(until, out))
			return {
				marks: [
					...pointMarks([0], c),
					{ route: [1], at: add(c, toward(middle, within)), side: 'right' },
					{ route: [2], at: add(c, toward(middle, out)), side: 'right' },
					{ route: [3], at: fromAt, side: 'right' },
					{ route: [4], at: untilAt, side: 'right' },
				],
				handles: [
					offsetHandle(1, c, middle, within),
					offsetHandle(2, c, middle, out),
					{ kind: 'point', name: 'start', code: polarCode(p => p('arg2'), p => p('arg3')), at: fromAt, to: to => [change(3, angleNear(c, from, to))] },
					{ kind: 'point', name: 'end', code: polarCode(p => p('arg2'), p => p('arg4')), at: untilAt, to: to => [change(4, angleNear(c, until, to))] },
					{ kind: 'translate', name: 'center', place: 0, at: c, to: to => [change(0, to)] },
				],
				guides: [],
				snaps: {
					points: [
						{ at: fromAt, name: 'start', code: polarCode(p => p('arg2'), p => p('arg3')) },
						{ at: untilAt, name: 'end', code: polarCode(p => p('arg2'), p => p('arg4')) },
					],
				},
				move: delta => [change(0, add(c, delta))],
			}
		},
	],
	[
		makeSpiral,
		([center, start, end, turns], _inner, _proportional, free) => {
			const c = center as Vec
			const startRadius = outward(start)
			const endRadius = outward(end)
			const angle = finite(turns) * 360
			const endAt = add(c, toward(angle, endRadius))
			return {
				marks: [
					...pointMarks([0], c),
					{ route: [1], at: add(c, [startRadius, 0]), side: 'right' },
					{ route: [2], at: endAt, side: 'right' },
					{ route: [3], at: endAt, side: 'below' },
				],
				handles: [
					radiusHandle(1, c, 0, startRadius),
					{
						kind: 'point',
						fine: true,
						name: 'end',
						parts: [[2], [3]],
						code: polarCode(p => p('arg2'), p => `(* ${p('arg3')} 360)`),
						at: endAt,
						to: to => {
							const only = polarTo(2, 3, free, c, endAt, angle, endRadius, to)
							return (
								only?.map(({ route, value }) =>
									route[0] === 3 ? { route, value: (value as number) / 360 } : { route, value }
								) ?? [change(2, dist(c, to)), change(3, angleNear(c, angle, to) / 360)]
							)
						},
					},
					{ kind: 'translate', name: 'center', place: 0, at: c, to: to => [change(0, to)] },
				],
				guides: [],
				move: delta => [change(0, add(c, delta))],
			}
		},
	],
	[
		makeClothoid,
		args => {
			const s = args[0] as Vec
			const angle = finite(args[1])
			const length = outward(args[2])
			const startCurvature = finite(args[3])
			const endCurvature = finite(args[4])
			const { curves } = clothoidOf(args) as unknown as { curves: readonly Curve[] }
			const end = curves[0]!.vertices.at(-1)!.point
			const facing = add(s, toward(angle, GIZMO_SIZE))
			// The curvature changes evenly, so it turns by what the middle of it does, all along.
			const endAngle = angle + (((startCurvature + endCurvature) / 2) * length * 180) / Math.PI
			const ahead = toward(endAngle, 1)
			return {
				marks: [
					...pointMarks([0], s),
					{ route: [1], at: facing, side: 'right' },
					{ route: [2], at: end, side: 'right' },
				],
				handles: [
					{
						kind: 'arrow',
						name: 'end',
						at: end,
						angle: endAngle,
						to: to => {
							const by = (to[0] - end[0]) * ahead[0] + (to[1] - end[1]) * ahead[1]
							return [change(2, Math.max(0, length + by))]
						},
					},
					{
						kind: 'direction',
						at: facing,
						pivot: s,
						angle,
						to: (to, _, how) => [change(1, angleHeld(s, angle, to, how))],
					},
					{ kind: 'translate', name: 'start', place: 0, at: s, to: to => [change(0, to)] },
				],
				guides: [line(s, facing)],
				snaps: { points: [{ at: end, name: 'end' }] },
				move: delta => [change(0, add(s, delta))],
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
		makeTRS,
		([translation, rotation, scale, pivot]) => {
			const moved = translation as Vec
			// What a call leaves unsaid is not among what it is given here.
			const r = (rotation ?? 0) as number
			const [sx, sy] = (scale ?? [1, 1]) as Vec
			const p = (pivot ?? [0, 0]) as Vec
			// Where the pivot goes, which is what all of the rest is around.
			const t = add(p, moved)
			const turned = toward(r, GIZMO_SIZE)
			const across = toward(r + 90, GIZMO_SIZE)
			const corner: Vec = [
				t[0] + turned[0] * sx + across[0] * sy,
				t[1] + turned[1] * sx + across[1] * sy,
			]
			return {
				handles: [
					{
						kind: 'direction',
						rotates: true,
						at: add(t, turned),
						pivot: t,
						angle: r,
						to: (to, _, how) => [change(1, angleHeld(t, r, to, how))],
					},
					{
						kind: 'point',
						fine: true,
						at: corner,
						// What is said of it goes in order, so a scale needs a rotation to come after.
						to: to => {
							const [x, y] = sub(to, t)
							return [
								change(1, r),
								change(2, [
									(x * turned[0] + y * turned[1]) / GIZMO_SIZE ** 2,
									(x * across[0] + y * across[1]) / GIZMO_SIZE ** 2,
								]),
							]
						},
					},
					{
						kind: 'translate',
						name: 'pivot',
						at: p,
						stays: true,
						// What is said of it goes in order, so a pivot needs all that comes before.
						to: to => [change(1, r), change(2, [sx, sy]), change(3, to)],
					},
					{ kind: 'translate', at: t, to: to => [change(0, sub(to, p))] },
				],
				guides: [line(p, t), line(t, add(t, turned)), line(t, corner)],
				move: delta => [change(0, add(moved, delta))],
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
						kind: 'direction',
						rotates: true,
						at,
						pivot: [0, 0],
						angle: turned,
						to: (to, _, how) => [change(0, angleHeld([0, 0], turned, to, how))],
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
const middleOf = (path: Path): Vec => {
	const [[left, top], [right, bottom]] = bounds(path)
	return [(left + right) / 2, (top + bottom) / 2]
}

/** What moves what a call is of, by moving each of them. They are in terms of the call already. */
const movingAll = (grips: readonly (Grip | null)[]) => (delta: Vec): readonly Change[] =>
	grips.flatMap(grip => grip?.move?.(delta) ?? [])

/**
 * A number that goes out from a path, `per` as far as it says, by a handle along the normal
 * at where the path is nearest to its right side. Which way that is, for a path that has a
 * way, is by where `moved` has it go.
 */
const outFromPath =
	(per: number, moved: (path: Path) => Path | null): Maker =>
	([path, distance], inner) => {
		const source = (path as PathValue).path
		const [[, top], [right, bottom]] = bounds(source)
		const shape = inner(0)
		const found = nearest(source, [right, (top + bottom) / 2])
		if (found === null) return { handles: [], guides: [], sources: [source] }
		const from = found.point as unknown as Vec
		const [nx, ny] = normal(source, found.location) as unknown as Vec
		// How near that way is to where it goes, or, if it goes both ways, how far to the right.
		const out1 = moved(source)
		const nearness = (way: number): number =>
			out1 === null
				? way * (nx || ny)
				: -(nearest(out1, [from[0] + nx * way, from[1] + ny * way])?.distance ?? 0)
		const way = nearness(1) >= nearness(-1) ? 1 : -1
		const along: Vec = [nx * way, ny * way]
		const out = (distance as number) * per
		const at: Vec = [from[0] + along[0] * out, from[1] + along[1] * out]
		return {
			guides: [line(from, at)],
			sources: [source],
			handles: [
				{
					kind: 'offset',
					name: 'distance',
					// It is pulled out from one place, and is no outline of what it is on.
					along: true,
					angle: degrees(along),
					at,
					to: to => [
						change(1, ((to[0] - from[0]) * along[0] + (to[1] - from[1]) * along[1]) / per),
					],
				},
			],
			...(shape?.move === undefined ? {} : { move: movingAll([shape]) }),
		}
	}

makers.set(makeOffset, outFromPath(1, path => offset(path, 1)))
// A stroke goes as far to each side, half of its width.
makers.set(makeOffsetStroke, outFromPath(1 / 2, () => null))

makers.set(makeBlend, ([a, b, ratio], inner) => {
	const from = middleOf((a as PathValue).path)
	const to = middleOf((b as PathValue).path)
	const t = ratio as number
	const along = sub(to, from)
	const length = along[0] * along[0] + along[1] * along[1]
	const shapes = [inner(0), inner(1)]
	return {
		guides: [line(from, to)],
		sources: [(a as PathValue).path, (b as PathValue).path],
		handles: [
			{
				kind: 'offset',
				name: 'ratio',
				angle: degrees(along),
				at: [from[0] + along[0] * t, from[1] + along[1] * t],
				// It goes from 0 to 1, which what is fine enough for a place is not fine enough for.
				fine: true,
				along: true,
				to: at => {
					if (length === 0) return []
					const [x, y] = sub(at, from)
					return [change(2, Math.max(0, Math.min(1, (x * along[0] + y * along[1]) / length)))]
				},
			},
		],
		...(shapes.some(shape => shape?.move !== undefined)
			? { move: movingAll(shapes) }
			: {}),
	}
})

// A QR code is taken hold of as the square it fills.
makers.set(makeQr, makers.get(makeSquare)!)

// What is around a path shows that path, however else it is taken hold of.
const transformed = makers.get(makeTransformed)!
makers.set(makeTransformed, (args, inner, proportional, free) => ({
	...transformed(args, inner, proportional, free),
	sources: [(args[0] as PathValue).path],
}))

makers.set(makeBounds, ([path], inner) => {
	const shape = inner(0)
	return {
		guides: [],
		handles: [],
		sources: [(path as PathValue).path],
		...(shape?.move === undefined ? {} : { move: movingAll([shape]) }),
	}
})

/** A number pulled from a corner of what a path is in, inward along its top. */
const fromCorner: Maker = ([path, amount], inner) => {
	const [[, top], [right]] = bounds(pathOf(path))
	const d = amount as number
	const shape = inner(0)
	return {
		guides: [line([right, top], [right - d, top])],
		sources: [pathOf(path)],
		handles: [
			{
				kind: 'offset',
				name: 'amount',
				angle: 0,
				along: true,
				at: [right - d, top],
				to: to => [change(1, Math.max(0, right - to[0]))],
			},
		],
		...(shape?.move === undefined ? {} : { move: movingAll([shape]) }),
	}
}
makers.set(makeRoundCorners, fromCorner)
makers.set(makeChamfer, fromCorner)

/** A path as it was, and where it is taken from: a line across it, or the center of a change. */
const showingPath =
	(
		handles: (args: readonly unknown[]) => Pick<Grip, 'handles' | 'guides'> = () => ({ handles: [], guides: [] }),
		/** The arguments that are places, which it would otherwise change by being moved from. */
		places: readonly number[] = []
	): Maker =>
	(args, inner) => {
		const shape = inner(0)
		return {
			...handles(args),
			sources: [pathOf(args[0])],
			...(shape?.move === undefined
				? {}
				: {
						move: (delta: Vec) => [
							...shape.move!(delta),
							...places.map(arg => change(arg, add((args[arg] ?? [0, 0]) as Vec, delta))),
						],
					}),
		}
	}

const pointHandle = (arg: number, at: Vec): Handle => ({
	kind: 'point',
	at,
	to: to => [change(arg, to)],
})

/** How far a line is drawn each way, as it goes on past anywhere to look. */
const LINE_REACH = 20000
/** A line, as far as it can be seen, and which side of it a mirror keeps. */
export const lineGuide = (through: Vec, direction: Vec): Path => {
	const [x, y] = direction
	const by = LINE_REACH / (Math.hypot(x, y) || 1)
	return line([through[0] - x * by, through[1] - y * by], [through[0] + x * by, through[1] + y * by])
}
const flipHandle = (at: Vec, direction: Vec, flipped: () => Change[]): Handle => ({
	kind: 'button',
	name: 'flip',
	at,
	// Pointing the way it is mirrored: from the side that is kept, to where its copy goes.
	angle: degrees([direction[1], 0 - direction[0]]),
	to: flipped,
})
// It stays between its two, and is taken along the way from one to the other.
makers.set(makeMidpoint, ([from, to]) => {
	const [a, b] = [from as Vec, to as Vec]
	return {
		guides: [line(a, b)],
		handles: [],
		move: delta => [change(0, add(a, delta)), change(1, add(b, delta))],
	}
})
makers.set(makeLerp, ([from, to, ratio]) => {
	const [a, b, t] = [from as Vec, to as Vec, ratio as number]
	const along = sub(b, a)
	const length = along[0] * along[0] + along[1] * along[1]
	return {
		guides: [line(a, b)],
		handles: [
			{
				// It comes to a point, and looks like one, whatever taking it does.
				kind: 'translate',
				name: 'ratio',
				at: [a[0] + along[0] * t, a[1] + along[1] * t],
				// It goes from 0 to 1, which what is fine enough for a place is not fine enough for.
				fine: true,
				to: at => {
					if (length === 0) return []
					const [x, y] = sub(at, a)
					return [change(2, Math.max(0, Math.min(1, (x * along[0] + y * along[1]) / length)))]
				},
			},
		],
		move: delta => [change(0, add(a, delta)), change(1, add(b, delta))],
	}
})
// Where it has got to is what says how far, and it goes along with where it is from.
makers.set(makeNudge, ([from, by]) => {
	const [at, moved] = [from as Vec, by as Vec]
	const tip = add(at, moved)
	return {
		guides: [line(at, tip)],
		handles: [{ kind: 'translate', name: 'by', at: tip, linesUpWith: at, to: to => [change(1, sub(to, at))] }],
		move: delta => [change(0, add(at, delta))],
	}
})
makers.set(makeLineFromPoints, ([from, to]) => {
	const [start, end] = [from as Vec, to as Vec]
	return {
		guides: [lineGuide(start, sub(end, start))],
		handles: [
			{ ...pointHandle(0, start), linesUpWith: end },
			{ ...pointHandle(1, end), linesUpWith: start },
			flipHandle([(start[0] + end[0]) / 2, (start[1] + end[1]) / 2], sub(end, start), () => [
				change(0, end),
				change(1, start),
			]),
		],
		move: delta => [change(0, add(start, delta)), change(1, add(end, delta))],
	}
})
makers.set(makeLineAt, ([through, angle]) => {
	const p = through as Vec
	const turned = (angle ?? 0) as number
	const direction = toward(turned, GIZMO_SIZE)
	return {
		guides: [lineGuide(p, direction)],
		handles: [
			pointHandle(0, p),
			{
				// It turns the line, as anything else that turns does, and does not pull along it.
				kind: 'direction',
				rotates: true,
				at: add(p, direction),
				pivot: p,
				angle: turned,
				to: (to, _, how) => [change(1, angleHeld(p, turned, to, how))],
			},
			flipHandle(sub(p, direction), direction, () => [change(1, turned + 180)]),
		],
		move: delta => [change(0, add(p, delta))],
	}
})
/** A ray, from where it starts to as far as it can be seen. */
export const rayGuide = (ray: Ray): Path => line(ray.origin as Vec, Ray.at(ray, LINE_REACH) as Vec)
makers.set(makeRayFromPoints, ([from, to]) => {
	const [origin, through] = [from as Vec, to as Vec]
	return {
		guides: [rayGuide(Ray.fromPoints(origin, through) ?? Ray.of(origin, 0))],
		handles: [
			{ ...pointHandle(0, origin), linesUpWith: through },
			{ ...pointHandle(1, through), linesUpWith: origin },
		],
		move: delta => [change(0, add(origin, delta)), change(1, add(through, delta))],
	}
})
makers.set(makeRayAt, ([from, angle]) => {
	const origin = from as Vec
	const turned = (angle ?? 0) as number
	const ray = Ray.of(origin, turned)
	return {
		guides: [rayGuide(ray)],
		handles: [
			// Its origin takes the whole ray along, as a center does, with the angle staying.
			{ kind: 'translate', name: 'origin', place: 0, at: origin, to: to => [change(0, to)] },
			{
				// It turns the ray, as anything else that turns does, and does not pull along it.
				kind: 'direction',
				rotates: true,
				swings: true,
				at: Ray.at(ray, GIZMO_SIZE) as Vec,
				pivot: origin,
				angle: turned,
				to: (to, _, how) => [change(1, angleHeld(origin, turned, to, how))],
			},
		],
		move: delta => [change(0, add(origin, delta))],
	}
})
/** A line that is only written out, as what it comes to has no handles of its own. */
const gripOfLine = ([through, direction]: StraightLine, arg: number): Grip => {
	const end = add(through, direction)
	return {
		guides: [lineGuide(through, direction)],
		handles: [
			{ kind: 'point', at: through, to: to => [change(arg, [to, direction])] },
			{ kind: 'point', at: end, to: to => [change(arg, [through, sub(to, through)])] },
			flipHandle([(through[0] + end[0]) / 2, (through[1] + end[1]) / 2], direction, () => [
				change(arg, [through, [-direction[0], -direction[1]]]),
			]),
		],
		move: delta => [change(arg, [add(through, delta), direction])],
	}
}
/**
 * What is across a line has none of its own: only those of how that line comes about.
 * It moves with its line, as what it comes to would otherwise change rather than move.
 */
const acrossLine = (keepsASide: boolean): Maker => (args, inner, proportional, free) => {
	const own = inner(1) ?? gripOfLine(args[1] as StraightLine, 1)
	const shape = inner(0)
	return {
		...showingPath(() => ({
			guides: own.guides,
			handles: keepsASide ? own.handles : own.handles.filter(({ kind }) => kind !== 'button'),
		}))(args, inner, proportional, free),
		...(shape?.move === undefined ? {} : { move: movingAll([shape, own]) }),
	}
}
makers.set(makeMirror, acrossLine(true))
makers.set(makeReflect, acrossLine(false))

/** How many mirrors there are, by how far the second of them is from the first, on a ring. */
const mirrorDial = (arg: number, c: Vec, ring: number, count: number, first: number): Handle => ({
	kind: 'dia',
	at: add(c, toward(first + 180 / count, ring)),
	to: to => {
		const apart = Math.min(180, Math.max(3, Math.abs(shortest(degrees(sub(to, c)) - first))))
		return [change(arg, Math.round(180 / apart))]
	},
})
makers.set(makeKaleidoscope, (args, inner, proportional, free) => {
	const [, center, count, angle] = args
	const c = center as Vec
	const mirrors = mirrorsOf(count)
	const first = finite(angle)
	const whole = BOX_ANSWERS.get(makeKaleidoscope)?.(args, inner)?.turned
	// The mirrors alone change what is seen, which turning all of it along with them does not.
	const turning: Handle[] =
		whole === undefined
			? []
			: [
					{
						kind: 'direction',
						rotates: true,
						at: add(c, toward(first, GIZMO_SIZE)),
						pivot: c,
						angle: first,
						to: (to, _, how) => whole(angleHeld(c, first, to, how) - first, c),
					},
				]
	return showingPath(
		() => ({
			// Only as far as the wedge goes, being what it is that is reflected.
			guides: [
				line(c, add(c, toward(first, LINE_REACH))),
				line(c, add(c, toward(first + 180 / mirrors, LINE_REACH))),
			],
			handles: [
				pointHandle(1, c),
				{
					kind: 'direction',
					at: add(c, toward(first, GIZMO_SIZE)),
					pivot: c,
					angle: first,
					to: (to, _, how) => [change(3, angleHeld(c, first, to, how))],
				},
				mirrorDial(2, c, GIZMO_SIZE, mirrors, first),
				...turning,
			],
		}),
		[1]
	)(args, inner, proportional, free)
})
// A tile is a shape, and what it covers an area, each taken hold of as it is by itself.
makers.set(makeKaleidoscopeTile, (args, inner, proportional, free) => {
	const [shape, cell, area] = [inner(0), inner(1), inner(2)]
	const all = [shape, cell, area]
	return {
		...showingPath(() => ({
			guides: [
				pathOf(args[1]),
				outlineOf(args[2] as RectValue),
				...(cell?.guides ?? []),
				...(area?.guides ?? []),
			],
			handles: [...(cell?.handles ?? []), ...(area?.handles ?? [])],
		}))(args, inner, proportional, free),
		// All together or not at all, as moving only some of them changes what is seen.
		move: all.every(grip => grip?.move !== undefined) ? movingAll(all) : undefined,
	}
})

// The cell is a rectangle like any other, and a whole picture moves with its grid, cell for cell.
makers.set(makePixelate, (args, inner, proportional, free) => {
	const [shape, cell] = [inner(0), inner(1)]
	const all = [shape, cell]
	return {
		...showingPath(() => ({
			guides: [outlineOf(args[1] as RectValue), ...(cell?.guides ?? [])],
			handles: cell?.handles ?? [],
		}))(args, inner, proportional, free),
		move: all.every(grip => grip?.move !== undefined) ? movingAll(all) : undefined,
	}
})

makers.set(makeShadow, showingPath(([path, by]) => {
	const center = middleOf(pathOf(path))
	const tip = add(center, by as Vec)
	return {
		guides: [line(center, tip)],
		handles: [{ kind: 'point', at: tip, to: to => [change(1, sub(to, center))] }],
	}
}))
makers.set(makeShadowFrom, showingPath(([path, light, scale]) => {
	const from = light as Vec
	const way = sub(middleOf(pathOf(path)), from)
	const reach = add(from, [way[0] * (scale as number), way[1] * (scale as number)])
	const across = way[0] * way[0] + way[1] * way[1]
	return {
		guides: [line(from, reach)],
		handles: [
			pointHandle(1, from),
			{
				kind: 'arrow',
				at: reach,
				angle: degrees(way),
				to: to => {
					const [x, y] = sub(to, from)
					return across === 0 ? [] : [change(2, (x * way[0] + y * way[1]) / across)]
				},
			},
		],
	}
}, [1]))
makers.set(makeRay, showingPath(([, from, through]) => ({
	guides: [lineGuide(from as Vec, sub(through as Vec, from as Vec))],
	handles: [pointHandle(1, from as Vec), pointHandle(2, through as Vec)],
}), [1, 2]))

const aroundCenter = showingPath(([, center, radius]) => ({
	guides: [circle(center as Vec, radius as number)],
	handles: [
		pointHandle(1, center as Vec),
		radiusHandle(2, center as Vec, 0, radius as number),
	],
}), [1])
makers.set(makeTwirl, aroundCenter)
makers.set(makeBulge, aroundCenter)

for (const fn of [makeZigzag, makeDash, makeSubdivide, makeFlatten, makeReverse]) {
	makers.set(fn, showingPath())
}
// A wave is measured from a place, which the path would otherwise go through the wave from.
makers.set(makeWave, showingPath(undefined, [5]))

/**
 * A matrix taken hold of where it takes `from`, rather than where it takes the origin, which may
 * be nowhere near what it is applied to. It is the same matrix, however it is held.
 */
function matrixGripAt(m: Mat, from: Vec, arg: number): Grip {
	const [a, b, c, d, tx, ty] = m
	const there: Mat = [a, b, c, d, a * from[0] + c * from[1] + tx, b * from[0] + d * from[1] + ty]
	const back = Mat2d.fromTranslation([-from[0], -from[1]])
	const grip = matrixGrip(there, arg)
	return {
		...grip,
		handles: grip.handles.map(handle => ({
			...handle,
			to: (to: Vec, start: Vec, how?: HandleDrag) =>
				handle
					.to(to, start, how)
					.map(({ route, value }) => ({ route, value: Mat2d.mul(value as Mat, back) })),
		})),
	}
}

/** A grip the same, shown `by` this much away from where what it says is. */
function gripMovedBy(grip: Grip, by: Vec): Grip {
	const moved = Mat2d.fromTranslation(by)
	const here = (at: Vec): Vec => add(at, by)
	const there = (at: Vec): Vec => sub(at, by)
	return {
		...grip,
		guides: grip.guides.map(guide => transform(guide, moved)),
		handles: grip.handles.map(handle => handle.stays ? handle : ({
			...handle,
			...(handle.at === undefined ? {} : { at: here(handle.at) }),
			...(handle.path === undefined ? {} : { path: transform(handle.path, moved) }),
			...(handle.pivot === undefined ? {} : { pivot: here(handle.pivot) }),
			...(handle.middle === undefined ? {} : { middle: here(handle.middle) }),
			to: (to: Vec, from: Vec, how?: HandleDrag) => handle.to(there(to), there(from), how),
		})),
	}
}

// What is copied shows what it is a copy of, which is what moves. Its matrix is held at the next
// copy, as what it says is where that one goes.
makers.set(makeReplicate, ([path, by], inner) => {
	const m = by as Mat
	const middle = middleOf(pathOf(path))
	const written = inner(1)
	// What it goes around, if it says: what it is written as is held from there.
	const pivot = written?.handles.find(({ stays }) => stays)?.at
	const [x, y] = sub(middle, pivot ?? [0, 0])
	const own =
		written === null
			? matrixGripAt(m, middle, 1)
			: gripMovedBy(written, [m[0] * x + m[2] * y, m[1] * x + m[3] * y])
	const next: Vec = [
		m[0] * middle[0] + m[2] * middle[1] + m[4],
		m[1] * middle[0] + m[3] * middle[1] + m[5],
	]
	const move = inner(0)?.move
	return {
		handles: own.handles,
		// From what everything goes around, to the path and to its next copy.
		guides: pivot === undefined ? own.guides : [...own.guides, line(pivot, middle), line(pivot, next)],
		sources: [pathOf(path)],
		...(move === undefined ? {} : { move }),
	}
})

// What is combined shows all that goes into it, and moves as one.
const isAPath = (arg: unknown): boolean => arg instanceof PathValue || arg instanceof StyledValue
for (const fn of [makeUnite, makeSubtract, makeIntersect, makeExclude, makeBlendSteps, makeConvexHull, makeRepeatAlong]) {
	makers.set(fn, (args, inner) => {
		const paths = args.filter(isAPath)
		const shapes = paths.map((_, i) => inner(i))
		return {
			guides: [],
			handles: [],
			sources: (paths as PathValue[]).map(pathOf),
			...(shapes.some(shape => shape?.move !== undefined) ? { move: movingAll(shapes) } : {}),
		}
	})
}

// An area is taken hold of as a rectangle is, having the same origin and size.
makers.set(makeArea, makers.get(makeRect)!)

// An artboard is taken hold of by its area: what is on it is measured from that, so goes with it,
// and is not scaled when it is.
makers.set(makeArtboard, (_, inner) => {
	const area = inner(0)
	return {
		guides: [],
		handles: area?.handles ?? [],
		...(area?.move === undefined ? {} : { move: area.move }),
	}
})

/** Where `at` goes, being `x` and `y` times as far from `about`. */
const scaledPlace = ([px, py]: Vec, x: number, y: number, [ax, ay]: Vec): Vec => [
	ax + (px - ax) * x,
	ay + (py - ay) * y,
]
/** A size from its corner, that can go by as much as it likes each way. */
const fromOrigin = (args: readonly unknown[]): BoxAnswer => {
	const [width, height] = args[1] as Vec
	return {
		even: false,
		scaled: (x, y, about) => [change(0, scaledPlace(args[0] as Vec, x, y, about)), change(1, [width * x, height * y])],
	}
}
/** Where `at` goes, being turned by `degrees` around `about`. */
const turnedPlace = (at: Vec, degrees: number, [ax, ay]: Vec): Vec => {
	const [cos, sin] = [Math.cos((degrees * Math.PI) / 180), Math.sin((degrees * Math.PI) / 180)]
	const [x, y] = [at[0] - ax, at[1] - ay]
	return [ax + x * cos - y * sin, ay + x * sin + y * cos]
}
/** Turned by going around, and by saying how far round it is at `angleAt`, if it says. */
const turningAround =
	(angleAt?: number) =>
	(args: readonly unknown[]): Pick<BoxAnswer, 'turned'> => ({
		turned: (degrees, about) => [
			change(0, turnedPlace(args[0] as Vec, degrees, about)),
			...(angleAt === undefined ? [] : [change(angleAt, finite(args[angleAt]) + degrees)]),
		],
	})
/** The same, of what says from how far round it goes to how far round, at `start` and `end`. */
const turningAroundFrom =
	(start: number, end: number) =>
	(args: readonly unknown[]): Pick<BoxAnswer, 'turned'> => ({
		turned: (degrees, about) => [
			change(0, turnedPlace(args[0] as Vec, degrees, about)),
			change(start, finite(args[start]) + degrees),
			change(end, finite(args[end]) + degrees),
		],
	})
/** Places, each an argument, which is all there is to it. */
const ofPlaces = (args: readonly unknown[]): BoxAnswer => ({
	even: false,
	scaled: (x, y, about) => args.map((at, i) => change(i, scaledPlace(at as Vec, x, y, about))),
	turned: (degrees, about) => args.map((at, i) => change(i, turnedPlace(at as Vec, degrees, about))),
})
/** Anchors, each of whose places, handles too, goes where the box takes it. */
const ofAnchors = (args: readonly unknown[]): BoxAnswer => {
	const anchors = args[0] as readonly unknown[]
	const each = (place: (at: Vec) => Vec): Change[] => [
		change(
			0,
			anchors.map(anchor =>
				Array.isArray(anchor)
					? place(anchor as unknown as Vec)
					: Object.fromEntries(Object.entries(anchor as object).map(([key, at]) => [key, place(at as Vec)]))
			)
		),
	]
	return {
		even: false,
		scaled: (x, y, about) => each(at => scaledPlace(at, x, y, about)),
		turned: (degrees, about) => each(at => turnedPlace(at, degrees, about)),
	}
}
/** A center and lengths from it, which have only one scale to go by. */
const centerAnd = (...lengths: readonly number[]) => (args: readonly unknown[]): BoxAnswer => ({
	even: true,
	scaled: (x, y, about) => [
		change(0, scaledPlace(args[0] as Vec, x, y, about)),
		...lengths.map(i => change(i, (args[i] as number) * x)),
	],
})
/** The same, of what says how far round it is, which the box goes with. */
const centerAndTurned = (angleAt: number, ...lengths: readonly number[]) => (args: readonly unknown[]): BoxAnswer => {
	const angle = finite(args[angleAt])
	return { ...centerAnd(...lengths)(args), ...(angle === 0 ? {} : { angle }) }
}
/** A center and a radius each way, along axes turned by `angle`, which the box goes with. */
const alongAxes = (args: readonly unknown[], angle: number): BoxAnswer => {
	const c = args[0] as Vec
	const [rx, ry] = args[1] as Vec
	const [cos, sin] = [Math.cos((angle * Math.PI) / 180), Math.sin((angle * Math.PI) / 180)]
	return {
		even: false,
		...(angle === 0 ? {} : { angle }),
		scaled: (x, y, about) => {
			const [dx, dy] = sub(c, about)
			const along = (dx * cos + dy * sin) * x
			const across = (dy * cos - dx * sin) * y
			return [
				change(0, [about[0] + along * cos - across * sin, about[1] + along * sin + across * cos]),
				change(1, [rx * x, ry * y]),
			]
		},
	}
}
const NOT_BY_A_BOX = (): null => null

type Asked = (args: readonly unknown[], inner: (arg: number) => Grip | null) => BoxAnswer | null

/** How what is made of `answers` goes, being only what they are and `own` besides. */
const answeredTogether = (
	answers: readonly (BoxAnswer | undefined)[],
	{ even = false, keepsAxes = true, own = () => [], ownTurned = () => [], turns = true }: {
		/** What it does by itself comes out the same only by one scale each way. */
		even?: boolean
		/** It lies along what it is made of, so a box along those lies along it. */
		keepsAxes?: boolean
		own?: (x: number, about: Vec, y: number) => readonly Change[]
		/** What it has of its own to turn with what it is made of. */
		ownTurned?: (degrees: number, about: Vec) => readonly Change[]
		/** It comes out the same turned, if what it is made of is. */
		turns?: boolean
	} = {}
): BoxAnswer | null => {
	if (answers.length === 0 || answers.some(answer => answer === undefined)) return null
	const all = answers as readonly BoxAnswer[]
	const angles = new Set(all.map(({ angle = 0 }) => angle))
	const [angle = 0] = angles
	// One scale is the same along any axes, which is all that those on different ones have in common.
	const along = angles.size === 1 && (keepsAxes || angle === 0)
	return {
		even: even || !along || all.some(answer => answer.even),
		...(along && angle !== 0 ? { angle } : {}),
		scaled: (x, y, about) => [
			...all.flatMap(answer => answer.scaled(x, y, about)),
			...own(x, about, y),
		],
		...(turns && all.every(answer => answer.turned !== undefined)
			? {
					turned: (degrees: number, about: Vec) => [
						...all.flatMap(answer => answer.turned!(degrees, about)),
						...ownTurned(degrees, about),
					],
				}
			: {}),
		// What goes along what it is made of is as round, with nothing of its own to be off to a side.
		...(keepsAxes && all.length === 1 && all[0]!.round ? { round: true } : {}),
	}
}
/** The value at `arg`, or what it is when not said. */
const spoken = (fn: unknown, args: readonly unknown[], arg: number): unknown =>
	args[arg] ?? (fn as TypedHostFn).paramTypes?.[arg]?.default
/** Of a path, having lengths at `lengths` and places at `places`, that it has to keep in proportion. */
const inProportion =
	(fn: unknown, { lengths = [], places = [], vectors = [], angles = [], keepsAxes = false }: {
		lengths?: readonly number[]
		places?: readonly number[]
		/** Lengths that go a way, which turn with it. */
		vectors?: readonly number[]
		/** How far round something is said to be. */
		angles?: readonly number[]
		keepsAxes?: boolean
	}): Asked =>
	(args, inner) =>
		answeredTogether([inner(0)?.box], {
			even: true,
			keepsAxes,
			own: (x, about) => [
				...places.map(arg => change(arg, scaledPlace(spoken(fn, args, arg) as Vec, x, x, about))),
				...[...lengths, ...vectors].flatMap(arg => {
					const value = spoken(fn, args, arg)
					// What is not said and is nothing stays that way, however large it gets.
					if (value === 0) return []
					return [change(arg, Array.isArray(value) ? value.map(n => (n as number) * x) : (value as number) * x)]
				}),
			],
			ownTurned: (degrees, about) => [
				...places.map(arg => change(arg, turnedPlace(spoken(fn, args, arg) as Vec, degrees, about))),
				...vectors.map(arg => change(arg, turnedPlace(spoken(fn, args, arg) as Vec, degrees, [0, 0]))),
				...angles.map(arg => change(arg, finite(spoken(fn, args, arg)) + degrees)),
			],
		})
/** What only goes on from what it is made of, at `paths`, or at any that is a path. */
const asItsPaths = (paths?: readonly number[]): Asked => (args, inner) =>
	answeredTogether((paths ?? args.flatMap((arg, i) => (isAPath(arg) ? [i] : []))).map(i => inner(i)?.box))
/** Across a line, which has to be scaled with what it goes across, however it is written. */
const acrossAnswer: Asked = (args, inner) => {
	const line = inner(1)
	const [through, direction] = args[1] as StraightLine
	const written: BoxAnswer = {
		even: true,
		scaled: (x, _, about) => [change(1, [scaledPlace(through, x, x, about), direction])],
		turned: (degrees, about) => [
			change(1, [turnedPlace(through, degrees, about), turnedPlace(direction, degrees, [0, 0])]),
		],
	}
	return answeredTogether([inner(0)?.box, line === null ? written : line.box], { even: true, keepsAxes: false })
}

/**
 * What each thing that comes to a path says to the box around it. Everything answers, and a test
 * holds it to that. What comes of something else asks what it comes of, all the way in, and can be
 * scaled by the box if that can. What it has that goes by a scale of its own only keeps its look by
 * one scale each way.
 */
export const BOX_ANSWERS: ReadonlyMap<unknown, Asked> = new Map<unknown, Asked>([
	[makeLineFromPoints, ofPlaces],
	[
		makeLineAt,
		([through, angle]) => ({
			even: true,
			scaled: (x, _, about) => [change(0, scaledPlace(through as Vec, x, x, about))],
			...turningAround(1)([through, angle]),
		}),
	],
	[makeMirror, acrossAnswer],
	[makeReflect, acrossAnswer],
	[
		makeKaleidoscope,
		(args, inner) => {
			const box = inProportion(makeKaleidoscope, { places: [1] })(args, inner)
			const source = inner(0)?.box?.turned
			return box === null || source === undefined
				? box
				: {
						...box,
						turned: (degrees, about) => [
							...source(degrees, about),
							change(1, turnedPlace(args[1] as Vec, degrees, about)),
							change(3, finite(args[3]) + degrees),
						],
					}
		},
	],
	// A tile only goes on being one by a scale that is the same each way.
	[
		makeKaleidoscopeTile,
		(_, inner) =>
			answeredTogether([inner(0)?.box, inner(1)?.box, inner(2)?.box], { even: true, keepsAxes: false, turns: false }),
	],
	// A grid scales any way with what it is of, and stays upright, as what it says is a row and a column.
	[makePixelate, (_, inner) => answeredTogether([inner(0)?.box, inner(1)?.box], { keepsAxes: false, turns: false })],
	[makeArea, fromOrigin],
	[makeArtboard, (_, inner) => inner(0)?.box ?? null],
	[makeOffset, inProportion(makeOffset, { lengths: [1], keepsAxes: true })],
	[makeOffsetStroke, inProportion(makeOffsetStroke, { lengths: [1], keepsAxes: true })],
	[makeRoundCorners, inProportion(makeRoundCorners, { lengths: [1], keepsAxes: true })],
	[makeChamfer, inProportion(makeChamfer, { lengths: [1], keepsAxes: true })],
	[makeZigzag, inProportion(makeZigzag, { lengths: [1, 2], keepsAxes: true })],
	[makeWave, inProportion(makeWave, { lengths: [1, 2], places: [5], angles: [4] })],
	[makeDash, inProportion(makeDash, { lengths: [1, 2], keepsAxes: true })],
	[makeTwirl, inProportion(makeTwirl, { places: [1], lengths: [2] })],
	[makeBulge, inProportion(makeBulge, { places: [1], lengths: [2] })],
	[makeShadow, inProportion(makeShadow, { vectors: [1] })],
	[makeShadowFrom, inProportion(makeShadowFrom, { places: [1] })],
	[makeRay, inProportion(makeRay, { places: [1, 2] })],
	...[makeSubdivide, makeFlatten, makeReverse].map(fn => [fn, asItsPaths([0])] as const),
	...[makeBlend, makeBlendSteps].map(fn => [fn, asItsPaths([0, 1])] as const),
	...[makeUnite, makeSubtract, makeIntersect, makeExclude, makeConvexHull].map(fn => [fn, asItsPaths()] as const),
	[makeBounds, (_, inner) => answeredTogether([inner(0)?.box], { keepsAxes: false, turns: false })],
	[
		makeRepeatAlong,
		(args, inner) =>
			answeredTogether([inner(0)?.box, inner(1)?.box], {
				even: true,
				keepsAxes: false,
				own: x => [3, 6].flatMap(arg => (args[arg] ? [change(arg, (args[arg] as number) * x)] : [])),
				// What it stamps goes the way the path does, or stays as it is, by what it says.
				turns: false,
			}),
	],
	[
		// One scale from a place is one scale from where that place is inside, whatever the matrix is.
		makeTransformed,
		([, matrix], inner) => {
			const within = inner(0)?.box
			const undo = Mat2d.invert(matrix as Mat) as unknown as Mat | null
			if (within === undefined || undo === null) return null
			return {
				even: true,
				scaled: (x, _, [ax, ay]) =>
					within.scaled(x, x, [undo[0] * ax + undo[2] * ay + undo[4], undo[1] * ax + undo[3] * ay + undo[5]]),
			}
		},
	],
	[makeRect, fromOrigin],
	[makeRoundRect, fromOrigin],
	[makeSquare, centerAnd(1)],
	[makeQr, centerAnd(1)],
	[makeCircle, args => ({ ...centerAnd(1)(args), ...turningAround()(args), round: true })],
	[makeEllipse, args => ({ ...alongAxes(args, (args[2] as number | undefined) ?? 0), ...turningAround(2)(args) })],
	[makeSuperellipse, args => alongAxes(args, 0)],
	[makeNgon, args => ({ ...centerAndTurned(3, 1)(args), ...turningAround(3)(args) })],
	[makeStar, args => ({ ...centerAndTurned(4, 1, 2)(args), ...turningAround(4)(args) })],
	[makeArc, args => ({ ...centerAnd(1)(args), ...turningAroundFrom(2, 3)(args) })],
	[makeFan, args => ({ ...centerAnd(1, 2)(args), ...turningAroundFrom(3, 4)(args) })],
	[makeSpiral, centerAnd(1, 2)],
	[makeLine, ofPlaces],
	[makePolyline, ofPlaces],
	[makeAnchors, ofAnchors],
	[makePolygon, ofPlaces],
	[makeCubic, ofPlaces],
	[
		makeArcThrough,
		args => ({
			even: false,
			scaled: (x, y, about) => args.map((at, i) => change(i, scaledPlace(at as Vec, x, y, about))),
			turned: (degrees, about) => args.map((at, i) => change(i, turnedPlace(at as Vec, degrees, about))),
		}),
	],
	[
		makeDubinsChain,
		args => ({
			even: true,
			scaled: (x, y, about) => [
				change(
					0,
					(args[0] as DubinsStop[]).map(([at, angle, radius]) => [
						scaledPlace(at, x, y, about),
						angle,
						...(radius === undefined ? [] : [radius * x]),
					])
				),
				change(1, (args[1] as number) * x),
			],
			turned: (degrees, about) => [
				change(
					0,
					(args[0] as DubinsStop[]).map(([at, angle, ...rest]) => [
						turnedPlace(at, degrees, about),
						angle + degrees,
						...rest,
					])
				),
			],
		}),
	],
	[
		makeEllipseFromFoci,
		args => ({
			even: true,
			scaled: (x, y, about) => args.map((at, i) => change(i, scaledPlace(at as Vec, x, y, about))),
			turned: (degrees, about) => args.map((at, i) => change(i, turnedPlace(at as Vec, degrees, about))),
		}),
	],
	...[makeCircleFromDiameter, makeCircleThrough].map(
		(fn): [unknown, (args: readonly unknown[]) => BoxAnswer] => [
			fn,
			args => ({
				even: true,
				round: true,
				scaled: (x, y, about) => args.map((at, i) => change(i, scaledPlace(at as Vec, x, y, about))),
				turned: (degrees, about) => args.map((at, i) => change(i, turnedPlace(at as Vec, degrees, about))),
			}),
		]
	),
	[
		makeCapsule,
		([start, end, radius]) => ({
			even: true,
			scaled: (x, y, about) => [
				change(0, scaledPlace(start as Vec, x, y, about)),
				change(1, scaledPlace(end as Vec, x, y, about)),
				change(2, (radius as number) * x),
			],
			turned: (degrees, about) => [
				change(0, turnedPlace(start as Vec, degrees, about)),
				change(1, turnedPlace(end as Vec, degrees, about)),
			],
		}),
	],
	[
		makeClothoid,
		([start, angle, length, from, to]) => ({
			even: true,
			scaled: (x, y, about) => [
				change(0, scaledPlace(start as Vec, x, y, about)),
				change(2, (length as number) * x),
				change(3, (from as number) / x),
				change(4, (to as number) / x),
			],
			...turningAround(1)([start, angle]),
		}),
	],
	[
		makeD,
		([d]) => ({
			even: false,
			scaled: (x, y, [ax, ay]) => [
				change(0, toD(transform(fromD(d as string), [x, 0, 0, y, ax * (1 - x), ay * (1 - y)]))),
			],
			turned: (degrees, [ax, ay]) => {
				const [cos, sin] = [Math.cos((degrees * Math.PI) / 180), Math.sin((degrees * Math.PI) / 180)]
				return [
					change(0, toD(transform(fromD(d as string), [cos, sin, -sin, cos, ax - cos * ax + sin * ay, ay - sin * ax - cos * ay]))),
				]
			},
		}),
	],
	// Copies go by a matrix that says how far, which would have to say it differently.
	[makeReplicate, NOT_BY_A_BOX],
])

export const gripOf = (
	fn: unknown,
	args: readonly unknown[],
	inner: (arg: number) => Grip | null,
	proportional: (arg: number) => boolean = () => false,
	free: (arg: number) => boolean = () => true
): Grip | null => {
	// Asked more than once of each, by what is around it, which is not to double with every level.
	const asked = new Map<number, Grip | null>()
	const once = (arg: number): Grip | null => {
		if (!asked.has(arg)) asked.set(arg, inner(arg))
		return asked.get(arg)!
	}
	// A type called is its constructor, and is held as that is
	const called = isTypeValue(fn) ? (constructorOf(fn) ?? fn) : fn
	const grip = makers.get(called)?.(args, once, proportional, free) ?? null
	const box = grip === null ? null : (BOX_ANSWERS.get(called)?.(args, once) ?? null)
	return box === null ? grip : { ...grip!, box }
}

/** Where the program's coordinates are for the argument at `arg` of a call of `fn`. */
export function withinArg(fn: unknown, arg: number, args: readonly unknown[]): Mat | null {
	if (fn === makeTransformed && arg === 0) return args[1] as Mat
	if (fn === makeArtboard && arg === ARTBOARD_LAYERS && isRect(args[0])) {
		const [x, y] = (args[0] as RectValue).origin
		return [1, 0, 0, 1, x, y]
	}
	if (fn === multiply) {
		return (args as Mat[])
			.slice(0, arg)
			.reduce<Mat>((a, b) => Mat2d.mul(a, b) as unknown as Mat, Mat2d.I as unknown as Mat)
	}
	return null
}

const SOLID_COLOR = '#ffffff'

/** A color that fills the whole of a canvas, however far it goes. */
const makeSolid = withDoc(
	makeTypedFn([colorOf(SOLID_COLOR)], said(colorOf(SOLID_COLOR), 'solid', 'ph:paint-bucket'), color => color, ['color']),
	'Fills the whole of the canvas with a `color`, covering what is behind it among the layers.',
	'Solid'
)

/** What of a graph paper a canvas shows, by the same words as what is laid over it. */
export const graphPaperKindType = enumOf({
	dots: 'ph:dots-nine',
	lines: 'ph:grid-four',
})

/** A gray that can be seen on most backgrounds, and that does not get in the way on them. */
const PAPER_COLOR = '#80808040'
const PAPER_WIDTH = 1

/** What is laid over a canvas, and how: `width` is on screen, as how far apart they are is. */
export class GraphPaperValue {
	constructor(
		readonly kind: GraphPaperKind,
		readonly color: string,
		readonly width: number,
		readonly origin: Vec,
		readonly step: number,
		readonly adaptive: boolean
	) {}

	[AS_SOURCE](): AST {
		const said: Array<[string, AST]> = [
			...(this.color === PAPER_COLOR ? [] : [['color', lit(this.color)] as [string, AST]]),
			...(this.width === PAPER_WIDTH ? [] : [['width', lit(this.width)] as [string, AST]]),
			...(this.origin[0] === 0 && this.origin[1] === 0 ? [] : [['origin', toAst(this.origin, null)] as [string, AST]]),
			...(this.step === PAPER_STEP ? [] : [['step', lit(this.step)] as [string, AST]]),
			...(this.adaptive ? [] : [['adaptive', lit(false)] as [string, AST]]),
		]
		return new CallAST(parse('graphPaper'), [lit(this.kind)], said.length > 0 ? new Map(said) : undefined)
	}
}

const isGraphPaper = (value: unknown): value is GraphPaperValue => value instanceof GraphPaperValue

const graphPaperType = said(
	makeType('graphPaper', isGraphPaper, new GraphPaperValue('dots', PAPER_COLOR, PAPER_WIDTH, [0, 0], PAPER_STEP, true)),
	'graphPaper',
	'ph:grid-four'
)

/** What a canvas is seen by, and as much of the project as what is behind it. */
const makeGraphPaper = withDoc(
	withOptional(
		makeTypedFn(
			[graphPaperKindType, colorOf(PAPER_COLOR), numberOf(PAPER_WIDTH), withDefault(point, [0, 0]), numberOf(PAPER_STEP), withDefault(booleanType, true)],
			graphPaperType,
			(kind, color, width, origin, step, adaptive) =>
				new GraphPaperValue(
					kind as GraphPaperKind,
					color as string,
					Math.max(0, width as number),
					origin as Vec,
					(step as number) > 0 ? (step as number) : PAPER_STEP,
					adaptive as boolean
				),
			['kind', 'color', 'width', 'origin', 'step', 'adaptive']
		),
		['color', 'width', 'origin', 'step', 'adaptive']
	),
	'Lays `dots` or `lines` over the whole of the canvas, on and on, in a `color` and a `width`, `step` apart from `origin`. If `adaptive`, they are divided further or left out as the view zooms. They are exported as they are at full size, `step` apart.',
	'Graph Paper'
)

const AXES_COLOR = '#80808080'
const AXES_WIDTH = 1

/** The two lines through a place, on and on: `width` is on screen. */
export class AxesValue {
	constructor(
		readonly origin: Vec,
		readonly color: string,
		readonly width: number
	) {}

	[AS_SOURCE](): AST {
		const said: Array<[string, AST]> = [
			...(this.origin[0] === 0 && this.origin[1] === 0 ? [] : [['origin', toAst(this.origin, null)] as [string, AST]]),
			...(this.color === AXES_COLOR ? [] : [['color', lit(this.color)] as [string, AST]]),
			...(this.width === AXES_WIDTH ? [] : [['width', lit(this.width)] as [string, AST]]),
		]
		return new CallAST(parse('axes'), [], said.length > 0 ? new Map(said) : undefined)
	}
}

const isAxes = (value: unknown): value is AxesValue => value instanceof AxesValue

const axesType = said(
	makeType('axes', isAxes, new AxesValue([0, 0], AXES_COLOR, AXES_WIDTH)),
	'axes',
	AXES_ICON
)

const makeAxes = withDoc(
	withOptional(
		makeTypedFn(
			[withDefault(point, [0, 0]), colorOf(AXES_COLOR), numberOf(AXES_WIDTH)],
			axesType,
			(origin, color, width) => new AxesValue(origin as Vec, color as string, Math.max(0, width as number)),
			['origin', 'color', 'width']
		),
		['origin', 'color', 'width']
	),
	'Draws the two lines through `origin`, across the whole of the canvas, on and on, in a `color` and a `width`.',
	'Axes'
)

/** What shows up on a solid of `color`. */
export const inkOn = (color: string): string =>
	(parsed(color).to('oklch').coords[0] || 0) > 0.6 ? '#000000' : '#ffffff'

const BINDINGS: Readonly<Record<string, unknown>> = {
	path: pathType,
	line: lineType,
	ray: rayType,
	rect: rectType,
	percent: percentType,
	color: colorType,
	style: makeStyled,
	spray: makeSpray,
	triangleStrip: makeTriangleStrip,
	solid: makeSolid,
	artboard: makeArtboard,
	Sketch: sketchType,
	graphPaper: makeGraphPaper,
	axes: makeAxes,
	vec2,
	point,
	size,
	mat2d,
}

/** `parent`, with what a canvas adds. */
/** What is said of a name, for people to read, as what it is written at and not what it comes to. */
const ABOUT: Readonly<Record<string, { readonly label: string; readonly doc: string }>> = {
	point: { label: 'Point', doc: 'A place on the canvas, for other things to go by.' },
	artboard: {
		label: 'Artboard',
		doc: 'A page of the canvas, over an `area` filled with `fill`, holding `layers` that are measured from its top left corner, and cut off at its edge if it `clip`s. It is exported by itself as that area.',
	},
}

export function withGraphics(parent: Env): Env {
	const bindings = new Map<string, { ast: AST; env: Env }>()
	for (const [name, value] of Object.entries(BINDINGS)) {
		const about = ABOUT[name]
		bindings.set(name, {
			ast:
				about === undefined
					? host(value)
					: new MetaAST(
							new RecordAST([
								['label', lit(about.label)],
								['doc', lit(about.doc)],
							]),
							host(value)
						),
			env: null,
		})
	}
	return { ast: new LetAST([], null), parent, bindings }
}
