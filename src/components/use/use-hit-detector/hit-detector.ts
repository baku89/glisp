import {vec2} from 'gl-matrix'
import {
	MalVal,
	getEvaluated,
	isVector,
	keywordFor as K,
	isList,
	MalSeq,
	isKeyword,
	MalMap
} from '@/mal/types'
import {PathType, convertToPath2D} from '@/path-utils'

const K_PATH = K('path'),
	K_TRANSFORM = K('transform'),
	K_STYLE = K('style'),
	K_FILL = K('fill'),
	K_STROKE = K('stroke'),
	K_STROKE_WIDTH = K('stroke-wdith')

interface HitStyle {
	fill: boolean
	stroke: false | number
}

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

	private analyzeNode(
		pos: vec2,
		exp: MalVal,
		hitStyle: MalMap
	): false | MalVal {
		const evaluated = getEvaluated(exp)
		if (isVector(evaluated)) {
			const command = evaluated[0]

			switch (command) {
				case K_PATH: {
					const path = convertToPath2D(evaluated as PathType)
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
					for (const child of body.reverse()) {
						const ret = this.analyzeNode(pos, child, hitStyle)
						if (ret) {
							return ret
						}
					}
					this.ctx.restore()
					break
				}
				case K_STYLE: {
					const [, styles] = evaluated
					const [, , ...body] = exp as MalSeq
					let mergedStyles = {...hitStyle}
					for (const s of (isVector(styles) ? styles : [styles]) as MalMap[]) {
						mergedStyles = {...mergedStyles, ...s}
					}
					for (const child of body.reverse()) {
						const ret = this.analyzeNode(pos, child, mergedStyles)
						if (ret) {
							return ret
						}
					}
					break
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
			for (const child of exp.slice(1).reverse()) {
				const ret = this.analyzeNode(pos, child, hitStyle)
				if (ret) {
					return ret
				}
			}
		}

		return false
	}

	public analyze(pos: vec2, exp: MalVal): false | MalVal {
		this.ctx.resetTransform()
		return this.analyzeNode(pos, exp, {})
	}
}
