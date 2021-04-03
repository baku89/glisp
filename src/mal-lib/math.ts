import BezierEasing from 'bezier-easing'
import Delaunator from 'delaunator'
import hull from 'hull.js'
import {chunk} from 'lodash'
import seedrandom from 'seedrandom'

import {readJS} from '@/mal/reader'
import {
	MalCallableValue,
	MalList,
	MalNumber,
	MalSymbol,
	MalVal,
	MalVector,
} from '@/mal/types'

const Exports = [
	// Random
	['rnd', (a: MalVal) => MalNumber.from(seedrandom(a.toObject())())],
	[
		'convex-hull',
		(pts: MalVector, concavity: MalNumber = MalNumber.from(Infinity)) => {
			return MalVector.from(
				hull(
					(pts.toObject() as any) as [number, number][],
					concavity.value
				).map(([a, b]) =>
					MalVector.from([MalNumber.from(a), MalNumber.from(b)])
				)
			)
		},
	],
	[
		'delaunay',
		(pts: MalVector) => {
			const delaunay = Delaunator.from(
				(pts.toObject() as any) as [number, number][]
			)
			return readJS(chunk(delaunay.triangles, 3))
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
			return MalNumber.from(easing(Math.min(Math.max(0, t.value), 1)))
		},
	],
] as [string, MalCallableValue | MalVal][]

// Expose Math
Object.getOwnPropertyNames(Math).forEach(k => {
	const fn = (Math as any)[k]
	const malVal =
		typeof fn === 'function'
			? (...args: MalVal[]) =>
					MalNumber.from(fn(...args.map(x => x.toObject())))
			: readJS(fn)
	Exports.push([k, malVal])
})

const Exp = MalList.from([
	MalSymbol.from('do'),
	...Exports.map(([sym, body]) =>
		MalList.from([MalSymbol.from('def'), MalSymbol.from(sym), readJS(body)])
	),
])
;(globalThis as any)['glisp_library'] = Exp

export default Exp
