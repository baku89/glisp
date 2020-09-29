import {
	MalVal,
	symbolFor as S,
	createList as L,
	createVector,
	createNumber,
} from '@/mal/types'
import hull from 'hull.js'
import BezierEasing from 'bezier-easing'
import Delaunator from 'delaunator'
import {partition} from '@/utils'

const Exports = [
	[
		'convex-hull',
		(pts: [number, number][], concavity: number | null = null) => {
			return createVector(
				...hull(pts, concavity === null ? Infinity : concavity).map(([a, b]) =>
					createVector(a, b)
				)
			)
		},
	],
	[
		'delaunay',
		(pts: [number, number][]) => {
			const delaunay = Delaunator.from(pts)
			return createVector(
				...partition(3, delaunay.triangles).map(([a, b, c]) => [
					[...pts[a]],
					[...pts[b]],
					[...pts[c]],
				])
			)
		},
	],
	[
		'cubic-bezier',
		(x1: number, y1: number, x2: number, y2: number, t: number) => {
			const easing = BezierEasing(x1, y1, x2, y2)
			return createNumber(easing(Math.min(Math.max(0, t), 1)))
		},
	],
] as [string, MalVal][]

const Exp = L(
	S('do'),
	...Exports.map(([sym, body]) => L(S('def'), S(sym), body))
)
;(globalThis as any)['glisp_library'] = Exp

export default Exp
