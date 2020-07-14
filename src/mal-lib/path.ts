/* eslint-ignore @typescript-eslint/no-use-before-define */
import {vec2, mat2d} from 'gl-matrix'
import Bezier from 'bezier-js'
import svgpath from 'svgpath'
import Voronoi from 'voronoi'
import paper from 'paper'
import {PaperOffset, OffsetOptions} from 'paperjs-offset'

import {
	MalVal,
	keywordFor as K,
	symbolFor as S,
	MalError,
	assocBang,
	isMap,
	createList as L
} from '@/mal/types'
import {partition, clamp} from '@/utils'
import printExp from '@/mal/printer'
import {PathType, SegmentType, iterateSegment, Vec2} from '@/path-utils'

const EPSILON = 1e-5

const K_PATH = K('path'),
	K_M = K('M'),
	K_L = K('L'),
	K_C = K('C'),
	K_Z = K('Z'),
	K_H = K('H'),
	K_V = K('V')

const SIN_Q = [0, 1, 0, -1]
const COS_Q = [1, 0, -1, 0]
const HALF_PI = Math.PI / 2
const KAPPA = (4 * (Math.sqrt(2) - 1)) / 3
const UNIT_QUAD_BEZIER = new Bezier([
	{x: 1, y: 0},
	{x: 1, y: KAPPA},
	{x: KAPPA, y: 1},
	{x: 0, y: 1}
])

const unsignedMod = (x: number, y: number) => ((x % y) + y) % y

function createEmptyPath() {
	return [K_PATH]
}

paper.setup(new paper.Size(1, 1))

const PaperPathCaches = new WeakMap<PathType, paper.Path>()

function createPaperPath(path: PathType): paper.Path {
	if (PaperPathCaches.has(path)) {
		return PaperPathCaches.get(path) as paper.Path
	}

	if (path[0].toString().startsWith(K_PATH)) {
		path = path.slice(1)
	}

	const paperPath = new paper.Path()

	for (let i = 0; i < path.length; i++) {
		switch (path[i]) {
			case K_M:
				paperPath.moveTo(new paper.Point(path[i + 1] as number[]))
				i++
				break
			case K_L:
				paperPath.lineTo(new paper.Point(path[i + 1] as number[]))
				i++
				break
			case K_C:
				paperPath.cubicCurveTo(
					new paper.Point(path[i + 1] as number[]),
					new paper.Point(path[i + 2] as number[]),
					new paper.Point(path[i + 3] as number[])
				)
				i += 3
				break
			case K_Z:
				paperPath.closePath()
				break
		}
	}

	PaperPathCaches.set(path, paperPath)
	return paperPath
}

function getMalPathFromPaper(_path: paper.Path | paper.PathItem): PathType {
	const d = _path ? _path.pathData : ''

	const path: PathType = createEmptyPath() as PathType

	svgpath(d)
		.abs()
		.unarc()
		.unshort()
		.iterate((seg, _, x, y) => {
			let cmd = K(seg[0])
			const pts = partition(2, seg.slice(1)) as number[][]

			switch (cmd) {
				case K_H:
					pts[0] = [pts[0][0], y]
					cmd = K_L
					break
				case K_V:
					pts[0] = [x, pts[0][0]]
					cmd = K_L
					break
			}

			path.push(cmd, ...pts)
		})

	return path
}

function getBezier(points: Vec2[]) {
	const coords = points.map(([x, y]) => ({x, y}))
	if (coords.length !== 4) {
		throw new MalError('Invalid point count for cubic bezier')
	}
	return new Bezier(coords)
}

/**
 *  Yields a segment with its complete points.
 *  Thus each object can be like,
 * [L prev-pos p]
 * [C prev-pos p1 p2 p3]
 * [Z prev-pos first-pos]
 */
export function* iterateCurve(path: PathType): Generator<SegmentType> {
	const first = vec2.create(),
		prev = vec2.create()

	for (const [cmd, ...points] of iterateSegment(path)) {
		switch (cmd) {
			case K_M:
				yield [K_M, ...points]
				vec2.copy(first, points[0] as vec2)
				vec2.copy(prev, first)
				break
			case K_L:
			case K_C:
				yield [cmd, prev, ...points] as SegmentType
				vec2.copy(prev, points[points.length - 1] as vec2)
				break
			case K_Z:
				yield [K_Z, prev, first] as SegmentType
				break
		}
	}
}

