import {vec2} from 'gl-matrix'
import {
	MalError,
	isKeyword,
	MalVal,
	keywordFor as K,
	isVector,
} from '@/mal/types'

const K_PATH = K('path')

export type Vec2 = number[] | vec2

export type PathType = (string | Vec2)[]
export type SegmentType = [string, ...Vec2[]]

export function isPath(exp: any): exp is PathType {
	return isVector(exp) && exp[0] === K_PATH
}

export function* iterateSegment(path: PathType): Generator<SegmentType> {
	if (!Array.isArray(path)) {
		throw new MalError('Invalid path')
	}

	let start = path[0].toString().startsWith(K_PATH) ? 1 : 0

	for (let i = start + 1, l = path.length; i <= l; i++) {
		if (i === l || isKeyword(path[i] as MalVal)) {
			yield path.slice(start, i) as SegmentType
			start = i
		}
	}
}

export function getSVGPathData(path: PathType) {
	if (path[0].toString().startsWith(K_PATH)) {
		path = path.slice(1)
	}

	return path.map(x => (isKeyword(x as MalVal) ? x.slice(1) : x)).join(' ')
}

const K_M = K('M'),
	K_L = K('L'),
	K_C = K('C'),
	K_Z = K('Z')

export function convertToPath2D(exp: PathType) {
	const path = new Path2D()

	for (const [cmd, ...pts] of iterateSegment(exp)) {
		switch (cmd) {
			case K_M:
				path.moveTo(...(pts[0] as [number, number]))
				break
			case K_L:
				path.lineTo(...(pts[0] as [number, number]))
				break
			case K_C:
				path.bezierCurveTo(
					pts[0][0],
					pts[0][1],
					pts[1][0],
					pts[1][1],
					pts[2][0],
					pts[2][1]
				)
				break
			case K_Z:
				path.closePath()
		}
	}

	return path
}
