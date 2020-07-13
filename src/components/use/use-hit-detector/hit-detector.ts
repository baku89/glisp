import {vec2} from 'gl-matrix'
import {
	MalVal,
	getEvaluated,
	isVector,
	keywordFor as K,
	isList
} from '@/mal/types'
import {iterateSegment, PathType} from '@/path-utils'

const K_PATH = K('path'),
	K_M = K('M'),
	K_L = K('L'),
	K_C = K('C'),
	K_Z = K('Z')

export class HitDetector {
	private ctx: OffscreenCanvasRenderingContext2D

	constructor() {
		const canvas = new OffscreenCanvas(1, 1)
		const ctx = canvas.getContext('2d')
		if (!ctx) {
			throw new Error('Cannot initialize OfscreenCanvasRenderingContext2D')
		}
		this.ctx = ctx
	}

	public analyze(pos: vec2, exp: MalVal): false | MalVal {
		const evaluated = getEvaluated(exp)
		if (isVector(evaluated) && evaluated[0] === K_PATH) {
			// Path
			const path = new Path2D()

			for (const [cmd, ...pts] of iterateSegment(evaluated as PathType)) {
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

			if (this.ctx.isPointInPath(path, pos[0], pos[1])) {
				return exp
			}
		} else if (isList(exp)) {
			for (const child of exp.slice(1).reverse()) {
				const ret = this.analyze(pos, child)
				if (ret) {
					return ret
				}
			}
		}

		return false
	}
}