function closedQ(path: PathType) {
	return path.slice(-1)[0] === K_Z
}

function toBeziers(path: PathType) {
	const ret: PathType = [K_PATH]

	for (const line of iterateSegment(path)) {
		const [cmd, ...args] = line

		let s: Vec2 = [NaN, NaN]

		switch (cmd) {
			case K_M:
			case K_C:
				s = args[0]
				ret.push(...line)
				break
			case K_Z:
				ret.push(...line)
				break
			case K_L:
				ret.push(K_L, s, ...args, ...args)
				break
			default:
				throw new Error(`Invalid d-path command: ${printExp(cmd)}`)
		}
	}
	return ret
}

function pathLength(_path: PathType) {
	const path = createPaperPath(_path)
	getMalPathFromPaper(path)
	return path.length
}

function makeOpen(path: PathType) {
	if (closedQ(path)) {
		path = path.slice(0, path.length - 1)
		const first = (path[0].toString().startsWith(K_PATH)
			? path[2]
			: path[1]) as vec2
		const last = path[path.length - 1] as vec2

		// Add L command to connect to first points if the last Z has certain length
		if (vec2.dist(first, last) > EPSILON) {
			path.push(K_L, first)
		}
	}

	return path
}

function pathJoin(first: PathType, ...rest: PathType[]) {
	const ret = makeOpen(first)

	const lastEnd = vec2.fromValues(...(ret[ret.length - 1] as [number, number]))
	const start = vec2.create()

	for (const path of rest) {
		let opened = makeOpen(path).slice(1) // remove K_PATH
		vec2.copy(start, opened[1] as vec2) // retrieve M x y

		if (vec2.dist(lastEnd, start) < EPSILON) {
			opened = opened.slice(3) // Remove M if both ends are ident
		} else {
			opened[0] = K_L
		}

		ret.push(...opened)
		vec2.copy(lastEnd, opened[opened.length - 1] as vec2)
	}

	return ret
}

function pathTransform(transform: mat2d, path: PathType) {
	const ret = path.map(pt => {
		if (typeof pt === 'string') {
			return pt
		} else {
			return vec2.transformMat2d(vec2.create(), pt as vec2, transform)
		}
	})

	return ret
}

// Get Path Property
type NormalizedFunctionType = (
	t: number,
	path: PathType,
	paperPath?: paper.Path
) => MalVal
function convertToNormalizedFunction(f: NormalizedFunctionType) {
	return (t: number, path: PathType) => {
		const paperPath = createPaperPath(path)
		return f(t * paperPath.length, path, paperPath)
	}
}

function getPropertyAtLength(
	offset: number,
	path: PathType,
	methodName: string,
	paperPath?: paper.Path
) {
	if (!paperPath) {
		paperPath = createPaperPath(path)
	}
	offset = clamp(offset, 0, paperPath.length)

	if (paperPath instanceof paper.CompoundPath) {
		for (const child of paperPath.children as paper.Path[]) {
			if (offset <= child.length) {
				// Might be buggy for a deep-nested compound path
				return (child as any)[methodName](offset)
			}
			offset -= child.length
		}
	} else {
		return (paperPath as any)[methodName](offset)
	}
}

function normalAtLength(
	offset: number,
	path: PathType,
	paperPath?: paper.Path
) {
	const ret = getPropertyAtLength(
		offset,
		path,
		'getNormalAt',
		paperPath
	) as paper.Point
	return [ret.x, ret.y]
}

function positionAtLength(
	offset: number,
	path: PathType,
	paperPath?: paper.Path
) {
	const {point} = getPropertyAtLength(
		offset,
		path,
		'getLocationAt',
		paperPath
	) as paper.CurveLocation
	return [point.x, point.y]
}

function tangentAtLength(
	offset: number,
	path: PathType,
	paperPath?: paper.Path
) {
	const ret = getPropertyAtLength(
		offset,
		path,
		'getTangentAt',
		paperPath
	) as paper.Point
	return [ret.x, ret.y]
}

