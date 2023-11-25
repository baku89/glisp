import {vec2} from 'linearly'

import {Expr, ExprMap, ExprSeq, getEvaluated, isList, isVector} from '@/glisp'
import {convertToPath2D, PathType} from '@/path-utils'

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
				case 'path': {
					const path = this.getPath2D(evaluated)
					const hasFill = !!hitStyle['fill']
					const hasStroke = !!hitStyle['stroke']
					if (hasFill) {
						if (this.ctx.isPointInPath(path, pos[0], pos[1])) {
							return exp
						}
					}
					if (hasStroke || (!hasFill && !hasStroke)) {
						const width = Math.max((hitStyle['stroke-width'] as number) || 0, 4)
						this.ctx.lineWidth = width
						if (this.ctx.isPointInStroke(path, pos[0], pos[1])) {
							return exp
						}
					}
					break
				}
				case 'transform': {
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
				case 'style': {
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
				// if (isKeyword(command)) {
				// 	const body = (exp as ExprSeq).slice(1)
				// 	return this.analyzeVector(pos, body, hitStyle)
				// }
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
