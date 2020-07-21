import {vec2} from 'gl-matrix'
import {
	MalVal,
	getEvaluated,
	isVector,
	keywordFor as K,
	isList,
	MalSeq,
	isKeyword,
	MalMap,
	isSymbol,
} from '@/mal/types'
import {PathType, convertToPath2D} from '@/path-utils'

const K_PATH = K('path'),
	K_TRANSFORM = K('transform'),
	K_STYLE = K('style'),
	K_FILL = K('fill'),
	K_STROKE = K('stroke'),
	K_STROKE_WIDTH = K('stroke-width')

interface HitStyle {
	fill: boolean
	stroke: false | number
}

export class HitDetector {
	private ctx: CanvasRenderingContext2D
	private cachedExp: MalVal = null
	private cachedPath2D = new WeakMap<MalSeq, Path2D>()

	constructor() {
		const canvas = document.createElement('canvas')
		const ctx = canvas.getContext('2d')
		if (!ctx) {
			throw new Error('Cannot initialize OfscreenCanvasRenderingContext2D')
		}
		this.ctx = ctx
	}

	private getPath2D(exp: MalSeq) {
		if (this.cachedPath2D.has(exp)) {
			return this.cachedPath2D.get(exp) as Path2D
		} else {
			const path = convertToPath2D(exp as PathType)
			this.cachedPath2D.set(exp, path)
			return path
		}
	}

	private analyzeVector(pos: vec2, exp: MalVal[], hitStyle: MalMap) {
		for (const child of exp.reverse()) {
			const ret = this.analyzeNode(pos, child, hitStyle)
			if (ret) {
				return ret
			}
		}
		return null
	}

	private analyzeNode(pos: vec2, exp: MalVal, hitStyle: MalMap): null | MalVal {
		if (isList(exp) && isSymbol(exp[0]) && exp[0].value === 'ui-annotate') {
			return this.analyzeNode(pos, exp[2], hitStyle)
		}

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
					const [, , ...body] = exp as MalSeq
					this.ctx.save()
					this.ctx.transform(
						...(xform as [number, number, number, number, number, number])
					)
					return this.analyzeVector(pos, body, hitStyle)
				}
				case K_STYLE: {
					const [, styles] = evaluated
					const [, , ...body] = exp as MalSeq
					let mergedStyles = {...hitStyle}
					for (const s of (isVector(styles) ? styles : [styles]) as MalMap[]) {
						mergedStyles = {...mergedStyles, ...s}
					}
					return this.analyzeVector(pos, body, mergedStyles)
				}
				default:
					if (isKeyword(command)) {
						const [, , ...body] = exp as MalSeq
						for (const child of body.reverse()) {
							const ret = this.analyzeNode(pos, child, hitStyle)
							if (ret) {
								return ret
							}
						}
					}
			}
		} else if (isList(exp)) {
			return this.analyzeVector(pos, exp.slice(1), hitStyle)
		}

		return null
	}

	public analyze(pos: vec2, exp: MalVal = this.cachedExp) {
		this.cachedExp = exp
		this.ctx.resetTransform()
		return this.analyzeNode(pos, exp, {})
	}
}