function angleAtLength(offset: number, path: PathType, paperPath?: paper.Path) {
	const tangent = getPropertyAtLength(
		offset,
		path,
		'getTangentAt',
		paperPath
	) as paper.Point
	return tangent.angleInRadians
}

function aligningMatrixAtLength(
	offset: number,
	path: PathType,
	paperPath?: paper.Path
) {
	if (!paperPath) {
		paperPath = createPaperPath(path)
	}
	offset = clamp(offset, 0, paperPath.length)

	const tangent = paperPath.getTangentAt(offset)
	const {point} = paperPath.getLocationAt(offset)

	const mat = mat2d.fromTranslation(mat2d.create(), [point.x, point.y])

	mat2d.rotate(mat, mat, tangent.angleInRadians)

	return [...mat]
}

// Iteration
function pathFlatten(flatness: number, path: PathType) {
	const paperPath = createPaperPath(path)
	paperPath.flatten(flatness)
	return getMalPathFromPaper(paperPath)
}

// Binary Operation
function createPolynominalBooleanOperator(methodName: string) {
	return (...paths: PathType[]) => {
		if (paths.length === 0) {
			return createEmptyPath()
		} else if (paths.length === 1) {
			return paths[0]
		}

		const paperPaths = paths.map(createPaperPath) as paper.PathItem[]
		const result = paperPaths
			.slice(1)
			.reduce((a, b) => (a as any)[methodName](b), paperPaths[0])

		return getMalPathFromPaper(result)
	}
}

// Shape Functions

function pathArc(
	[x, y]: vec2,
	r: number,
	start: number,
	end: number
): MalVal[] {
	const min = Math.min(start, end)
	const max = Math.max(start, end)

	let points: number[][] = [[x + r * Math.cos(min), y + r * Math.sin(min)]]

	const minSeg = Math.ceil(min / HALF_PI - EPSILON)
	const maxSeg = Math.floor(max / HALF_PI + EPSILON)

	// For trim
	const t1 = unsignedMod(min / HALF_PI, 1)
	const t2 = unsignedMod(max / HALF_PI, 1)

	// quadrant
	//  2 | 3
	// ---+---
	//  1 | 0
	if (minSeg > maxSeg) {
		// Less than 90 degree
		const bezier = UNIT_QUAD_BEZIER.split(t1, t2)
		const q = unsignedMod(Math.floor(min / HALF_PI), 4),
			sin = SIN_Q[q],
			cos = COS_Q[q]

		points.push(
			...bezier.points
				.slice(1)
				.map(p => [
					x + r * (p.x * cos - p.y * sin),
					y + r * (p.x * sin + p.y * cos)
				])
		)
	} else {
		// More than 90 degree

		// Add beginning segment
		if (Math.abs(minSeg * HALF_PI - min) > EPSILON) {
			const bezier = UNIT_QUAD_BEZIER.split(t1, 1)
			const q = unsignedMod(minSeg - 1, 4),
				sin = SIN_Q[q],
				cos = COS_Q[q]

			points.push(
				...bezier.points
					.slice(1)
					.map(p => [
						x + r * (p.x * cos - p.y * sin),
						y + r * (p.x * sin + p.y * cos)
					])
			)
		}

		// Cubic bezier points of the quarter circle in quadrant 0 in position [0, 0]
		const qpoints: number[][] = [
			[r, KAPPA * r],
			[KAPPA * r, r],
			[0, r]
		]

		// Add arc by every quadrant
		for (let seg = minSeg; seg < maxSeg; seg++) {
			const q = unsignedMod(seg, 4),
				sin = SIN_Q[q],
				cos = COS_Q[q]
			points.push(
				...qpoints.map(([px, py]) => [
					x + px * cos - py * sin,
					y + px * sin + py * cos
				])
			)
		}

		// Add terminal segment
		if (Math.abs(maxSeg * HALF_PI - max) > EPSILON) {
			const bezier = UNIT_QUAD_BEZIER.split(0, t2)
			const q = unsignedMod(maxSeg, 4),
				sin = SIN_Q[q],
				cos = COS_Q[q]

			points.push(
				...bezier.points
					.slice(1)
					.map(p => [
						x + r * (p.x * cos - p.y * sin),
						y + r * (p.x * sin + p.y * cos)
					])
			)
		}
	}

	if (end < start) {
		points = points.reverse()
	}

	return [
		K_PATH,
		K_M,
		points[0],
		...partition(3, points.slice(1))
			.map(pts => [K_C, ...pts])
			.flat()
	]
}

