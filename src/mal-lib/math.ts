import {
	MalSymbol,
	MalVector,
	MalNumber,
	MalList,
	MalCallableValue,
} from '@/mal/types'
import hull from 'hull.js'
import BezierEasing from 'bezier-easing'
import Delaunator from 'delaunator'
import {partition} from '@/utils'
import {jsToMal} from '@/mal/reader'

const Exports = [
	[
		'convex-hull',
		(pts: MalVector, concavity: MalNumber = MalNumber.create(Infinity)) => {
			return MalVector.create(
				hull(
					(pts.toJS() as any) as [number, number][],
					concavity.value
				).map(([a, b]) =>
					MalVector.create([MalNumber.create(a), MalNumber.create(b)])
				)
			)
		},
	],
	[
		'delaunay',
		(pts: MalVector) => {
			const delaunay = Delaunator.from(
				(pts.toJS() as any) as [number, number][]
			)
			return jsToMal(partition(3, delaunay.triangles))
		},
	],
	[
		'cubic-bezier',
		(
			x1: MalNumber,
			y1: MalNumber,
			x2: MalNumber,
			y2: MalNumber,
			t: MalNumber
		) => {
			const easing = BezierEasing(x1.value, y1.value, x2.value, y2.value)
			return MalNumber.create(easing(Math.min(Math.max(0, t.value), 1)))
		},
	],
] as [string, MalCallableValue][]

const Exp = MalList.create([
	MalSymbol.create('do'),
	...Exports.map(([sym, body]) =>
		MalList.create([
			MalSymbol.create('def'),
			MalSymbol.create(sym),
			jsToMal(body),
		])
	),
])
;(globalThis as any)['glisp_library'] = Exp

export default Exp
