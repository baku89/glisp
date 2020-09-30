/* eslint-ignore @typescript-eslint/no-use-before-define */
import {vec2, mat2d} from 'gl-matrix'
import Bezier from 'bezier-js'
import svgpath from 'svgpath'
import Voronoi from 'voronoi'
import paper from 'paper'
import {PaperOffset, OffsetOptions} from 'paperjs-offset'

import {
	MalVal,
	MalKeyword,
	MalSymbol,
	MalError,
	assocBang,
	MalList,
} from '@/mal/types'
import {partition, clamp} from '@/utils'
import printExp from '@/mal/printer'
import {
	PathType,
	SegmentType,
	iterateSegment,
	Vec2,
	convertToPath2D,
	getSVGPathData,
} from '@/path-utils'

const EPSILON = 1e-5

const K_PATH = MalKeyword.create('path'),
	K_M = MalKeyword.create('M'),
	K_L = MalKeyword.create('L'),
	K_C = MalKeyword.create('C'),
	K_Z = MalKeyword.create('Z'),
	K_H = MalKeyword.create('H'),
	K_V = MalKeyword.create('V')

const SIN_Q = [0, 1, 0, -1]
const COS_Q = [1, 0, -1, 0]
const HALF_PI = Math.PI / 2
const KAPPA = (4 * (Math.sqrt(2) - 1)) / 3
const UNIT_QUAD_BEZIER = new Bezier([
	{x: 1, y: 0},
	{x: 1, y: KAPPA},
	{x: KAPPA, y: 1},
	{x: 0, y: 1},
])

const unsignedMod = (x: number, y: number) => ((x % y) + y) % y

function createEmptyPath(): PathType {
	return [K_PATH]
}

paper.setup(new paper.Size(1, 1))

const PaperPathCaches = new WeakMap<PathType, paper.CompoundPath>()

function createPaperPath(path: PathType): paper.CompoundPath {
	if (PaperPathCaches.has(path)) {
		return PaperPathCaches.get(path) as paper.CompoundPath
	}

	if (path[0].toString().startsWith(K_PATH)) {
		path = path.slice(1)
	}

	const svgpath = getSVGPathData(path)
	const paperPath = new paper.CompoundPath(svgpath)

	PaperPathCaches.set(path, paperPath)
	return paperPath
}

const canvasContext = (() => {
	const canvas = document.createElement('canvas')
	const ctx = canvas.getContext('2d')

	if (!ctx) {
		throw 'Cannot initialize a canvas context'
	}

	return ctx
})()

