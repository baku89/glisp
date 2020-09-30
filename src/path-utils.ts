import {vec2, mat2d} from 'gl-matrix'
import {MalError, MalKeyword, MalVal, MalVector} from '@/mal/types'

const K_PATH = MalKeyword.create('path')

export type Vec2 = number[] | vec2

export type PathType = (MalKeyword | MalVector)[]
export type SegmentType = [MalKeyword, ...MalVector[]]

export function isPath(exp: any): exp is PathType {
	return MalVector.is(exp) && exp[0] === K_PATH
}

export function* iterateSegment(path: PathType): Generator<SegmentType> {
	if (!Array.isArray(path)) {
		throw new MalError('Invalid path')
	}

	let start = path[0].toString().startsWith(K_PATH) ? 1 : 0

	for (let i = start + 1, l = path.length; i <= l; i++) {
		if (i === l || MalKeyword.is(path[i] as MalVal)) {
			yield path.slice(start, i) as SegmentType
			start = i
		}
	}
}

export function getSVGPathDataRecursive(exp: MalVal): string {
	return convertPath(exp, mat2d.create())

	function convertPath(exp: MalVal, transform?: mat2d): string {
		if (!MalVector.is(exp)) {
			return ''
		}

		switch (exp[0]) {
			case MalKeyword.create('path'):
				return getSVGPathData(transformPath(exp as PathType, transform))
			case MalKeyword.create('style'): {
				return exp
					.slice(2)
					.map(e => convertPath(e, transform))
					.join(' ')
			}
			case MalKeyword.create('transform'): {
				const newTransform = mat2d.mul(
					mat2d.create(),
					transform || mat2d.create(),
					exp[1] as mat2d
				)
				return exp
					.slice(2)
					.map(e => convertPath(e, newTransform))
					.join(' ')
			}
		}

		return ''
	}

	function transformPath(path: PathType, transform?: mat2d) {
		return !transform
			? path
			: (path.map(p =>
					MalVector.is(p as MalVal)
						? vec2.transformMat2d(vec2.create(), p as vec2, transform)
						: p
			  ) as PathType)
	}
}

export function getSVGPathData(path: PathType) {
	if (path[0].toString().startsWith(K_PATH)) {
		path = path.slice(1)
	}

	return path.map(x => (MalKeyword.is(x as MalVal) ? x.slice(1) : x)).join(' ')
}

const K_M = MalKeyword.create('M'),
	K_L = MalKeyword.create('L'),
	K_C = MalKeyword.create('C'),
	K_Z = MalKeyword.create('Z')

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
