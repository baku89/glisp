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
	withOptional,
	withTypeMeta,
} from '@glisp/lang'
import Color from 'colorjs.io'
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
const part = (fields: readonly (readonly [string, string | number])[]): TypeValue =>
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
		'fill:M11.25 3h1.5v6h-1.5zM11.25 15h1.5v6h-1.5zM3 11.25h6v1.5H3zM15 11.25h6v1.5h-6z'
	),
	new RecordAST([['input', lit('translate')]])
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
	])
)

/** How long the side of something is. */
const sideType = part([['min', 0]])

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
	translate: withDoc(makeTranslation, 'A matrix that moves `by` this much.', 'Translation'),
	rotate: withDoc(makeRotation, 'A matrix that turns by `angle`, in degrees, around the origin.', 'Rotation'),
	scale: withDoc(makeScaling, 'A matrix that scales `by` this much each way, from the origin.', 'Scaling'),
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
const stringType = evaluate(parse('string'), buildPrelude()).value as TypeValue
const colorMeta = new RecordAST([
	['input', lit('color')],
	['icon', lit('ph:palette')],
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

const toHex = (color: Color): string =>
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
	[number, number, number],
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
	[colorType, colorType, number],
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

withMembers(pathType, {
	d: withDoc(makeD, 'A path from its data, as an SVG path has it.', 'Path Data'),
	circle: withDoc(makeCircle, 'A circle around `center`, as far out as `radius`.', 'Circle'),
	ellipse: withDoc(makeEllipse, 'An ellipse around `center`, with a `radius` each way.', 'Ellipse'),
	rect: withDoc(makeRect, 'A rectangle from its `origin`, of this `size`.', 'Rectangle'),
	square: withDoc(makeSquare, 'A square from its `origin`, with sides of this `size`.', 'Square'),
	line: withDoc(makeLine, 'A straight line from `start` to `end`.', 'Line'),
	polyline: withDoc(makePolyline, 'Straight lines through each of the points, in turn.', 'Polyline'),
	polygon: withDoc(makePolygon, 'Straight lines through each of the points, and back.', 'Polygon'),
	ngon: withDoc(makeNgon, 'A regular polygon around `center`, with as many sides as `sides`.', 'Regular Polygon'),
	arc: withDoc(makeArc, 'Part of a circle around `center`, from the angle `start` to `end`, in degrees.', 'Arc'),
	cubic: withDoc(makeCubic, 'A curve from `start` to `end`, drawn toward `control1` and `control2`.', 'Cubic Curve'),
	transform: withDoc(makeTransformed, 'The same `path`, moved, turned and scaled `by` a matrix.', 'Transform'),
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
	/** It is drawn with a broken line, being there only to take hold of. */
	readonly dashed?: boolean
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

/** A grip the same, for the call that is the argument at `arg`. */
export const under = (arg: number, grip: Grip): Grip => {
	const lower = (changes: readonly Change[]): Change[] =>
		changes.map(({ route, value }) => ({ route: [arg, ...route], value }))
	const { move } = grip
	return {
		guides: grip.guides,
		within: grip.within === undefined ? `arg${arg}` : `arg${arg}/${grip.within}`,
		...(grip.snaps === undefined ? {} : { snaps: grip.snaps }),
		...(grip.marks === undefined
			? {}
			: { marks: grip.marks.map(mark => ({ ...mark, route: [arg, ...mark.route] })) }),
		handles: grip.handles.map(handle => ({
			...handle,
			to: (to, from, how) => lower(handle.to(to, from, how)),
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
					handles.push({
						kind: 'point',
						name: 'control',
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

const GIZMO_SIZE = 80
const NGON_RING = 40

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
	proportional: (arg: number) => boolean
) => Grip

const makers = new Map<unknown, Maker>([
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
						kind: 'arrow',
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
		([center, radius]) => {
			const c = center as Vec
			const [rx, ry] = radius as Vec
			return {
				marks: [
					...pointMarks([0], [c[0], c[1] - ry]),
					{ route: [1], index: 0, at: [c[0] + rx, c[1]], side: 'right' },
					{ route: [1], index: 1, at: [c[0], c[1] + ry], side: 'below' },
				],
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
					{ kind: 'translate', name: 'center', place: 0, at: c, to: to => [change(0, to)] },
				],
				guides: [],
				snaps: {
					points: [
						{ at: [c[0] + rx, c[1]], name: 'right', code: ELLIPSE_SIDES['right']! },
						{ at: [c[0], c[1] + ry], name: 'bottom', code: ELLIPSE_SIDES['bottom']! },
						{ at: [c[0] - rx, c[1]], name: 'left', code: ELLIPSE_SIDES['left']! },
						{ at: [c[0], c[1] - ry], name: 'top', code: ELLIPSE_SIDES['top']! },
					],
				},
				move: delta => [change(0, add(c, delta))],
			}
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
					{ kind: 'arrow', name: 'left', code: rectPlace(0, 2), angle: 0, at: [s[0], middle[1]], means: sideMeans(sides.left, widthBy.left), to: (to, _, how) => sideTo(sides.left, to[0], how) },
					{ kind: 'arrow', name: 'top', code: rectPlace(2, 0), angle: 90, at: [middle[0], s[1]], means: sideMeans(sides.top, heightBy.top), to: (to, _, how) => sideTo(sides.top, to[1], how) },
					{ kind: 'arrow', name: 'right', code: rectPlace(1, 2), angle: 0, at: [e[0], middle[1]], means: sideMeans(sides.right, widthBy.right), to: (to, _, how) => sideTo(sides.right, to[0], how) },
					{ kind: 'arrow', name: 'bottom', code: rectPlace(2, 1), angle: 90, at: [middle[0], e[1]], means: sideMeans(sides.bottom, heightBy.bottom), to: (to, _, how) => sideTo(sides.bottom, to[1], how) },
					{ kind: 'point', name: 'top left', place: 0, angle: 45, at: s, constrained: keeps, means: cornerMeans(sides.left, sides.top, widthBy.left, heightBy.top), to: (to, _, how) => cornerTo(sides.left, sides.top, to, how) },
					{ kind: 'point', name: 'top right', code: rectPlace(1, 0), angle: -45, at: [e[0], s[1]], means: cornerMeans(sides.right, sides.top, widthBy.right, heightBy.top), to: (to, _, how) => cornerTo(sides.right, sides.top, to, how) },
					{ kind: 'point', name: 'bottom left', code: rectPlace(0, 1), angle: -45, at: [s[0], e[1]], means: cornerMeans(sides.left, sides.bottom, widthBy.left, heightBy.bottom), to: (to, _, how) => cornerTo(sides.left, sides.bottom, to, how) },
					{ kind: 'point', name: 'bottom right', code: rectPlace(1, 1), angle: 45, at: e, means: cornerMeans(sides.right, sides.bottom, widthBy.right, heightBy.bottom), to: (to, _, how) => cornerTo(sides.right, sides.bottom, to, how) },
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
			return {
				marks: [
					...pointMarks([0], s, 'above-start'),
					{ route: [1], at: [middle[0], Math.max(s[1], e[1])], side: 'below' },
				],
				handles: [
					{ kind: 'arrow', name: 'right', code: squarePlace(1, 2), angle: 0, at: [e[0], middle[1]], to: to => [sized(to[0] - s[0])] },
					{ kind: 'arrow', name: 'bottom', code: squarePlace(2, 1), angle: 90, at: [middle[0], e[1]], to: to => [sized(to[1] - s[1])] },
					{
						kind: 'point',
						name: 'top left',
						place: 0,
						angle: 45,
						at: s,
						means: [{ route: [1], set: value => [change(0, [e[0] - value, e[1] - value]), sized(value)] }],
						to: to => fromFar(to[0], to[1]),
					},
					{ kind: 'point', name: 'bottom right', code: squarePlace(1, 1), angle: 45, at: e, to: to => [sized(Math.max(to[0] - s[0], to[1] - s[1]))] },
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
			return pointsGrip(args as Vec[], [], {
				points: [{ at: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2], name: 'middle' }],
				lines: [{ from: start, to: end, name: 'line' }],
			})
		},
	],
	[makePolyline, args => pointsGrip(args as Vec[], [], { lines: linesThrough(args as Vec[], false) })],
	[makePolygon, args => pointsGrip(args as Vec[], [], { lines: linesThrough(args as Vec[], true) })],
	[
		makeCubic,
		args => {
			const [start, control1, control2, end] = args as Vec[]
			// A place where it goes through, before what only pulls it, wherever they coincide.
			return pointsGrip(
				args as Vec[],
				[line(start!, control1!), line(end!, control2!)],
				undefined,
				[1, 2, 0, 3]
			)
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
				marks: [
					...pointMarks([0], [c[0], c[1] - r]),
					{ route: [1], at: [c[0] + r, c[1]], side: 'right' },
					{ route: [2], at: add(c, toward(360 / count, ring)), side: 'right' },
				],
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
					{ kind: 'translate', name: 'center', place: 0, at: c, to: to => [change(0, to)] },
				],
				guides: [arc(c, ring, 3.6, 120)],
				snaps: (() => {
					const vertices = Array.from({ length: count }, (_, i) =>
						add(c, toward((360 / count) * i, r))
					)
					return {
						points: vertices.map(at => ({ at, name: 'vertex' })),
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
			const angleFor = (angle: number, to: Vec): number =>
				angle + shortest(degrees(sub(to, c)) - angle)
			return {
				marks: [
					...pointMarks([0], c),
					{ route: [1], at: add(c, toward(middle, r)), side: 'right' },
					{ route: [2], at: add(c, toward(from, r)), side: 'right' },
					{ route: [3], at: add(c, toward(until, r)), side: 'right' },
				],
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
					{ kind: 'translate', name: 'center', place: 0, at: c, to: to => [change(0, to)] },
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
	inner: (arg: number) => Grip | null,
	proportional: (arg: number) => boolean = () => false
): Grip | null => makers.get(fn)?.(args, inner, proportional) ?? null

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

const BINDINGS: Readonly<Record<string, unknown>> = {
	path: pathType,
	color: colorType,
	style: makeStyled,
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
