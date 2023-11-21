import BezierEasing from 'bezier-easing'
import Delaunator from 'delaunator'
import hull from 'hull.js'

import {createList as L, Expr, symbolFor as S} from '@/glisp'
import {partition} from '@/utils'

const Exports = [
	[
		'convex-hull',
		(pts: [number, number][], concavity: number | null = null) => {
			return hull(pts, concavity === null ? Infinity : concavity)
		},
	],
	[
		'delaunay',
		(pts: [number, number][]) => {
			const delaunay = Delaunator.from(pts)
			return partition(3, delaunay.triangles).map(([a, b, c]) => [
				[...pts[a]],
				[...pts[b]],
				[...pts[c]],
			])
		},
	],
	[
		'cubic-bezier',
		(x1: number, y1: number, x2: number, y2: number, t: number) => {
			const easing = BezierEasing(x1, y1, x2, y2)
			return easing(Math.min(Math.max(0, t), 1))
		},
	],
] as [string, Expr][]

const Exp = L(
	S('do'),
	...Exports.map(([sym, body]) => L(S('def'), S(sym), body))
)
;(globalThis as any)['glisp_library'] = Exp

export default Exp