function createHashMap(args: MalVal[]) {
	for (let i = 0; i < args.length; i += 2) {
		args[i] = (args[i] as string).slice(1)
	}
	return assocBang({}, ...args)
}

function offset(d: number, path: PathType, ...args: MalVal[]) {
	const options = {
		join: 'round',
		cap: 'round',
		...createHashMap(args)
	} as OffsetOptions
	const paperPath = createPaperPath(path)
	const offsetPath = PaperOffset.offset(paperPath, d, options)
	return getMalPathFromPaper(offsetPath)
}

function offsetStroke(d: number, path: PathType, ...args: MalVal[]) {
	const options = {
		join: 'round',
		cap: 'round',
		...createHashMap(args)
	} as OffsetOptions
	const paperPath = createPaperPath(path)
	const offsetPath = PaperOffset.offsetStroke(paperPath, d, options)
	return getMalPathFromPaper(offsetPath)
}

/**
 * Trim path by relative length from each ends
 */
function trimByLength(
	start: number,
	end: number,
	malPath: PathType,
	path: null | paper.Path
) {
	// In case no change
	if (start < EPSILON && end < EPSILON) {
		return malPath
	}

	if (!path) {
		path = createPaperPath(malPath)
	}

	// Convert end parameter to a distance from the beginning of path
	const length = path.length
	end = length - end

	// Make positiove
	start = clamp(start, 0, length)
	end = clamp(end, 0, length)

	// Swap to make sure start < end
	if (start > end) {
		return createEmptyPath()
	}

	// Make Open
	if (path.closed) {
		path.splitAt(0)
	}

	const trimmed = path.splitAt(start)

	if (!trimmed) {
		return createEmptyPath()
	}

	trimmed.splitAt(end - start)

	if (!trimmed) {
		return createEmptyPath()
	}

	return getMalPathFromPaper(trimmed)
}

/**
 * Trim path by normalized T
 */
function pathTrim(t1: number, t2: number, malPath: PathType) {
	const path = createPaperPath(malPath)
	const length = path.length
	if (t1 > t2) {
		;[t1, t2] = [t2, t1]
	}
	const start = t1 * length,
		end = (1 - t2) * length
	return trimByLength(start, end, malPath, path)
}

const canvasCtx = (() => {
	const canvas = globalThis.document
		? document.createElement('canvas')
		: new OffscreenCanvas(10, 10)
	const ctx = canvas.getContext('2d')
	if (!ctx) {
		throw new Error('Cannot create canvas context')
	}
	return ctx
})()

/**
 * Calc path bounds
 */
function pathBounds(path: PathType) {
	// let top = -Infinity, left = -Infinity, right = Infinity, bottom = Infinity

	let left = Infinity,
		top = Infinity,
		right = -Infinity,
		bottom = -Infinity

	if (path[0].toString().startsWith(K_PATH)) {
		for (const [cmd, ...pts] of iterateCurve(path)) {
			switch (cmd) {
				case K_M: {
					const pt = pts[0]
					left = Math.min(left, pt[0])
					top = Math.min(top, pt[1])
					right = Math.max(right, pt[0])
					bottom = Math.max(bottom, pt[1])
					break
				}
				case K_L:
					left = Math.min(left, pts[0][0], pts[1][0])
					top = Math.min(top, pts[0][1], pts[1][1])
					right = Math.max(right, pts[0][0], pts[1][0])
					bottom = Math.max(bottom, pts[0][1], pts[1][1])
					break
				case K_C: {
					const {x, y} = getBezier(pts).bbox()
					left = Math.min(left, x.min)
					top = Math.min(top, y.min)
					right = Math.max(right, x.max)
					bottom = Math.max(bottom, y.max)
					break
				}
			}
		}
	} else {
		// text?

		// Text representation:
		// [:text "Text" [x y] {:option1 value1...}]
		const [text, [x, y], options] = path.slice(1) as [
			string,
			[number, number],
			...MalVal[]
		]
		const settings: any = {
			size: 12,
			font: 'Fira Code',
			align: 'center',
			baseline: 'middle'
		}

		if (isMap(options)) {
			for (const [k, v] of Object.entries(options)) {
				settings[(k as string).slice(1)] = v
			}
		}

		canvasCtx.font = `${settings.size}px ${settings.font}`
		canvasCtx.textAlign = settings.align as CanvasTextAlign
		canvasCtx.textBaseline = settings.baseline as CanvasTextBaseline
		const measure = canvasCtx.measureText(text as string)

		// Might be bug
		const yOffset = (24 / 1000) * settings.size

		left = x - measure.actualBoundingBoxLeft
		right = x + measure.actualBoundingBoxRight
		top = y - measure.actualBoundingBoxAscent + yOffset
		bottom = y + measure.actualBoundingBoxDescent + yOffset
	}

	if (isFinite(left + top + bottom + right)) {
		return [left, top, right - left, bottom - top]
	} else {
		return null
	}
}

