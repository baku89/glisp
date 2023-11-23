import seedrandom from 'seedrandom'

import {
	assocBang,
	cloneExpr,
	createList as L,
	Expr,
	ExprAtom,
	ExprFn,
	ExprMap,
	getMeta,
	getType,
	GlispError,
	isKeyword,
	isList,
	isMap,
	isSeq,
	isString,
	isSymbol,
	isVector,
	keywordFor,
	printExpr,
	setMeta,
	symbolFor as S,
	withMeta,
} from '@/glisp'
import {partition} from '@/utils'

const Exports = [
	['type', x => keywordFor(getType(x) as string)],
	['null?', (x: Expr) => x === null],
	['true?', (x: Expr) => x === true],
	['false?', (x: Expr) => x === false],
	['boolean?', (x: Expr) => typeof x === 'boolean'],
	['number?', (x: Expr) => typeof x === 'number'],
	['string?', isString],
	['keyword?', isKeyword],
	['fn?', (x: Expr) => getType(x) === 'fn'],
	['macro?', (x: Expr) => getType(x) === 'macro'],

	['keyword', keywordFor],
	['symbol', S],
	['symbol?', isSymbol],

	// // Compare
	['=', (a: Expr, b: Expr) => a === b],
	['!=', (a: Expr, b: Expr) => a !== b],
	['<', (a: number, b: number) => a < b],
	['<=', (a: number, b: number) => a <= b],
	['>', (a: number, b: number) => a > b],
	['>=', (a: number, b: number) => a >= b],

	// Calculus
	['+', (...a: number[]) => a.reduce((x, y) => x + y, 0)],
	[
		'-',
		(...xs: number[]) => {
			switch (xs.length) {
				case 0:
					return 0
				case 1:
					return -xs[0]
				case 2:
					return xs[0] - xs[1]
				default:
					return xs.slice(1).reduce((a, b) => a - b, xs[0])
			}
		},
	],
	['*', (...args: number[]) => args.reduce((a, b) => a * b, 1)],
	[
		'/',
		(...xs: number[]) => {
			switch (xs.length) {
				case 0:
					return 1
				case 1:
					return 1 / xs[0]
				case 2:
					return xs[0] / xs[1]
				default:
					return xs.slice(1).reduce((a, b) => a / b, xs[0])
			}
		},
	],
	['mod', (x: number, y: number) => ((x % y) + y) % y],

	// Array
	['list', (...coll: Expr[]) => L(...coll)],
	['lst', (coll: Expr[]) => L(...coll)],
	['list?', isList],

	['vector', (...xs: Expr[]) => xs],
	['vector?', isVector],
	['vec', (a: Expr[]) => [...a]],
	['sequential?', isSeq],
	[
		'seq',
		(a: Expr) => {
			if (isSeq(a)) {
				return [...a]
			} else if (isString(a) && a.length > 0) {
				return a.split('')
			} else if (isMap(a)) {
				return Object.entries(a)
			} else {
				return null
			}
		},
	],
	[
		'nth',
		(a: Expr[], i: number) => {
			if (typeof i !== 'number') {
				throw new GlispError('[nth] Index should be specified by number')
			} else if (i < 0) {
				if (-i <= a.length) {
					return a[a.length - i]
				} else {
					throw new GlispError('[nth] index out of range')
				}
			} else {
				if (i < a.length) {
					return a[i]
				} else {
					throw new GlispError('[nth] index out of range')
				}
			}
		},
	],
	['first', (a: Expr[]) => (a !== null && a.length > 0 ? a[0] : null)],
	['rest', (a: Expr[]) => (a === null ? [] : a.slice(1))],
	[
		'last',
		(a: Expr[]) => (a !== null && a.length > 0 ? a[a.length - 1] : null),
	],
	['butlast', (a: Expr[]) => (a === null ? [] : a.slice(0, a.length - 1))],
	['count', (a: Expr[]) => (a === null ? 0 : a.length)],
	[
		'slice',
		(a: Expr[], start: number, end: number) => {
			if (isSeq(a)) {
				return a.slice(start, end)
			} else {
				throw new GlispError(`[slice] ${printExpr(a)} is not an array`)
			}
		},
	],
	[
		'apply',
		(f: ExprFn, ...a: Expr[]) => f(...a.slice(0, -1).concat(a[a.length - 1])),
	],
	['map', (f: ExprFn, a: Expr[]) => a.map(x => f(x))],
	['map-indexed', (f: ExprFn, a: Expr[]) => a.map((x, i) => f(i, x))],
	['filter', (f: ExprFn, a: Expr[]) => a.filter(x => f(x))],
	['remove', (f: ExprFn, a: Expr[]) => a.filter(x => !f(x))],
	['sort', (coll: Expr[]) => [...coll].sort()],
	['partition', partition],
	['index-of', (value: Expr[] | string, a: string) => value.indexOf(a)],
	[
		'last-index-of',
		(value: Expr[] | string, a: string) => value.lastIndexOf(a),
	],
	['repeat', (a: Expr, n: number) => Array(n).fill(a)],
	['reverse', (coll: Expr[]) => [...coll].reverse()],
	['cons', (a: Expr, b: Expr) => [a].concat(b)],
	[
		'conj',
		(lst: Expr, ...args: Expr[]) => {
			if (isList(lst)) {
				const newList = L(...lst)
				args.forEach(arg => newList.unshift(arg))
				return newList
			} else if (isVector(lst)) {
				return [...lst, ...args]
			}
		},
	],
	[
		'concat',
		(...args: Expr[]) => [].concat(...(args.filter(v => v !== null) as any[])),
	],
	[
		'join',
		(separator: string, coll: Expr[]) =>
			coll.map(v => printExpr(v)).join(separator),
	],

	// Map
	['hash-map', (...a: Expr[]) => assocBang({}, ...a)],
	['map?', isMap],
	['assoc', (m: ExprMap, ...a: Expr[]) => ({...m, ...assocBang({}, ...a)})],
	[
		'dissoc',
		(m: ExprMap, ...a: string[]) => {
			const n = cloneExpr(m) as ExprMap
			a.forEach(k => delete n[k])
			return n
		},
	],
	[
		'get',
		(m: ExprMap, a: string, notfound: Expr = null) => {
			if (isMap(m)) {
				return a in m ? m[a] : notfound
			} else {
				return notfound
			}
		},
	],
	[
		'contains?',
		(m: ExprMap, a: Expr) => (typeof a === 'string' ? a in m : false),
	],
	['keys', (a: ExprMap) => Object.keys(a)],
	['vals', (a: ExprMap) => Object.values(a)],
	['entries', (a: ExprMap) => Object.entries(a)],
	[
		'merge',
		(...xs: Expr[]) => {
			return xs.filter(isMap).reduce((ret, m) => Object.assign(ret, m), {})
		},
	],

	// String
	['pr-str', (...a: Expr[]) => a.map(e => printExpr(e)).join(' ')],
	['str', (...a: Expr[]) => a.map(e => printExpr(e)).join('')],
	['subs', (a: string, from: number, to?: number) => a.substr(from, to)],

	// Meta
	['meta', getMeta],
	// eslint-disable-next-line no-console
	['console.log', console.log],
	['with-meta', withMeta],
	['set-meta!', setMeta],
	['with-meta-sugar', (m: any, a: Expr) => withMeta(a, m)],
	[
		// Atom
		'atom',
		(a: Expr) => new ExprAtom(a),
	],
	['atom?', (a: Expr) => a instanceof ExprAtom],
	['deref', (atm: ExprAtom) => atm.value],
	['reset!', (atm: ExprAtom, a: Expr) => (atm.value = a)],
	[
		'swap!',
		(atm: ExprAtom, fn: ExprFn, ...args: any) =>
			(atm.value = fn(atm.value, ...args)),
	],

	// Other useful functions in JS
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
			return ret
		},
	],
	// Random
	['rnd', (a: Expr) => seedrandom(a)()],
] as [string, Expr][]

// Expose Math
Object.getOwnPropertyNames(Math).forEach(k =>
	Exports.push([k, (Math as any)[k]])
)

const Exp = L(
	S('do'),
	...Exports.map(([sym, body]) => L(S('def'), S(sym), body))
)
;(globalThis as any)['glisp_library'] = Exp

export default Exp
