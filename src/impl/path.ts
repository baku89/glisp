import {vec2} from 'gl-matrix'
import Bezier from 'bezier-js'
import {MalVal} from './types'
import {chunkByCount} from './core'

const S = Symbol.for

const SYM_PATH = S('path')
const SYM_M = S('M')
const SYM_L = S('L')
const SYM_C = S('C')
const SYM_Z = S('Z')

type PathType = (symbol | number)[]

export function* iteratePath(path: PathType): Generator<[symbol, ...number[]]> {
	let start = 0

	for (let i = 1, l = path.length; i <= l; i++) {
		if (i === l || typeof path[i] === 'symbol') {
			yield path.slice(start, i) as [symbol, ...number[]]
			start = i
		}
	}
}

function pathToBezier(path: PathType) {
	if (!Array.isArray(path) || path[0] !== SYM_PATH) {
		throw new Error('path-to-bezier: invalid path')
	} else {
		const ret: PathType = [SYM_PATH]
		const commands = path.slice(1)

		for (const line of iteratePath(commands)) {
			const [cmd, ...args] = line

			let sx = 0,
				sy = 0

			switch (cmd) {
				case SYM_M:
				case SYM_C:
					;[sx, sy] = args
					ret.push(...line)
					break
				case SYM_Z:
					ret.push(...line)
					break
				case SYM_L:
					ret.push(SYM_L, sx, sy, ...args, ...args)
					break
				default:
					throw new Error(
						`Invalid d-path command2: ${
							typeof cmd === 'symbol' ? Symbol.keyFor(cmd) : cmd
						}`
					)
			}
		}
		return ret
	}
}

const EPSILON = 1e-5

function offsetBezier(...args: number[]) {
	if (
		Math.abs(args[2] - args[0]) < EPSILON &&
		Math.abs(args[4] - args[0]) < EPSILON &&
		Math.abs(args[6] - args[0]) < EPSILON &&
		Math.abs(args[3] - args[1]) < EPSILON &&
		Math.abs(args[5] - args[1]) < EPSILON &&
		Math.abs(args[7] - args[1]) < EPSILON
	) {
		return false
	}

	const bezier = new Bezier([
		{x: args[0], y: args[1]},
		{x: args[2], y: args[3]},
		{x: args[4], y: args[5]},
		{x: args[6], y: args[7]}
	])

	const d = args[8]

	const offset = bezier.offset(d)

	const {x, y} = offset[0].points[0]

	const ret = [SYM_M, x, y]

	for (const seg of offset) {
		const pts = seg.points
		ret.push(SYM_C)
		for (let i = 1; i < 4; i++) {
			ret.push(pts[i].x, pts[i].y)
		}
	}

	return ret
}

const SIN_Q = [0, 1, 0, -1]
const COS_Q = [1, 0, -1, 0]
const HALF_PI = Math.PI / 2
const K = (4 * (Math.sqrt(2) - 1)) / 3
const UNIT_QUAD_BEZIER = new Bezier([
	{x: 1, y: 0},
	{x: 1, y: K},
	{x: K, y: 1},
	{x: 0, y: 1}
])

const unsignedMod = (x: number, y: number) => ((x % y) + y) % y

function arc(
	x: number,
	y: number,
	r: number,
	start: number,
	end: number
): MalVal[] {
	const min = Math.min(start, end)
	const max = Math.max(start, end)

	let points: [number, number][] = [
		[x + r * Math.cos(min), y + r * Math.sin(min)]
	]

	const minSeg = Math.ceil(min / HALF_PI)
	const maxSeg = Math.floor(max / HALF_PI)

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
					.map((p: {x: number; y: number}) => [
						x + r * (p.x * cos - p.y * sin),
						y + r * (p.x * sin + p.y * cos)
					])
			)
		}

		// Cubic bezier points of the quarter circle in quadrant 0 in position [0, 0]
		const qpoints: [number, number][] = [
			[r, K * r],
			[K * r, r],
			[0, r]
		]

		// Add arc by every quadrant
		for (let seg = minSeg; seg < maxSeg; seg++) {
			const q = unsignedMod(seg, 4),
				sin = SIN_Q[q],
				cos = COS_Q[q]
			points.push(
				...qpoints.map(([px, py]): [number, number] => [
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
					.map((p: {x: number; y: number}) => [
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
		S('path'),
		S('M'),
		...points[0],
		...chunkByCount(points.slice(1), 3)
			.map(pts => [S('C'), ...pts.flat()])
			.flat()
	]
}

function offsetLine(a: vec2, b: vec2, d: number) {
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

	return [SYM_M, ...oa, SYM_L, ...ob] as (symbol | number)[]
}

function offsetPath(d: number, path: PathType) {
	d *= -1

	if (!Array.isArray(path) || path[0] !== SYM_PATH) {
		throw new Error('Invalid path')
	} else {
		const ret: (symbol | number)[] = [SYM_PATH]
		const commands = path.slice(1)

		const last = vec2.create() // original last
		const first = vec2.create() // original first
		const loff = vec2.create() // last offset

		let continued = false

		let cmd, args
		for ([cmd, ...args] of iteratePath(commands)) {
			if (cmd === SYM_M) {
				vec2.copy(first, args as vec2)
				vec2.copy(last, first)
			} else if (cmd === SYM_L || cmd === SYM_C || cmd === SYM_Z) {
				if (cmd === SYM_Z) {
					args = first as number[]
				}

				let off =
					cmd === SYM_C
						? offsetBezier(...last, ...(args as number[]), d)
						: offsetLine(last, args as vec2, d)
				if (off) {
					if (continued) {
						off[0] = SYM_L
						if (vec2.equals(loff, off.slice(1) as vec2)) {
							off = off.slice(3)
						}
					}
					ret.push(...off)
					vec2.copy(last, args.slice(-2) as vec2)
					vec2.copy(loff, off.slice(-2) as vec2)
					continued = true
				}
			}

			if (cmd === SYM_Z) {
				ret.push(SYM_Z)
				continued = false
			}
		}
		return ret
	}
}

export const pathNS = new Map<string, any>([
	['path/to-bezier', pathToBezier],
	['path/offset', offsetPath],
	['arc', arc],
	[
		'path/split-commands',
		([_, ...path]: PathType) => Array.from(iteratePath(path))
	]
])
