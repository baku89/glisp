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
	lit,
	makeTupleType,
	makeType,
	makeTypedFn,
	parse,
	print,
	RecordAST,
	type TypeValue,
	UNSET,
	toAst,
	VecAST,
	withDoc,
	withExpansion,
	withInverse,
	withMembers,
	withDefaultFrom,
	withOptional,
	withTypeMeta,
} from '@glisp/lang'
import { withInitial } from '@glisp/tweeq/filters'
import Color from 'colorjs.io'
import { mat2d as Mat2d, vec2 as Vec2 } from 'linearly'
import { bounds } from 'pave/path/metrics'
import { merge } from 'pave/path/compound'
import { transform } from 'pave/path/modifiers'
import {
	arc,
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
import { clothoid, spiral } from 'pave/path/spirals'
import { superellipse } from 'pave/path/superellipse'
import { exclude, intersect, subtract, unite } from 'pave/path/boolean'
import { dash } from 'pave/path/dash'
import { bulge, twirl, wave } from 'pave/path/distortions'
import { convexHull } from 'pave/path/hull'
import { mirror, reflect } from 'pave/path/mirror'
import { chamfer, fillet, flatten, reverse, subdivide, zigzag } from 'pave/path/modifiers'
import { blend } from 'pave/path/layout'
import { normal } from 'pave/path/location'
import { offset, offsetStroke } from 'pave/path/offset'
import { nearest } from 'pave/path/queries'
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
		'fill:M11.25 3h1.5v6h-1.5zM11.25 15h1.5v6h-1.5zM3 11.25h6v1.5H3zM15 11.25h6v1.5h-6z'
	),
	new RecordAST([
		['input', lit('translate')],
		['name', lit('point')],
		// Where something is can change without what it is changing.
		['changesFirst', lit(true)],
		// Where something is can change without what it is changing.
	])
)

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
/** How far a matrix moves things, which a pad can take hold of, though it is nowhere to be drawn. */
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
		return new CallAST(parse('rect.new'), [toAst(this.origin, null), toAst(this.size, null)])
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

