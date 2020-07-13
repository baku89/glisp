import {vec2} from 'gl-matrix'
import {
	MalVal,
	getEvaluated,
	isVector,
	keywordFor as K,
	isList
} from '@/mal/types'
import {iterateSegment, PathType, convertToPath2D} from '@/path-utils'

const K_PATH = K('path')

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
			const path = convertToPath2D(evaluated as PathType)

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
