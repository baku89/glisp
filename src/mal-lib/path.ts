/* eslint-ignore @typescript-eslint/no-use-before-define */
import {vec2, mat2d, mat2} from 'gl-matrix'
import Bezier from 'bezier-js'
import svgpath from 'svgpath'
import paper from 'paper'
import {
	MalVal,
	keywordFor as K,
	symbolFor as S,
	isKeyword,
	LispError,
	createMalVector,
	markMalVector
} from '@/mal/types'
import {partition, clamp} from '@/utils'
import printExp from '@/mal/printer'

type Vec2 = number[] | vec2

export type PathType = (string | Vec2)[]
type SegmentType = [string, ...Vec2[]]

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
// const TWO_PI = Math.PI * 2
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
	return markMalVector([K_PATH])
}

paper.setup(new paper.Size(1, 1))

export function getSVGPathData(path: PathType) {
	if (path[0] === K_PATH) {
		path = path.slice(1)
	}

	return path.map(x => (isKeyword(x as MalVal) ? x.slice(1) : x)).join(' ')
}

function getPaperPath(path: PathType): paper.Path {
	const d = getSVGPathData(path)

	return new paper.Path().importSVG(`<path d="${d}"/>`) as paper.Path
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
			const pts = partition(2, seg.slice(1)).map(markMalVector) as number[][]

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

function convertToMalPath(path: PathType): PathType {
	const ret = markMalVector(
		path.map(x => (x instanceof Float32Array ? [...x] : x))
	) as PathType
	return ret
}

function getBezier(points: Vec2[]) {
	const coords = points.map(([x, y]) => ({x, y}))
	if (coords.length !== 4) {
		throw new LispError('Invalid point count for cubic bezier')
	}
	return new Bezier(coords)
}
export function* iterateSegment(path: PathType): Generator<SegmentType> {
	if (!Array.isArray(path)) {
		throw new LispError('Invalid path')
	}

	let start = path[0] === K_PATH ? 1 : 0

	for (let i = start + 1, l = path.length; i <= l; i++) {
		if (i === l || isKeyword(path[i] as MalVal)) {
			yield createMalVector(path.slice(start, i)) as SegmentType
			start = i
		}
	}
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

/**
 * Returns:
 * A --- B----
 *        \  <- this angle
 *         \
 *          C
 * The returned value is signed and is positive angle if ABC is CW, else negative.
 */
function getTurnAngle(from: vec2, through: vec2, to: vec2): number {
	const AB = vec2.create()
	const BC = vec2.create()

	vec2.sub(AB, through, from)
	vec2.sub(BC, to, through)

	const angle = vec2.angle(AB, BC)

	// Rotate AB 90 degrees in CW
	vec2.rotate(AB, AB, [0, 0], HALF_PI)
	const rot = Math.sign(vec2.dot(AB, BC))

	return angle * rot
}

/**
 * Returns +1 if the path is clock-wise and -1 when CCW.
 * Returns 0 if the direction is indeterminate
 * like when the path is opened or 8-shaped.
 */
function getPathRotation(path: PathType): number {
	// Indeterminate case: the path is opened
	if (!closedQ(path)) {
		return 0
	}

	const segments = Array.from(iterateSegment(path))

	// Remove the last (Z)
	segments.pop()

	// Indeterminate case: the vertex of the path is < 3
	if (segments.length < 3) {
		return 0
	}

	// Extract only vertex points
	const points = segments.map(seg => seg[seg.length - 1]) as number[][]
	const numpt = points.length

	let rot = 0

	for (let i = 0; i < numpt; i++) {
		const last = points[(i - 1 + numpt) % numpt]
		const curt = points[i]
		const next = points[(i + 1) % numpt]

		rot += getTurnAngle(last as vec2, curt as vec2, next as vec2)
	}

	return Math.sign(Math.round(rot))
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
	const path = getPaperPath(_path)
	getMalPathFromPaper(path)
	return path.length
}

function makeOpen(path: PathType) {
	if (closedQ(path)) {
		path = path.slice(0, path.length - 1)
		const first = (path[0] === K_PATH ? path[2] : path[1]) as vec2
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
	const ret = markMalVector([K_PATH])

	for (const [cmd, ...pts] of iterateSegment(path.slice(1))) {
		ret.push(cmd)
		for (const pt of pts) {
			const newPt = markMalVector(Array(2))
			vec2.transformMat2d(newPt as vec2, pt as vec2, transform)
			ret.push(newPt)
		}
	}

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
		const paperPath = getPaperPath(path)
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
		paperPath = getPaperPath(path)
	}
	offset = clamp(offset, 0, paperPath.length)

	return (paperPath as any)[methodName](offset)
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
	return markMalVector([ret.x, ret.y])
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
	return markMalVector([point.x, point.y])
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
	return markMalVector([ret.x, ret.y])
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
		paperPath = getPaperPath(path)
	}
	offset = clamp(offset, 0, paperPath.length)

	const tangent = paperPath.getTangentAt(offset)
	const {point} = paperPath.getLocationAt(offset)

	const mat = mat2d.fromTranslation(mat2d.create(), [point.x, point.y])

	mat2d.rotate(mat, mat, tangent.angleInRadians)

	return markMalVector([...mat])
}

// Iteration
function pathFlatten(flatness: number, path: PathType) {
	const paperPath = getPaperPath(path)
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

		const paperPaths = paths.map(getPaperPath) as paper.PathItem[]
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

	points = points.map(pt => createMalVector(pt))

	return createMalVector([
		K_PATH,
		K_M,
		points[0],
		...partition(3, points.slice(1))
			.map(pts => [K_C, ...pts])
			.flat()
	])
}
function offsetSegmentBezier(d: number, ...points: Vec2[]): false | PathType {
	const bezier = getBezier(points)

	if (bezier.length() < EPSILON) {
		return false
	}

	const offset = bezier.offset(d)

	const {x, y} = offset[0].points[0]

	const ret = [K_M, [x, y]]

	for (const seg of offset) {
		const pts = seg.points
		ret.push(K_C)
		for (let i = 1; i < 4; i++) {
			ret.push([pts[i].x, pts[i].y])
		}
	}

	return ret
}

function offsetSegmentLine(d: number, a: vec2, b: vec2): false | PathType {
	if (vec2.equals(a, b)) {
		return false
	}

	const dir = vec2.create()

	vec2.sub(dir, b, a)
	vec2.rotate(dir, dir, [0, 0], Math.PI / 2)
	vec2.normalize(dir, dir)
	vec2.scale(dir, dir, d)

	const oa = vec2.create()
	const ob = vec2.create()

	vec2.add(oa, a, dir)
	vec2.add(ob, b, dir)

	return [K_M, oa, K_L, ob] as PathType
}

function offset(d: number, path: PathType) {
	const dirLast = vec2.create()
	const dirNext = vec2.create()

	const isClockwise = getPathRotation(path) === 1

	if (isClockwise) {
		d *= -1
	}

	const makeRoundCorner = (origin: vec2, last: vec2, next: vec2) => {
		// dont know why this order
		vec2.sub(dirLast, last, origin)
		vec2.sub(dirNext, next, origin)

		if (d < 0) {
			vec2.scale(dirLast, dirLast, -1)
			vec2.scale(dirNext, dirNext, -1)
		}

		const angle = vec2.angle(dirLast, dirNext)

		const start = Math.atan2(dirLast[1], dirLast[0])

		// Determine turned left or right
		vec2.rotate(dirLast, dirLast, [0, 0], HALF_PI)
		const turn = Math.sign(vec2.dot(dirLast, dirNext))

		const end = start + angle * turn

		return pathArc(origin, d, start, end).slice(1) as PathType
	}

	if (!Array.isArray(path) || path[0] !== K_PATH) {
		throw new Error('Invalid path')
	} else {
		const ret: PathType = [K_PATH]
		const commands = path.slice(1)

		//       loff   coff
		//----------|  /\
		//          | /  \
		//----------|/    \
		//      lorig\     \
		//            \     \

		const lorig = vec2.create() // original last
		const forig = vec2.create() // original first
		const loff = vec2.create() // last offset
		const coff = vec2.create() // current offset
		const foff = vec2.create() // first offset

		let continued = false

		let cmd, points
		for ([cmd, ...points] of iterateSegment(commands)) {
			if (cmd === K_M) {
				vec2.copy(forig, points[0] as vec2)
				vec2.copy(lorig, forig)
			} else if (cmd === K_L || cmd === K_C || cmd === K_Z) {
				if (cmd === K_Z) {
					points = forig as number[]
				}

				// off is like [:M [x y] :L [x y] ... ]
				let off =
					cmd === K_C
						? offsetSegmentBezier(d, lorig, ...(points as Vec2[]))
						: offsetSegmentLine(d, lorig, points as vec2)
				if (off) {
					vec2.copy(coff, off[1] as vec2)

					if (continued) {
						if (vec2.equals(loff, off[1] as vec2)) {
							off = off.slice(2) // remove [:M [x y]]
						} else {
							// make a bevel
							const corner = makeRoundCorner(lorig, loff, coff)
							// (M [x y] # ...) + (M [x y] # ...)
							off = [...corner.slice(2), ...off.slice(2)]
							// make a chamfer Bevel
							// off[0] = K_L
						}
					} else {
						// First time to offset
						continued = true
						vec2.copy(foff, off[1] as vec2)
					}
					ret.push(...off)
					vec2.copy(lorig, points[points.length - 1] as vec2)
					vec2.copy(loff, off[off.length - 1] as vec2)
				}
			}

			if (cmd === K_Z) {
				// Make a bevel corner
				const corner = makeRoundCorner(lorig, loff, foff)
				ret.push(...corner.slice(3), K_Z)
				// Chanfer
				// ret.push(K_Z)

				continued = false
			}
		}
		return convertToMalPath(ret)
	}
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
		path = getPaperPath(malPath)
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
	const path = getPaperPath(malPath)
	const length = path.length
	if (t1 > t2) {
		;[t1, t2] = [t2, t1]
	}
	const start = t1 * length,
		end = (1 - t2) * length
	return trimByLength(start, end, malPath, path)
}

/**
 * Calc path bounds
 */
function pathBounds(path: PathType) {
	// let top = -Infinity, left = -Infinity, right = Infinity, bottom = Infinity

	let left = Infinity,
		top = Infinity,
		right = -Infinity,
		bottom = -Infinity

	for (const [cmd, ...pts] of iterateCurve(path)) {
		switch (cmd) {
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

	if (isFinite(left + top + bottom + right)) {
		return [left, top, right - left, bottom - top]
	} else {
		return null
	}
}

function nearestOffset(pos: number[], malPath: PathType) {
	const path = getPaperPath(malPath)
	const location = path.getNearestLocation(new paper.Point(pos[0], pos[1]))

	return location.offset / path.length
}

const Exports = [
	['path/arc', pathArc],
	['path/join', pathJoin],
	['path/to-beziers', toBeziers],
	['path/offset', offset],
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
	['path/aligning-matrix-at-length', aligningMatrixAtLength],
	[
		'path/aligning-matrix-at',
		convertToNormalizedFunction(aligningMatrixAtLength)
	],

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
		([, ...path]: PathType) =>
			markMalVector(Array.from(iterateSegment(path) as any))
	],
	['path/bounds', pathBounds],
	['path/nearest-offset', nearestOffset]
] as [string, MalVal][]

const Exp = [S('do'), ...Exports.map(([sym, body]) => [S('def'), S(sym), body])]
;(self as any)['glisp_library'] = Exp