function nearestOffset(pos: number[], malPath: PathType) {
	const path = createPaperPath(malPath)
	const location = path.getNearestLocation(new paper.Point(pos[0], pos[1]))

	return location.offset / path.length
}

function intersections(_a: PathType, _b: PathType) {
	const a = createPaperPath(_a),
		b = createPaperPath(_b)

	return a.getIntersections(b).map(cl => [cl.point.x, cl.point.y])
}

const voronoi = new Voronoi()
function pathVoronoi(
	mode: 'edge' | 'cell' = 'edge',
	[left, top, width, height]: number[],
	pts: number[][]
) {
	const bbox = {xl: left, xr: left + width, yt: top, yb: top + height}
	const sites = pts.map(([x, y]) => ({x, y}), pts)

	const diagram = voronoi.compute(sites, bbox)

	if (mode === 'edge') {
		return [
			K_PATH,
			...diagram.edges
				.map(({va, vb}) => [K_M, [va.x, va.y], K_L, [vb.x, vb.y]])
				.flat()
		]
	}

	return [K_PATH]
}

const Exports = [
	// Primitives
	['path/arc', pathArc],
	['path/voronoi', pathVoronoi],

	['path/join', pathJoin],
	['path/to-beziers', toBeziers],
	['path/offset', offset],
	['path/offset-stroke', offsetStroke],
	['path/length', pathLength],
	['path/closed?', closedQ],

	// Get Property
	['path/position-at-length', positionAtLength],
	['path/position-at', convertToNormalizedFunction(positionAtLength)],
	['path/normal-at-length', normalAtLength],
	['path/normal-at', convertToNormalizedFunction(normalAtLength)],
	['path/tangent-at-length', tangentAtLength],
	['path/tangent-at', convertToNormalizedFunction(tangentAtLength)],
	['path/angle-at-length', angleAtLength],
	['path/angle-at', convertToNormalizedFunction(angleAtLength)],
	['path/align-at-length', aligningMatrixAtLength],
	['path/align-at', convertToNormalizedFunction(aligningMatrixAtLength)],

	// Boolean
	['path/unite', createPolynominalBooleanOperator('unite')],
	['path/intersect', createPolynominalBooleanOperator('intersect')],
	['path/subtract', createPolynominalBooleanOperator('subtract')],
	['path/exclude', createPolynominalBooleanOperator('exclude')],
	['path/divide', createPolynominalBooleanOperator('divide')],

	// Manipulation
	['path/transform', pathTransform],
	['path/trim', pathTrim],
	['path/trim-by-length', trimByLength],
	['path/flatten', pathFlatten],

	// Utility
	[
		'path/split-segments',
		([, ...path]: PathType) => Array.from(iterateSegment(path) as any)
	],
	['path/bounds', pathBounds],
	['path/nearest-offset', nearestOffset],
	['path/intersections', intersections]
] as [string, MalVal][]

const Exp = L(
	S('do'),
	...Exports.map(([sym, body]) => L(S('def'), S(sym), body))
)
;(globalThis as any)['glisp_library'] = Exp
