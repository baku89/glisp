import {vec2} from 'linearly'

import {
	Expr,
	ExprMap,
	ExprSeq,
	getEvaluated,
	isKeyword,
	isList,
	isVector,
	keywordFor as K,
} from '@/glisp'
import {convertToPath2D, PathType} from '@/path-utils'

const K_PATH = K('path'),
	K_TRANSFORM = K('transform'),
	K_STYLE = K('style'),
	K_FILL = K('fill'),
	K_STROKE = K('stroke'),
	K_STROKE_WIDTH = K('stroke-width')

export class HitDetector {
	private ctx: CanvasRenderingContext2D
	private cachedExp: Expr = null
	private cachedPath2D = new WeakMap<ExprSeq, Path2D>()

	constructor() {
		const canvas = document.createElement('canvas')
		this.ctx = canvas.getContext('2d')!
	}

	private getPath2D(exp: ExprSeq) {
		if (this.cachedPath2D.has(exp)) {
			return this.cachedPath2D.get(exp) as Path2D
		} else {
			const path = convertToPath2D(exp as PathType)
			this.cachedPath2D.set(exp, path)
			return path
		}
	}

	private analyzeVector(pos: vec2, exp: Expr[], hitStyle: ExprMap) {
		for (const child of exp.reverse()) {
			const ret = this.analyzeNode(pos, child, hitStyle)
			if (ret) {
				return ret
			}
		}
		return null
	}

	private analyzeNode(pos: vec2, exp: Expr, hitStyle: ExprMap): null | Expr {
		const evaluated = getEvaluated(exp)
		if (isVector(evaluated)) {
			const command = evaluated[0]

			switch (command) {
				case K_PATH: {
					const path = this.getPath2D(evaluated)
					const hasFill = !!hitStyle[K_FILL]
					const hasStroke = !!hitStyle[K_STROKE]
					if (hasFill) {
						if (this.ctx.isPointInPath(path, pos[0], pos[1])) {
							return exp
						}
					}
					if (hasStroke || (!hasFill && !hasStroke)) {
						const width = Math.max((hitStyle[K_STROKE_WIDTH] as number) || 0, 4)
						this.ctx.lineWidth = width
						if (this.ctx.isPointInStroke(path, pos[0], pos[1])) {
							return exp
						}
					}
					break
				}
				case K_TRANSFORM: {
					const [, xform] = evaluated
					const [, , ...body] = exp as ExprSeq
					this.ctx.save()
					this.ctx.transform(
						...(xform as [number, number, number, number, number, number])
					)
					const ret = this.analyzeVector(pos, body, hitStyle)
					this.ctx.restore()
					return ret
				}
				case K_STYLE: {
					const [, styles] = evaluated
					const [, , ...body] = exp as ExprSeq
					let mergedStyles = {...hitStyle}
					for (const s of (isVector(styles) ? styles : [styles]) as ExprMap[]) {
						mergedStyles = {...mergedStyles, ...s}
					}
					const ret = this.analyzeVector(pos, body, mergedStyles)
					// if (ret && body.length === 1) {
					// 	return exp
					// } else {
					// 	return ret
					// }
					return ret
				}
				default:
					if (isKeyword(command)) {
						const body = (exp as ExprSeq).slice(1)
						return this.analyzeVector(pos, body, hitStyle)
					}
			}
		} else if (isList(exp)) {
			return this.analyzeVector(pos, exp.slice(1), hitStyle)
		}

		return null
	}

	public analyze(pos: vec2, exp: Expr = this.cachedExp) {
		this.cachedExp = exp
		this.ctx.resetTransform()
		return this.analyzeNode(pos, exp, {})
	}
}
