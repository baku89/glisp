import {MalVal, symbolFor as S, markMalVector as V} from '@/mal/types'

import hull from 'hull.js'

const Exports = [
	['convex-hull', (pts: number[]) => V(hull(pts, Infinity))]
] as [string, MalVal][]

// Expose Math
Object.getOwnPropertyNames(Math).forEach(k =>
	Exports.push([k, (Math as any)[k]])
)

const Exp = [S('do'), ...Exports.map(([sym, body]) => [S('def'), S(sym), body])]
;(globalThis as any)['glisp_library'] = Exp

export default Exp