function getMalPathFromPaper(
	_path: paper.CompoundPath | paper.PathItem
): PathType {
	const d = _path ? _path.pathData : ''

	const path: PathType = createEmptyPath()

	svgpath(d)
		.abs()
		.unarc()
		.unshort()
		.iterate((seg, _, x, y) => {
			let cmd = MalKeyword.create(seg[0])
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

function getChildPaperPathByLength(path: paper.CompoundPath, offset: number) {
	offset = clamp(offset, 0, path.length)

	let totalLength = 0

	const childPath = (path.children as paper.Path[]).find(p => {
		if (offset - totalLength <= p.length) {
			return true
		} else {
			totalLength += p.length
			return false
		}
	})

	if (!childPath) {
		return undefined
	}

	return {
		offset: offset - totalLength,
		path: childPath,
	}
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
	let first, prev

	for (const [cmd, ...points] of iterateSegment(path)) {
		switch (cmd) {
			case K_M:
				yield [K_M, ...points]
				first = points[0]
				prev = points[0]
				break
			case K_L:
			case K_C:
				yield [cmd, prev, ...points] as SegmentType
				prev = points[points.length - 1]
				break
			case K_Z:
				yield [K_Z, prev, first] as SegmentType
				break
		}
	}
}

function dragAnchor(path: PathType, index: number, delta: vec2) {
	const segs = Array.from(iterateSegment(path))
	const draggingSeg = segs[index]

	let origAnchor: vec2

	if (draggingSeg[0] === K_C) {
		// Anchor itself
		origAnchor = vec2.clone(draggingSeg[3] as vec2)
		const anchor = vec2.add(vec2.create(), origAnchor, delta)
		draggingSeg[3] = anchor

		// In Handle
		const inHandle = vec2.clone(draggingSeg[2] as vec2)
		vec2.add(inHandle, inHandle, delta)
		draggingSeg[2] = inHandle
	} else {
		origAnchor = vec2.clone(draggingSeg[1] as vec2)
		const anchor = vec2.add(vec2.create(), origAnchor, delta)
		draggingSeg[1] = anchor
	}

	// Out handle
	let nextIndex = index + 1 < segs.length ? index + 1 : null

	if (nextIndex !== null && segs[nextIndex][0] === K_Z) {
		for (nextIndex = index - 1; nextIndex >= 0; nextIndex--) {
			if (segs[nextIndex][0] === K_M) {
				if (vec2.dist(origAnchor, segs[nextIndex][1] as vec2) < EPSILON) {
					// Start Anchor
					const startAnchor = vec2.clone(segs[nextIndex][1] as vec2)
					vec2.add(startAnchor, startAnchor, delta)
					segs[nextIndex][1] = startAnchor
					nextIndex++
				} else {
					nextIndex = null
				}
				break
			}
		}
	}
	if (nextIndex !== null) {
		if (segs[nextIndex][0] === K_C) {
			const outHandle = vec2.clone(segs[nextIndex][1] as vec2)
			vec2.add(outHandle, outHandle, delta)
			segs[nextIndex][1] = outHandle
		}
	}

	return [K_PATH, ...segs.flat()]
}

function dragHandle(
	path: PathType,
	index: number,
	type: string,
	delta: vec2
	// breakCorner = false
) {
	const segs = Array.from(iterateSegment(path))
	const draggingSeg = segs[index]

	if (type === MalKeyword.create('handle-in')) {
		const origInHandle = vec2.clone(draggingSeg[2] as vec2)
		const inHandle = vec2.add(vec2.create(), origInHandle, delta)
		draggingSeg[2] = inHandle

		// Out handle
		let nextIndex = index + 1 < segs.length ? index + 1 : null

		if (nextIndex !== null && segs[nextIndex][0] === K_Z) {
			for (nextIndex = index - 1; nextIndex >= 0; nextIndex--) {
				if (segs[nextIndex][0] === K_M) {
					if (
						vec2.dist(draggingSeg[3] as vec2, segs[nextIndex][1] as vec2) <
						EPSILON
					) {
						nextIndex++
					} else {
						nextIndex = null
					}
					break
				}
			}
		}

		if (nextIndex !== null && segs[nextIndex][0] === K_C) {
			const anchor = draggingSeg[3] as vec2
			const outHandle = vec2.clone(segs[nextIndex][1] as vec2)
			const outHandleDir = vec2.sub(vec2.create(), outHandle, anchor)

			const isSmooth =
				Math.abs(
					vec2.angle(
						vec2.sub(vec2.create(), anchor, origInHandle),
						outHandleDir
					)
				) < EPSILON

			if (isSmooth) {
				const dir = vec2.normalize(
					vec2.create(),
					vec2.sub(vec2.create(), anchor, inHandle)
				)
				const scale =
					vec2.dist(anchor, inHandle) / vec2.dist(anchor, origInHandle)
				const len = vec2.len(outHandleDir) * scale

				segs[nextIndex][1] = vec2.scaleAndAdd(vec2.create(), anchor, dir, len)
			}
		}
	} else if (type === MalKeyword.create('handle-out')) {
		const origOutHandle = vec2.clone(draggingSeg[1] as vec2)
		const outHandle = vec2.add(vec2.create(), origOutHandle, delta)
		draggingSeg[1] = outHandle

		// In handle
		let prevIndex = index - 1 >= 0 ? index - 1 : null

		if (prevIndex !== null && segs[prevIndex][0] === K_M) {
			const anchor = segs[prevIndex][1] as vec2

			for (prevIndex = index + 1; prevIndex < segs.length; prevIndex++) {
				if (segs[prevIndex][0] === K_Z) {
					if (
						!(
							segs[--prevIndex][0] === K_C &&
							vec2.dist(segs[prevIndex][3] as vec2, anchor) < EPSILON
						)
					) {
						prevIndex = null
					}
					break
				}
			}
		}

		if (prevIndex !== null && segs[prevIndex][0] === K_C) {
			const anchor = segs[prevIndex][3] as vec2
			const inHandle = vec2.clone(segs[prevIndex][2] as vec2)
			const inHandleDir = vec2.sub(vec2.create(), inHandle, anchor)

			const isSmooth =
				Math.abs(
					vec2.angle(
						vec2.sub(vec2.create(), anchor, origOutHandle),
						inHandleDir
					)
				) < EPSILON

			if (isSmooth) {
				const dir = vec2.normalize(
					vec2.create(),
					vec2.sub(vec2.create(), anchor, outHandle)
				)
				const scale =
					vec2.dist(anchor, outHandle) / vec2.dist(anchor, origOutHandle)
				const len = vec2.len(inHandleDir) * scale

				segs[prevIndex][2] = vec2.scaleAndAdd(vec2.create(), anchor, dir, len)
			}
		}
	}

	return [K_PATH, ...segs.flat()]
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

function pathJoin(...paths: PathType[]) {
	let mergedPath = paths
		.map(p => p.slice(1))
		.flat()
		.map((v, i) => (i > 0 && v === K_M ? K_L : v))
		.filter(v => v !== K_Z)

	// Delete zero-length :L command
	mergedPath = Array.from(iterateCurve(mergedPath))
		.filter(
			c => !(c[0] === K_L && vec2.dist(c[1] as vec2, c[2] as vec2) < EPSILON)
		)
		.map(c => (c[0] === K_M ? c : [c[0], ...c.slice(2)]))
		.flat()

	// close path if possible
	if (mergedPath.length >= 4) {
		const segs = Array.from(iterateSegment(mergedPath))
		const lastSeg = segs[segs.length - 1]
		const firstPt = segs[0][1] as vec2
		const lastPt = lastSeg[lastSeg.length - 1] as vec2

		if (vec2.dist(firstPt, lastPt) < EPSILON) {
			if (lastSeg[0] === K_L) {
				segs.splice(segs.length - 1, 1, [K_Z])
			} else if (lastSeg[0] === K_C) {
				segs.push([K_Z])
			}

			mergedPath = segs.flat()
		}
	}

	return [K_PATH, ...mergedPath]
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
type LengthBasedFunctionType = (t: number, path: PathType) => MalVal
function convertToNormalizedFunction(f: LengthBasedFunctionType) {
	return (t: number, path: PathType) => {
		const paperPath = createPaperPath(path)
		return f(t * paperPath.length, path)
	}
}

function getPropertyAtLength(
	offset: number,
	path: PathType,
	methodName: 'getTangentAt' | 'getLocationAt' | 'getNormalAt'
) {
	const paperPath = createPaperPath(path)

	const ret = getChildPaperPathByLength(paperPath, offset)

	if (!ret) {
		return undefined
	}

	const {offset: childOffset, path: childPath} = ret

	return childPath[methodName](childOffset)
}

function normalAtLength(offset: number, path: PathType) {
	const ret = getPropertyAtLength(offset, path, 'getNormalAt') as paper.Point
	return [ret.x, ret.y]
}

function positionAtLength(offset: number, path: PathType) {
	const {point} = getPropertyAtLength(
		offset,
		path,
		'getLocationAt'
	) as paper.CurveLocation
	return [point.x, point.y]
}

function tangentAtLength(offset: number, path: PathType) {
	const ret = getPropertyAtLength(offset, path, 'getTangentAt') as paper.Point
	return [ret.x, ret.y]
}

function angleAtLength(offset: number, path: PathType) {
	const tangent = getPropertyAtLength(
		offset,
		path,
		'getTangentAt'
	) as paper.Point
	return tangent.angleInRadians
}

function alignMatrixAtLength(offset: number, path: PathType): MalVal {
	const paperPath = createPaperPath(path)

	const ret = getChildPaperPathByLength(paperPath, offset)

	if (!ret) {
		return mat2d.create() as MalVal
	}

	const {offset: childOffset, path: childPath} = ret

	const tangent = childPath.getTangentAt(childOffset)
	const {point} = childPath.getLocationAt(childOffset)

	const mat = mat2d.fromTranslation(mat2d.create(), [point.x, point.y])

	mat2d.rotate(mat, mat, tangent.angleInRadians)

	return mat as MalVal
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
					y + r * (p.x * sin + p.y * cos),
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
						y + r * (p.x * sin + p.y * cos),
					])
			)
		}

		// Cubic bezier points of the quarter circle in quadrant 0 in position [0, 0]
		const qpoints: number[][] = [
			[r, KAPPA * r],
			[KAPPA * r, r],
			[0, r],
		]

		// Add arc by every quadrant
		for (let seg = minSeg; seg < maxSeg; seg++) {
			const q = unsignedMod(seg, 4),
				sin = SIN_Q[q],
				cos = COS_Q[q]
			points.push(
				...qpoints.map(([px, py]) => [
					x + px * cos - py * sin,
					y + px * sin + py * cos,
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
						y + r * (p.x * sin + p.y * cos),
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
			.flat(),
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
		...createHashMap(args),
	} as OffsetOptions
	const paperPath = createPaperPath(path)
	const offsetPath = PaperOffset.offset(paperPath, d, options)
	return getMalPathFromPaper(offsetPath)
}

function offsetStroke(d: number, path: PathType, ...args: MalVal[]) {
	const options = {
		join: 'round',
		cap: 'round',
		...createHashMap(args),
	} as OffsetOptions
	const paperPath = createPaperPath(path)
	const offsetPath = PaperOffset.offsetStroke(paperPath, d, options)
	return getMalPathFromPaper(offsetPath)
}

/**
 * Trim path by relative length from each ends
 */
function trimByLength(start: number, end: number, path: PathType) {
	// In case no change
	if (start < EPSILON && end < EPSILON) {
		return path
	}

	const paperPath = createPaperPath(path)

	// Convert end parameter to a distance from the beginning of path
	const length = paperPath.length
	end = length - end

	// Make positiove
	start = clamp(start, 0, length)
	end = clamp(end, 0, length)

	// Swap to make sure start < end
	if (start > end) {
		return createEmptyPath()
	}

	if (paperPath.children.length > 1) {
		return getMalPathFromPaper(paperPath)
	} else {
		const childPath = paperPath.children[0] as paper.Path
		const cloned = childPath.clone()

		const trimmed = cloned.splitAt(start)
		if (!trimmed) {
			return createEmptyPath()
		}
		trimmed.splitAt(end - start)
		if (!trimmed) {
			return createEmptyPath()
		}

		return getMalPathFromPaper(trimmed)
	}
}

/**
 * Trim path by normalized T
 */
function pathTrim(t1: number, t2: number, path: PathType) {
	const paperPath = createPaperPath(path)
	const length = paperPath.length
	if (t1 > t2) {
		;[t1, t2] = [t2, t1]
	}
	const start = t1 * length,
		end = (1 - t2) * length
	return trimByLength(start, end, path)
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
			baseline: 'middle',
		}

		if (MalMap.is(options)) {
			for (const [k, v] of Object.entries(options)) {
				settings[(k as string).slice(1)] = v
			}
		}

		canvasCtx.font = `${settings.size}px ${settings.font}`
		canvasCtx.textAlign = settings.align as CanvasTextAlign
		canvasCtx.textBaseline = settings.baseline as CanvasTextBaseline

		const lines = text.split('\n')

		for (let i = 0; i < lines.length; i++) {
			const measure = canvasCtx.measureText(lines[i])
			const yOffset = i * settings.size
			left = Math.min(left, x - measure.actualBoundingBoxLeft)
			right = Math.max(right, x + measure.actualBoundingBoxRight)
			top = Math.min(top, y + yOffset - measure.actualBoundingBoxAscent)
			bottom = Math.max(bottom, y + yOffset + measure.actualBoundingBoxDescent)
		}
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

function nearestPoint(pos: number[], malPath: PathType) {
	const path = createPaperPath(malPath)
	const point = path.getNearestLocation(new paper.Point(pos[0], pos[1])).point
	return [point.x, point.y]
}

function insideQ(pos: number[], malPath: PathType) {
	const path = convertToPath2D(malPath)
	return canvasContext.isPointInPath(path, pos[0], pos[1])
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
				.flat(),
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

	// Modify
	['path/drag-anchor', dragAnchor],
	['path/drag-handle', dragHandle],

	// Get Property
	['path/position-at-length', positionAtLength],
	['path/position-at', convertToNormalizedFunction(positionAtLength)],
	['path/normal-at-length', normalAtLength],
	['path/normal-at', convertToNormalizedFunction(normalAtLength)],
	['path/tangent-at-length', tangentAtLength],
	['path/tangent-at', convertToNormalizedFunction(tangentAtLength)],
	['path/angle-at-length', angleAtLength],
	['path/angle-at', convertToNormalizedFunction(angleAtLength)],
	['path/align-at-length', alignMatrixAtLength],
	['path/align-at', convertToNormalizedFunction(alignMatrixAtLength)],

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
		([, ...path]: PathType) => Array.from(iterateSegment(path) as any),
	],
	['path/bounds', pathBounds],
	['path/nearest-offset', nearestOffset],
	['path/nearest-point', nearestPoint],
	['path/inside?', insideQ],
	['path/intersections', intersections],
] as [string, MalVal][]

const Exp = L(
	MalSymbol.create('do'),
	...Exports.map(([sym, body]) =>
		L(MalSymbol.create('def'), MalSymbol.create(sym), body)
	)
)
;(globalThis as any)['glisp_library'] = Exp
