import {mat2d, vec2} from 'linearly'

import {Expr, GlispError, isKeyword, isVector, keywordFor as K} from '@/glisp'

const K_PATH = K('path')

export type Vec2 = number[] | vec2

export type PathType = (string | Vec2)[]
export type SegmentType = [string, ...Vec2[]]

export function isPath(exp: any): exp is PathType {
	return isVector(exp) && exp[0] === K_PATH
}

export function* iterateSegment(path: PathType): Generator<SegmentType> {
	if (!Array.isArray(path)) {
		throw new GlispError('Invalid path')
	}

	let start = path[0].toString().startsWith(K_PATH) ? 1 : 0

	for (let i = start + 1, l = path.length; i <= l; i++) {
		if (i === l || isKeyword(path[i] as Expr)) {
			yield path.slice(start, i) as SegmentType
			start = i
		}
	}
}

export function getSVGPathDataRecursive(exp: Expr): string {
	return convertPath(exp)

	function convertPath(exp: Expr, transform?: mat2d): string {
		if (!isVector(exp)) {
			return ''
		}

		switch (exp[0]) {
			case K('path'):
				return getSVGPathData(transformPath(exp as PathType, transform))
			case K('style'): {
				return exp
					.slice(2)
					.map(e => convertPath(e, transform))
					.join(' ')
			}
			case K('transform'): {
				const newTransform = mat2d.mul(
					transform ?? mat2d.identity,
					exp[1] as mat2d.Mutable
				)
				return exp
					.slice(2)
					.map(e => convertPath(e, newTransform))
					.join(' ')
			}
		}

		return ''
	}

	function transformPath(path: PathType, transform?: mat2d): PathType {
		if (!transform) {
			return path
		} else {
			return path.map(p =>
				isVector(p as Expr) ? vec2.transformMat2d(p as vec2, transform) : p
			)
		}
	}
}

export function getSVGPathData(path: PathType) {
	if (path[0].toString().startsWith(K_PATH)) {
		path = path.slice(1)
	}

	return path.map(x => (isKeyword(x as Expr) ? x.slice(1) : x)).join(' ')
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
