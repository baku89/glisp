import {MalVal, symbolFor as S, markMalVector as V} from '@/mal/types'
import hull from 'hull.js'
import Delaunator from 'delaunator'
import {partition} from '@/utils'

const Exports = [
	[
		'convex-hull',
		(pts: [number, number][], concavity: number | null = null) => {
			return V(hull(pts, concavity === null ? Infinity : concavity))
		}
	],
	[
		'delaunay',
		(pts: [number, number][]) => {
			const delaunay = Delaunator.from(pts)
			return V(
				partition(3, delaunay.triangles).map(([a, b, c]) => {
					return V([V([...pts[a]]), V([...pts[b]]), V([...pts[c]])])
				})
			)
		}
	]
] as [string, MalVal][]

const Exp = [S('do'), ...Exports.map(([sym, body]) => [S('def'), S(sym), body])]
;(globalThis as any)['glisp_library'] = Exp

export default Exp