/** A path's own shape, fit into an icon, or null if it is not a path with a size. */
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
	return `stroke:${toD(transform(path, fit))}`
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
		['summary', lit('SVG Path')],
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
const makeSuperellipse = makeTypedFn(
	[point, size, number],
	pathType,
	(center, radius, shape) =>
		new PathValue(
			superellipse(center as Vec, radius as Vec, Number.isNaN(shape) ? 2 : (shape as number))
		),
	['center', 'radius', 'shape']
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
const makeSpiral = makeTypedFn(
	[point, number, number, number],
	pathType,
	(center, start, end, turns) =>
		new PathValue(spiral(center as Vec, outward(start), outward(end), finite(turns))),
	['center', 'startRadius', 'endRadius', 'turns']
)
/** How a clothoid is, as pave can draw it. */
const clothoidOf = (args: readonly unknown[]): Path =>
	clothoid(
		args[0] as Vec,
		finite(args[1]),
		outward(args[2]),
		finite(args[3]),
		finite(args[4])
	)
const makeClothoid = makeTypedFn(
	[point, angleType, number, number, number],
	pathType,
	(...args) => new PathValue(clothoidOf(args)),
	['start', 'angle', 'length', 'startCurvature', 'endCurvature']
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
const colorOf = (fallback: string): TypeValue =>
	Object.create(withTypeMeta(stringType, colorMeta), {
		default: { value: fallback },
	}) as TypeValue
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
const mixed = makeTypedFn(
	[colorType, colorType, percentType],
	colorType,
	(a, b, t) => toHex(parsed(a).mix(parsed(b), t as number, { space: 'oklch' }) as Color),
	['a', 'b', 'ratio']
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
withMembers(colorType, {
	rgb: withDoc(makeRgb, 'A color from how much `red`, `green` and `blue` it has, from 0 to 1.', 'RGB'),
	hsl: withDoc(makeHsl, 'A color from its `hue` in degrees, and `saturation` and `lightness` from 0 to 1.', 'HSL'),
	gray: withDoc(makeGray, 'A gray, from black at 0 to white at 1.', 'Gray'),
	alpha: withDoc(makeAlpha, 'A `color`, as see-through as `alpha` says, from 0 to 1.', 'Alpha'),
	mix: withDoc(mixed, 'What `a` and `b` come to together, as far from `a` as `ratio` says.', 'Mix'),
	brighten: withDoc(makeBrighter, 'A `color`, lighter by how much it looks.', 'Brighten'),
	darken: withDoc(makeDarker, 'A `color`, darker by how much it looks.', 'Darken'),
	invert: withDoc(makeInverted, 'The opposite of a `color`.', 'Invert'),
})

const styledType = said(
	makeType('styled', isStyled, new StyledValue(pathType.default as PathValue, NO_PAINT)),
	'path',
	'mdi:vector-curve'
)
/** An enum of how a line is drawn, each value saying what its icon is. */
const enumOf = (icons: Readonly<Record<string, string>>): TypeValue => {
	const values = Object.entries(icons).map(
		([value, icon]) => `^{icon: ${JSON.stringify(icon)}} ${JSON.stringify(value)}`
	)
	return evaluate(parse(`(enum ${values.join(' ')})`), buildPrelude()).value as TypeValue
}

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
		[pathType, distanceType, lineJoinType, miterLimitType],
		pathType,
		(path, distance, join, miterLimit) =>
			new PathValue(
				offset((path as PathValue).path, distance as number, {
					lineJoin: join as CanvasLineJoin,
					miterLimit: miterLimit as number,
				})
			),
		['path', 'distance', 'join', 'miterLimit']
	),
	['join', 'miterLimit']
)

const makeOffsetStroke = withOptional(
	makeTypedFn(
		[pathType, distanceType, lineCapType, lineJoinType, miterLimitType],
		pathType,
		(path, width, cap, join, miterLimit) =>
			new PathValue(
				offsetStroke((path as PathValue).path, width as number, {
					lineCap: cap as CanvasLineCap,
					lineJoin: join as CanvasLineJoin,
					miterLimit: miterLimit as number,
				})
			),
		['path', 'width', 'cap', 'join', 'miterLimit']
	),
	['cap', 'join', 'miterLimit']
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
const makeMirror = withInitial(
	makeTypedFn(
		[pathType, point, point],
		pathType,
		(path, start, end) => new PathValue(mirror(pathOf(path), [start as Vec, end as Vec])),
		['path', 'start', 'end']
	),
	(path: unknown) => {
		const [[, top], [right, bottom]] = bounds(pathOf(path))
		return [
			[right, top],
			[right, bottom],
		]
	}
)
const makeReflect = withInitial(
	makeTypedFn(
		[pathType, point, point],
		pathType,
		(path, start, end) => new PathValue(reflect(pathOf(path), [start as Vec, end as Vec])),
		['path', 'start', 'end']
	),
	(path: unknown) => {
		const [[, top], [right, bottom]] = bounds(pathOf(path))
		return [
			[right, top],
			[right, bottom],
		]
	}
)
const lengthOf = (value: number): TypeValue => withDefault(number, value)
const makeZigzag = makeTypedFn(
	[pathType, lengthOf(5), lengthOf(20)],
	pathType,
	(path, amplitude, wavelength) =>
		new PathValue(zigzag(pathOf(path), amplitude as number, wavelength as number)),
	['path', 'amplitude', 'wavelength']
)
const makeWave = makeTypedFn(
	[pathType, lengthOf(5), lengthOf(40)],
	pathType,
	(path, amplitude, wavelength) =>
		new PathValue(wave(pathOf(path), amplitude as number, wavelength as number)),
	['path', 'amplitude', 'wavelength']
)
const makeTwirl = withInitial(
	makeTypedFn(
		[pathType, point, number, withDefault(angleType, 90)],
		pathType,
		(path, center, radius, angle) =>
			new PathValue(twirl(pathOf(path), center as Vec, radius as number, angle as number)),
		['path', 'center', 'radius', 'angle']
	),
	(path: unknown) => {
		const { middle, reach } = aroundOf(pathOf(path))
		return [middle, reach * 1.5]
	}
)
const makeBulge = withInitial(
	makeTypedFn(
		[pathType, point, number, withDefault(number, 0.5)],
		pathType,
		(path, center, radius, strength) =>
			new PathValue(bulge(pathOf(path), center as Vec, radius as number, strength as number)),
		['path', 'center', 'radius', 'strength']
	),
	(path: unknown) => {
		const { middle, reach } = aroundOf(pathOf(path))
		return [middle, reach * 1.5]
	}
)
const makeDash = makeTypedFn(
	[pathType, withDefault(makeTupleType([], number), [10, 5])],
	pathType,
	(path, pattern) => new PathValue(dash(pathOf(path), pattern as number[])),
	['path', 'pattern']
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
const makeConvexHull = makeTypedFn([pathType], pathType, path => new PathValue(convexHull(pathOf(path))), ['path'])

withMembers(rectType, {
	new: withDoc(makeArea, 'An area from its `origin`, of this `size`, such as a page to export.', 'Area'),
})

withMembers(pathType, {
	bounds: withDoc(makeBounds, 'The area that `path` just fits in.', 'Bounds'),
	offset: withDoc(makeOffset, 'The outline of `path`, this `distance` out from it, or in, if that is below 0, going around corners by `join`.', 'Offset'),
	offsetStroke: withDoc(makeOffsetStroke, 'The outline of a line along `path`, this `width`, ending by `cap` and going around corners by `join`.', 'Offset Stroke'),
	roundCorners: withDoc(makeRoundCorners, 'The same `path`, with its corners rounded by `radius`.', 'Round Corners'),
	chamfer: withDoc(makeChamfer, 'The same `path`, with its corners cut off `distance` back along each side.', 'Chamfer'),
	mirror: withDoc(makeMirror, 'The `path`, and what it is across the line from `start` to `end`, as one.', 'Mirror'),
	reflect: withDoc(makeReflect, 'What `path` is across the line from `start` to `end`.', 'Reflect'),
	zigzag: withDoc(makeZigzag, 'The `path`, going from side to side by `amplitude`, once every `wavelength` along it.', 'Zigzag'),
	wave: withDoc(makeWave, 'The `path`, moved by a wave of this `amplitude` and `wavelength`.', 'Wave'),
	twirl: withDoc(makeTwirl, 'The `path`, turned around `center` by `angle` in degrees, less so out to `radius`.', 'Twirl'),
	bulge: withDoc(makeBulge, 'The `path`, pushed out from `center` by `strength`, less so out to `radius`.', 'Bulge'),
	dash: withDoc(makeDash, 'The parts of `path` that a line with this `pattern` of dashes and gaps would draw.', 'Dash'),
	subdivide: withDoc(makeSubdivide, 'The same `path`, with each segment made into `division` of them.', 'Subdivide'),
	flatten: withDoc(makeFlatten, 'The `path` in straight lines, as close to it as `tolerance`.', 'Flatten'),
	reverse: withDoc(makeReverse, 'The same `path`, going the other way.', 'Reverse'),
	convexHull: withDoc(makeConvexHull, 'The least convex shape that `path` fits in, as a band around it would be.', 'Convex Hull'),
	unite: withDoc(makeUnite, 'What is inside of any of them.', 'Unite'),
	subtract: withDoc(makeSubtract, 'What is inside of `subject`, and not inside of `tool` or any of `tools`.', 'Subtract'),
	intersect: withDoc(makeIntersect, 'What is inside of all of them.', 'Intersect'),
	exclude: withDoc(makeExclude, 'What is inside of one of them, and not where an even number overlap.', 'Exclude'),
	blend: withDoc(makeBlend, 'What is between `a` and `b`, as far from `a` as `ratio` says.', 'Blend'),
	d: withDoc(makeD, 'A path from its data, as an SVG path has it.', 'Path Data'),
	circle: withDoc(makeCircle, 'A circle around `center`, as far out as `radius`.', 'Circle'),
	ellipseFromFoci: withDoc(makeEllipseFromFoci, 'An ellipse around `focus1` and `focus2`, going `through` a point, which says how large it is, as an ellipse is where the distances to its foci come to the same.', 'Ellipse from Foci'),
	ellipse: withDoc(makeEllipse, 'An ellipse around `center`, with a `radius` along each of its axes, turned by `angle`, in degrees.', 'Ellipse'),
	rect: withDoc(makeRect, 'A rectangle from its `origin`, of this `size`.', 'Rectangle'),
	square: withDoc(makeSquare, 'A square from its `origin`, with sides of this `size`.', 'Square'),
	line: withDoc(makeLine, 'A straight line from `start` to `end`.', 'Line'),
	polyline: withDoc(makePolyline, 'Straight lines through each of the points, in turn.', 'Polyline'),
	polygon: withDoc(makePolygon, 'Straight lines through each of the points, and back.', 'Polygon'),
	ngon: withDoc(makeNgon, 'A regular polygon around `center`, with as many sides as `sides`, and its first vertex toward `angle`, in degrees.', 'Regular Polygon'),
	star: withDoc(makeStar, 'A star around `center`, of as many `points`, going between `outerRadius` and `innerRadius`, with its first point toward `angle`, in degrees.', 'Star'),
	roundRect: withDoc(makeRoundRect, 'A rectangle from its `origin`, of this `size`, with corners rounded by `radius`.', 'Rounded Rectangle'),
	capsule: withDoc(makeCapsule, 'What is within `radius` of the line from `start` to `end`: a line with round ends.', 'Capsule'),
	superellipse: withDoc(makeSuperellipse, 'Between shapes around `center`, by `shape`: 0 is a diamond, 1 an ellipse, 2 a squircle, and more comes toward a rectangle. Less than 0 has its sides drawn in.', 'Superellipse'),
	arc: withDoc(makeArc, 'Part of a circle around `center`, from the angle `start` to `end`, in degrees.', 'Arc'),
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
}

/** A place on a canvas to take hold of a call by. */
export interface Handle {
	/**
	 * What it looks like, which tells what it does: `point` is a place, `translate`
	 * takes the whole, `arrow` pulls a length, `offset` moves an outline out along its normal,
	 * `direction` turns toward where it is,
	 * `dia` a count, and `path` is its own line, such as an edge.
	 */
	readonly kind: 'point' | 'translate' | 'arrow' | 'offset' | 'direction' | 'dia' | 'path'
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
					// What it comes out of, and the control on the other side of that, if any.
					const anchor = a === 0 ? previous.point : at
					const across = a === 0 ? (v === 0 ? vertices.length - 1 : v - 1) : (v + 1) % vertices.length
					const reaches = a === 0 ? v > 0 || closed : v + 1 < vertices.length || closed
					handles.push({
						kind: 'point',
						name: 'control',
						control: true,
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

/** As far from `c` as `to` is, at the nearest of the angles that go evenly. */
const evenFrom = (c: Vec, to: Vec): Vec =>
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
	[makeD, ([d]) => gripOfD(fromD(d as string))],
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
						name: 'right',
						at: on(rx, 0),
						angle: first,
						to: to => [change(1, [across(to, 0), UNSET])],
					},
					{
						kind: 'arrow',
						name: 'bottom',
						at: on(0, ry),
						angle: first + 90,
						to: to => [change(1, [UNSET, across(to, 90)])],
					},
					{
						kind: 'direction',
						at: facing,
						pivot: c,
						angle: first,
						to: (to, _, how) => [change(2, angleHeld(c, first, to, how))],
					},
					{ kind: 'translate', name: 'center', place: 0, at: c, to: to => [change(0, to)] },
				],
				guides: [line(on(rx, 0), facing)],
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
	[makePolyline, args => pointsGrip(args as Vec[], [], { lines: linesThrough(args as Vec[], false) })],
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
					{ kind: 'translate', name: 'center', place: 0, at: c, to: to => [change(0, to)] },
				],
				guides: [arc(c, ring, first + 3.6, first + 120)],
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
					{ kind: 'translate', name: 'center', place: 0, at: c, to: to => [change(0, to)] },
				],
				guides: [arc(c, ring, first + 3.6, first + 120)],
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
			const held = Math.min(Math.max(r, HANDLE_CLEAR), most)
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
							return [change(2, Math.min(most, Math.max(0, r + by)))]
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
	(handles: (args: readonly unknown[]) => Pick<Grip, 'handles' | 'guides'> = () => ({ handles: [], guides: [] })): Maker =>
	(args, inner) => {
		const shape = inner(0)
		return {
			...handles(args),
			sources: [pathOf(args[0])],
			...(shape?.move === undefined ? {} : { move: movingAll([shape]) }),
		}
	}

const pointHandle = (arg: number, at: Vec): Handle => ({
	kind: 'point',
	at,
	to: to => [change(arg, to)],
})

const acrossLine = showingPath(([, start, end]) => ({
	guides: [line(start as Vec, end as Vec)],
	handles: [pointHandle(1, start as Vec), pointHandle(2, end as Vec)],
}))
makers.set(makeMirror, acrossLine)
makers.set(makeReflect, acrossLine)

const aroundCenter = showingPath(([, center, radius]) => ({
	guides: [circle(center as Vec, radius as number)],
	handles: [
		pointHandle(1, center as Vec),
		radiusHandle(2, center as Vec, 0, radius as number),
	],
}))
makers.set(makeTwirl, aroundCenter)
makers.set(makeBulge, aroundCenter)

for (const fn of [makeZigzag, makeWave, makeDash, makeSubdivide, makeFlatten, makeReverse, makeConvexHull]) {
	makers.set(fn, showingPath())
}

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
for (const fn of [makeUnite, makeSubtract, makeIntersect, makeExclude]) {
	makers.set(fn, (args, inner) => {
		const shapes = args.map((_, i) => inner(i))
		return {
			guides: [],
			handles: [],
			sources: (args as PathValue[]).map(({ path }) => path),
			...(shapes.some(shape => shape?.move !== undefined) ? { move: movingAll(shapes) } : {}),
		}
	})
}

// An area is taken hold of as a rectangle is, having the same origin and size.
makers.set(makeArea, makers.get(makeRect)!)

export const gripOf = (
	fn: unknown,
	args: readonly unknown[],
	inner: (arg: number) => Grip | null,
	proportional: (arg: number) => boolean = () => false,
	free: (arg: number) => boolean = () => true
): Grip | null => makers.get(fn)?.(args, inner, proportional, free) ?? null

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

/** A color that fills the whole of a canvas, however far it goes. */
const makeBackground = withDoc(
	makeTypedFn([paintColor], said(paintColor, 'background', 'ph:paint-bucket'), color => color, ['color']),
	'Fills the whole of the canvas with a `color`, behind everything drawn.',
	'Background'
)

/** What of a grid a canvas shows, by the same words as what is laid over it. */
export const gridKindType = enumOf({
	dots: 'ph:dots-nine',
	lines: 'ph:grid-four',
	none: 'ph:prohibit',
})

/** What a canvas is seen by, and as much of the project as what is behind it. */
const makeGrid = withDoc(
	makeTypedFn([gridKindType], said(gridKindType, 'grid', 'ph:grid-four'), kind => kind, ['kind']),
	'Lays `dots` or `lines` over the canvas to see by, at the program\'s coordinates. It is not drawn into anything exported.',
	'Grid'
)

/** What shows up on a background of `color`. */
export const inkOn = (color: string): string =>
	(parsed(color).to('oklch').coords[0] || 0) > 0.6 ? '#000000' : '#ffffff'

const BINDINGS: Readonly<Record<string, unknown>> = {
	path: pathType,
	rect: rectType,
	percent: percentType,
	color: colorType,
	style: makeStyled,
	background: makeBackground,
	grid: makeGrid,
	vec2,
	point,
	size,
	mat2d,
}

/** `parent`, with what a canvas adds. */
export function withGraphics(parent: Env): Env {
	const bindings = new Map<string, { ast: AST; env: Env }>()
	for (const [name, value] of Object.entries(BINDINGS)) {
		bindings.set(name, { ast: host(value), env: null })
	}
	return { ast: new LetAST([], null), parent, bindings }
}
