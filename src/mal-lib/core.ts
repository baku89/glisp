import seedrandom from 'seedrandom'
import {
	MalVal,
	symbolFor as S,
	createList as L,
	MalMap,
	cloneExp,
	assocBang,
	isMap,
	isString,
	isSymbol,
	isKeyword,
	keywordFor,
	MalError,
	MalFunc,
	isVector,
	isList,
	MalAtom,
	getType,
	getMeta,
	withMeta,
	isSeq,
	setMeta,
	createVector,
	createBoolean,
	createNumber,
	createNil,
} from '@/mal/types'
import printExp from '@/mal/printer'
import {partition} from '@/utils'
import isNodeJS from 'is-node'

const Exports = [
	['type', x => keywordFor(getType(x) as string)],
	['nil?', (x: MalVal) => createBoolean(x === null)],
	['true?', (x: MalVal) => createBoolean(x === true)],
	['false?', (x: MalVal) => createBoolean(x === false)],
	['boolean?', (x: MalVal) => createBoolean(typeof x === 'boolean')],
	['number?', (x: MalVal) => createBoolean(typeof x === 'number')],
	['string?', (x: MalVal) => createBoolean(isString(x))],
	['keyword?', (x: MalVal) => createBoolean(isKeyword(x))],
	['fn?', (x: MalVal) => createBoolean(getType(x) === 'fn')],
	['macro?', (x: MalVal) => createBoolean(getType(x) === 'macro')],

	['keyword', keywordFor],
	['symbol', S],
	['symbol?', (x: MalVal) => createBoolean(isSymbol(x))],

	// // Compare
	['=', (a: MalVal, b: MalVal) => createBoolean(a === b)],
	['!=', (a: MalVal, b: MalVal) => createBoolean(a !== b)],
	['<', (a: number, b: number) => createBoolean(a < b)],
	['<=', (a: number, b: number) => createBoolean(a <= b)],
	['>', (a: number, b: number) => createBoolean(a > b)],
	['>=', (a: number, b: number) => createBoolean(a >= b)],

	// Calculus
	['+', (...a: number[]) => createNumber(a.reduce((x, y) => x + y, 0))],
	[
		'-',
		(...xs: number[]) => {
			switch (xs.length) {
				case 0:
					return createNumber(0)
				case 1:
					return createNumber(-xs[0])
				case 2:
					return createNumber(xs[0] - xs[1])
				default:
					return createNumber(xs.slice(1).reduce((a, b) => a - b, xs[0]))
			}
		},
	],
	['*', (...args: number[]) => createNumber(args.reduce((a, b) => a * b, 1))],
	[
		'/',
		(...xs: number[]) => {
			switch (xs.length) {
				case 0:
					return createNumber(1)
				case 1:
					return createNumber(1 / xs[0])
				case 2:
					return createNumber(xs[0] / xs[1])
				default:
					return createNumber(xs.slice(1).reduce((a, b) => a / b, xs[0]))
			}
		},
	],
	['mod', (x: number, y: number) => createNumber(((x % y) + y) % y)],

	// Array
	['list', (...coll: MalVal[]) => L(...coll)],
	['lst', (coll: MalVal[]) => L(...coll)],
	['list?', (x: MalVal) => createBoolean(isList(x))],

	['vector', (...xs: MalVal[]) => createVector(...xs)],
	['vector?', (x: MalVal) => createBoolean(isVector(x))],
	['vec', (a: MalVal[]) => createVector(...a)],
	['sequential?', (x: MalVal) => createBoolean(isSeq(x))],
	[
		'seq',
		(a: MalVal) => {
			if (isSeq(a)) {
				return createVector(...a)
			} else if (isString(a) && a.length > 0) {
				return createVector(...a.split(''))
			} else if (isMap(a)) {
				return createVector(...Object.entries(a).map(x => createVector(...x)))
			} else {
				return createNil()
			}
		},
	],
	[
		'nth',
		(a: MalVal[], i: number) => {
			if (typeof i !== 'number') {
				throw new MalError('[nth] Index should be specified by number')
			} else if (i < 0) {
				if (-i <= a.length) {
					return a[a.length - i]
				} else {
					throw new MalError('[nth] index out of range')
				}
			} else {
				if (i < a.length) {
					return a[i]
				} else {
					throw new MalError('[nth] index out of range')
				}
			}
		},
	],
	['first', (a: MalVal[]) => (a !== null && a.length > 0 ? a[0] : createNil())],
	[
		'rest',
		(a: MalVal[]) =>
			a === null ? createVector() : createVector(...a.slice(1)),
	],
	[
		'last',
		(a: MalVal[]) =>
			a !== null && a.length > 0 ? a[a.length - 1] : createNil(),
	],
	[
		'butlast',
		(a: MalVal[]) =>
			a === null ? [] : createVector(...a.slice(0, a.length - 1)),
	],
	['count', (a: MalVal[]) => createNumber(a === null ? 0 : a.length)],
	[
		'slice',
		(a: MalVal[], start: number, end: number) => {
			if (isSeq(a)) {
				return createVector(...a.slice(start, end))
			} else {
				throw new MalError(`[slice] ${printExp(a)} is not an array`)
			}
		},
	],
	[
		'apply',
		(f: MalFunc, ...a: MalVal[]) =>
			f(...a.slice(0, -1).concat(a[a.length - 1])),
	],
	['map', (f: MalFunc, a: MalVal[]) => createVector(...a.map(x => f(x)))],
	[
		'map-indexed',
		(f: MalFunc, a: MalVal[]) => createVector(...a.map((x, i) => f(i, x))),
	],
	['filter', (f: MalFunc, a: MalVal[]) => createVector(...a.filter(x => f(x)))],
	[
		'remove',
		(f: MalFunc, a: MalVal[]) => createVector(...a.filter(x => !f(x))),
	],
	['sort', (coll: MalVal[]) => createVector(...[...coll].sort())],
	['partition', partition],
	['index-of', (value: MalVal[] | string, a: string) => value.indexOf(a)],
	[
		'last-index-of',
		(value: MalVal[] | string, a: string) => value.lastIndexOf(a),
	],
	['repeat', (a: MalVal, n: number) => createVector(...Array(n).fill(a))],
	['reverse', (coll: MalVal[]) => [...coll].reverse()],
	['cons', (a: MalVal, b: MalVal) => [a].concat(b)],
	[
		'conj',
		(lst: MalVal, ...args: MalVal[]) => {
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
		(...args: MalVal[]) =>
			createVector(...[].concat(...(args.filter(v => v !== null) as any[]))),
	],
	[
		'join',
		(separator: string, coll: MalVal[]) =>
			coll.map(v => printExp(v, false)).join(separator),
	],

	// Map
	['hash-map', (...a: MalVal[]) => assocBang({}, ...a)],
	['map?', isMap],
	['assoc', (m: MalMap, ...a: MalVal[]) => ({...m, ...assocBang({}, ...a)})],
	[
		'dissoc',
		(m: MalMap, ...a: string[]) => {
			const n = cloneExp(m) as MalMap
			a.forEach(k => delete n[k])
			return n
		},
	],
	[
		'get',
		(m: MalMap, a: string, notfound: MalVal = null) => {
			if (isMap(m)) {
				return a in m ? m[a] : notfound
			} else {
				return notfound
			}
		},
	],
	[
		'contains?',
		(m: MalMap, a: MalVal) => (typeof a === 'string' ? a in m : false),
	],
	['keys', (a: MalMap) => createVector(...Object.keys(a))],
	['vals', (a: MalMap) => createVector(...Object.values(a))],
	['entries', (a: MalMap) => Object.entries(a)],
	[
		'merge',
		(...xs: MalVal[]) => {
			return xs.filter(isMap).reduce((ret, m) => Object.assign(ret, m), {})
		},
	],

	// String
	['pr-str', (...a: MalVal[]) => a.map(e => printExp(e, true)).join(' ')],
	['str', (...a: MalVal[]) => a.map(e => printExp(e, false)).join('')],
	['subs', (a: string, from: number, to?: number) => a.substr(from, to)],

	// Meta
	['meta', getMeta],
	['console.log', console.log],
	['with-meta', withMeta],
	['set-meta!', setMeta],
	['with-meta-sugar', (m: any, a: MalVal) => withMeta(a, m)],
	[
		// Atom
		'atom',
		(a: MalVal) => new MalAtom(a),
	],
	['atom?', (a: MalVal) => a instanceof MalAtom],
	['deref', (atm: MalAtom) => atm.value],
	['reset!', (atm: MalAtom, a: MalVal) => (atm.value = a)],
	[
		'swap!',
		(atm: MalAtom, fn: MalFunc, ...args: any) =>
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
	['rnd', (a: MalVal) => seedrandom(a)()],

	// I/O
	[
		'spit',
		(f: MalVal, content: MalVal) => {
			if (isNodeJS) {
				// eslint-disable-next-line @typescript-eslint/no-var-requires
				const fs = require('fs')
				// eslint-disable-next-line @typescript-eslint/no-var-requires
				const path = require('path')
				fs.writeFileSync(
					path.join(process.cwd(), f) as string,
					content as string
				)
			} else {
				throw new MalError('Cannot spit on browser')
			}

			return null
		},
	],
] as [string, MalVal][]

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
