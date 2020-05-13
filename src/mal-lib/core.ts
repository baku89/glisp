import seedrandom from 'seedrandom'
import {
	MalVal,
	markMalVector,
	symbolFor as S,
	MalMap,
	cloneExp,
	assocBang,
	isMap,
	isString,
	isSymbol,
	isKeyword,
	keywordFor,
	LispError,
	M_ISMACRO,
	MalFunc,
	createMalVector,
	isVector,
	isList,
	MalAtom,
	M_META,
	isMalNode
} from '@/mal/types'
import printExp from '@/mal/printer'
import {partition} from '@/utils'

function withMeta(a: MalVal, m: any) {
	if (m === undefined) {
		throw new LispError('[with-meta] Need the metadata to attach')
	}
	if (!isMalNode(a)) {
		throw new LispError('[with-meta] Object should not be atom')
	}
	const c = cloneExp(a)
	;(c as any)[M_META] = m
	return c
}

const Exports = [
	['nil?', (x: MalVal) => x === null],
	['true?', (x: MalVal) => x === true],
	['false?', (x: MalVal) => x === false],
	['boolean?', (x: MalVal) => typeof x === 'boolean'],
	['number?', (x: MalVal) => typeof x === 'number'],
	['string?', isString],
	[
		'symbol',
		(x: MalVal) => {
			if (typeof x !== 'string') {
				throw new LispError(`Cannot create a symbol from ${printExp(x)}`)
			} else {
				return S(x)
			}
		}
	],
	['symbol?', isSymbol],
	['keyword?', isKeyword],
	['keyword', keywordFor],
	['fn?', (x: MalVal) => typeof x === 'function' && !(x as MalFunc)[M_ISMACRO]],
	[
		'macro?',
		(x: MalVal) => typeof x === 'function' && !!(x as MalFunc)[M_ISMACRO]
	],

	// // Compare
	['=', (a: MalVal, b: MalVal) => a === b],
	['not=', (a: MalVal, b: MalVal) => a !== b],
	['<', (a: number, b: number) => a < b],
	['<=', (a: number, b: number) => a <= b],
	['>', (a: number, b: number) => a > b],
	['>=', (a: number, b: number) => a >= b],

	// Calculus
	['+', (...a: number[]) => a.reduce((x, y) => x + y, 0)],
	[
		'-',
		(x: number, ...ys: number[]) =>
			ys.length ? ys.reduce((a, b) => a - b, x) : -x
	],
	['*', (...args: number[]) => args.reduce((a, b) => a * b, 1)],
	[
		'/',
		(x: number, ...ys: number[]) =>
			ys.length ? ys.reduce((a, b) => a / b, x) : 1 / x
	],
	['mod', (x: number, y: number) => ((x % y) + y) % y],

	// Array
	['list', (...xs: MalVal[]) => xs],
	['list?', isList],

	['vector', (...xs: MalVal[]) => createMalVector(xs)],
	['vector?', isVector],
	['vec', (a: MalVal[]) => createMalVector(a)],
	['vec32', (a: MalVal[]) => new Float32Array(a as number[])],
	[
		'buffer?',
		(a: MalVal) =>
			a instanceof Object && (a as any).buffer instanceof ArrayBuffer
	],
	['sequential?', Array.isArray],
	[
		'seq',
		(a: MalVal) => {
			if (Array.isArray(a)) {
				return [...a]
			} else if (isString(a) && a.length > 0) {
				return a.split('')
			} else if (isMap(a)) {
				return Object.entries(a).map(entry => createMalVector(entry))
			} else {
				return null
			}
		}
	],
	[
		'nth',
		(a: MalVal[], i: number) => {
			if (typeof i !== 'number') {
				throw new LispError('[nth] Index should be specified by number')
			} else if (i < 0) {
				if (-i <= a.length) {
					return a[a.length - i]
				} else {
					throw new LispError('[nth] index out of range')
				}
			} else {
				if (i < a.length) {
					return a[i]
				} else {
					throw new LispError('[nth] index out of range')
				}
			}
		}
	],
	['first', (a: MalVal[]) => (a !== null && a.length > 0 ? a[0] : null)],
	['rest', (a: MalVal[]) => (a === null ? [] : a.slice(1))],
	[
		'last',
		(a: MalVal[]) => (a !== null && a.length > 0 ? a[a.length - 1] : null)
	],
	['butlast', (a: MalVal[]) => (a === null ? [] : a.slice(0, a.length - 1))],
	['count', (a: MalVal[]) => (a === null ? 0 : a.length)],
	[
		'slice',
		(a: MalVal[], start: number, end: number) => {
			if (Array.isArray(a)) {
				return a.slice(start, end)
			} else {
				throw new LispError(`[slice] ${printExp(a)} is not an array`)
			}
		}
	],
	[
		'apply',
		(f: MalFunc, ...a: MalVal[]) => f(...a.slice(0, -1).concat(a[a.length - 1]))
	],
	['map', (f: MalFunc, a: MalVal[]) => markMalVector(a.map(x => f(x)))],
	[
		'map-indexed',
		(f: MalFunc, a: MalVal[]) => markMalVector(a.map((x, i) => f(i, x)))
	],
	['filter', (f: MalFunc, a: MalVal[]) => a.filter(x => f(x))],
	['remove', (f: MalFunc, a: MalVal[]) => a.filter(x => !f(x))],
	['partition', partition],
	['index-of', (a: MalVal, coll: MalVal[]) => coll.indexOf(a)],
	['last-index-of', (a: MalVal, coll: MalVal[]) => coll.lastIndexOf(a)],
	['repeat', (a: MalVal, n: number) => Array(n).fill(a)],
	['reverse', (coll: MalVal[]) => coll.reverse()],
	['cons', (a: MalVal, b: MalVal) => [a].concat(b)],
	[
		'conj',
		(lst: MalVal, ...args: MalVal[]) => {
			if (isList(lst)) {
				const newList = [...lst]
				args.forEach(arg => newList.unshift(arg))
				return newList
			} else if (isVector(lst)) {
				return createMalVector([...lst, ...args])
			}
		}
	],
	['push', (a: MalVal[], ...b: MalVal[]) => [...a, ...b]],
	['concat', (...args: MalVal[]) => markMalVector([].concat(...(args as any)))],
	[
		'join',
		(separator: string, coll: MalVal[]) =>
			coll.map(v => printExp(v, false)).join(separator)
	],

	// Map
	['hash-map', (...a: MalVal[]) => assocBang({}, ...a)],
	['map?', isMap],
	[
		'assoc',
		(m: MalMap, ...a: MalVal[]) => assocBang(cloneExp(m) as MalMap, ...a)
	],
	[
		'dissoc',
		(m: MalMap, ...a: string[]) => {
			const n = cloneExp(m) as MalMap
			a.forEach(k => delete n[k])
			return n
		}
	],
	[
		'get',
		(m: MalMap, a: string, notfound: MalVal = null) => {
			if (isMap(m)) {
				return a in m ? m[a] : notfound
			} else {
				return notfound
			}
		}
	],
	[
		'contains?',
		(m: MalMap, a: MalVal) => (typeof a === 'string' ? a in m : false)
	],
	['keys', (a: MalMap) => Object.keys(a)],
	['vals', (a: MalMap) => Object.values(a)],
	[
		'entries',
		(a: MalMap) =>
			markMalVector(Object.entries(a).map(pair => markMalVector(pair)))
	],

	// String
	['pr-str', (...a: MalVal[]) => a.map(e => printExp(e, true)).join(' ')],
	['str', (...a: MalVal[]) => a.map(e => printExp(e, false)).join('')],
	['subs', (a: string, from: number, to?: number) => a.substr(from, to)],

	// Meta
	['meta', (a: MalVal) => (a as any)[M_META] || null],
	['with-meta', withMeta],
	['with-meta-sugar', (m: any, a: MalVal) => withMeta(a, m)],
	[
		// Atom
		'atom',
		(a: MalVal) => new MalAtom(a)
	],
	['atom?', (a: MalVal) => a instanceof MalAtom],
	['deref', (atm: MalAtom) => atm.val],
	['reset!', (atm: MalAtom, a: MalVal) => (atm.val = a)],
	[
		'swap!',
		(atm: MalAtom, fn: MalFunc, ...args: any) =>
			(atm.val = fn(...[atm.val].concat(args)))
	],

	// Other useful functions in JS
	['time-ms', Date.now],
	[
		'range',
		(...args: number[]) => {
			const ret = []
			let start = 0,
				end = 0,
				step = Math.sign(end - start)
			if (args.length === 1) {
				;[end] = args
			} else if (args.length === 2) {
				;[start, end] = args
			} else {
				;[start, end, step] = args
			}
			if (start !== end) {
				if ((end - start) * step <= 0) {
					step = Math.sign(end - start) * Math.abs(step) || 1
				}
				for (let i = start; step > 0 ? i < end : i > end; i += step) {
					ret.push(i)
				}
			}
			return markMalVector(ret)
		}
	],
	// Random
	['rnd', (a: MalVal) => seedrandom(a)()]
] as [string, MalVal][]

// Expose Math
Object.getOwnPropertyNames(Math).forEach(k =>
	Exports.push([k, (Math as any)[k]])
)

const Exp = [S('do'), ...Exports.map(([sym, body]) => [S('def'), S(sym), body])]
;(self as any)['glisp_library'] = Exp
