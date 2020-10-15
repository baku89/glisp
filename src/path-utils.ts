import {vec2, mat2d} from 'gl-matrix'
import {MalKeyword, MalVector} from '@/mal/types'
import {readJS} from '@/mal/reader'

export function isPath(exp: any): exp is MalVector {
	return MalVector.is(exp) && MalKeyword.isFor(exp.value[0], 'path')
}

export function* iterateSegment(
	path: MalVector
): Generator<[string, ...vec2[]]> {
	let start = MalKeyword.isFor(path.get(0), 'path') ? 1 : 0

	const elements = path.value

	for (let i = start + 1, l = elements.length; i <= l; i++) {
		if (i === l || MalKeyword.is(elements[i])) {
			const seg = [
				elements[start].value,
				...elements.slice(start + 1, i).map(p => p.toFloats()),
			] as [string, ...vec2[]]
			yield seg
			start = i
		}
	}
}

// export function getSVGPathDataRecursive(exp: MalVal): string {
// 	return convertPath(exp, mat2d.create())

// 	function convertPath(exp: MalVal, transform?: mat2d): string {
// 		if (!MalVector.is(exp)) {
// 			return ''
// 		}

// 		switch (exp[0]) {
// 			case MalKeyword.from('path'):
// 				return getSVGPathData(transformPath(exp as PathType, transform))
// 			case MalKeyword.from('style'): {
// 				return exp
// 					.slice(2)
// 					.map(e => convertPath(e, transform))
// 					.join(' ')
// 			}
// 			case MalKeyword.from('transform'): {
// 				const newTransform = mat2d.mul(
// 					mat2d.create(),
// 					transform || mat2d.create(),
// 					exp[1] as mat2d
// 				)
// 				return exp
// 					.slice(2)
// 					.map(e => convertPath(e, newTransform))
// 					.join(' ')
// 			}
// 		}

// 		return ''
// 	}
// }

export function transformPath(path: MalVector, transform: MalVector) {
	const xform: mat2d = transform.toFloats()

	return !transform
		? path
		: MalVector.from(
				path.value.map(p =>
					MalVector.is(p)
						? readJS(vec2.transformMat2d(vec2.create(), p.toFloats(), xform))
						: p
				)
		  )
}

export function getSVGPathData(path: MalVector) {
	let elements = path.value
	if (MalKeyword.isFor(elements[0], 'elements')) {
		elements = elements.slice(1)
	}

	return elements
		.map(p => (MalKeyword.is(p) ? p.value : p.toFloats().join(' ')))
		.join(' ')
}

// const K_M = MalKeyword.from('M'),
// 	K_L = MalKeyword.from('L'),
// 	K_C = MalKeyword.from('C'),
// 	K_Z = MalKeyword.from('Z')

// export function convertToPath2D(exp: PathType) {
// 	const path = new Path2D()

// 	for (const [cmd, ...pts] of iterateSegment(exp)) {
// 		switch (cmd) {
// 			case K_M:
// 				path.moveTo(...(pts[0] as [number, number]))
// 				break
// 			case K_L:
// 				path.lineTo(...(pts[0] as [number, number]))
// 				break
// 			case K_C:
// 				path.bezierCurveTo(
// 					pts[0][0],
// 					pts[0][1],
// 					pts[1][0],
// 					pts[1][1],
// 					pts[2][0],
// 					pts[2][1]
// 				)
// 				break
// 			case K_Z:
// 				path.closePath()
// 		}
// 	}

// 	return path
// }
