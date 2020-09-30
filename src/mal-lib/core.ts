import seedrandom from 'seedrandom'
import {
	MalVal,
	MalSymbol,
	MalList,
	MalMap,
	cloneExp,
	assocBang,
	isMap,
	isString,
	MalError,
	MalAtom,
	getType,
	getMeta,
	withMeta,
	isMalSeq,
	setMeta,
	MalVector,
	MalBoolean,
	MalString, MalKeyword
} from '@/mal/types'
import printExp from '@/mal/printer'
import {partition} from '@/utils'
import isNodeJS from 'is-node'

const Exports = [
	['type', x => MalKeyword.create((getType(x) as string))],
	['nil?', (x: MalVal) => MalBoolean.create(x === null)],
	['true?', (x: MalVal) => MalBoolean.create(x === true)],
	['false?', (x: MalVal) => MalBoolean.create(x === false)],
	['boolean?', (x: MalVal) => MalBoolean.create(typeof x === 'boolean')],
	['number?', (x: MalVal) => MalBoolean.create(typeof x === 'number')],
	['string?', (x: MalVal) => MalBoolean.create(isString(x))],
	['keyword?', (x: MalVal) => MalBoolean.create(isKeyword(x))],
	['fn?', (x: MalVal) => MalBoolean.create(getType(x) === 'fn')],
	['macro?', (x: MalVal) => MalBoolean.create(getType(x) === 'macro')],

	['keyword', keywordFor],
	['symbol', S],
	['symbol?', (x: MalVal) => MalBoolean.create(MalSymbol.isType((x))],

	// // Compare
	['=', (a: MalVal, b: MalVal) => MalBoolean.create(a === b)],
	['!=', (a: MalVal, b: MalVal) => MalBoolean.create(a !== b)],
	['<', (a: number, b: number) => MalBoolean.create(a < b)],
	['<=', (a: number, b: number) => MalBoolean.create(a <= b)],
	['>', (a: number, b: number) => MalBoolean.create(a > b)],
	['>=', (a: number, b: number) => MalBoolean.create(a >= b)],

	// Calculus
	['+', (...a: number[]) => MalNumber.create(a.reduce((x, y) => x + y, 0))],
	[
		'-',
		(...xs: number[]) => {
			switch (xs.length) {
				case 0:
					return MalNumber.create(0)
				case 1:
					return MalNumber.create(-xs[0])
				case 2:
					return MalNumber.create(xs[0] - xs[1])
				default:
					return MalNumber.create(xs.slice(1).reduce((a, b) => a - b, xs[0]))
			}
		},
	],
	[
		'*',
		(...args: number[]) => MalNumber.create(args.reduce((a, b) => a * b, 1)),
	],
	[
		'/',
		(...xs: number[]) => {
			switch (xs.length) {
				case 0:
					return MalNumber.create(1)
				case 1:
					return MalNumber.create(1 / xs[0])
				case 2:
					return MalNumber.create(xs[0] / xs[1])
				default:
					return MalNumber.create(xs.slice(1).reduce((a, b) => a / b, xs[0]))
			}
		},
	],
	['mod', (x: number, y: number) => MalNumber.create(((x % y) + y) % y)],

	// Array
	['list', (...coll: MalVal[]) => L(...coll)],
	['lst', (coll: MalVal[]) => L(...coll)],
	['list?', (x: MalVal) => MalBoolean.create(MalList.isType((x))],

	['vector', (...xs: MalVal[]) => MalVector.create(...xs)],
	['vector?', (x: MalVal) => MalBoolean.create(MalVector.isType(x))],
	['vec', (a: MalVal[]) => MalVector.create(...a)],
	['sequential?', (x: MalVal) => MalBoolean.create(isMalSeq(x))],
	[
		'seq',
		(a: MalVal) => {
			if (isMalSeq(a)) {
				return MalVector.create(...a)
			} else if (isString(a) && a.length > 0) {
				return MalVector.create(...a.split(''))
			} else if (isMap(a)) {
				return MalVector.create(
					...Object.entries(a).map(x => MalVector.create(...x))
				)
			} else {
				return MalNil.create()
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
	[
		'first',
		(a: MalVal[]) => (a !== null && a.length > 0 ? a[0] : MalNil.create()),
	],
	[
		'rest',
		(a: MalVal[]) =>
			a === null ? MalVector.create() : MalVector.create(...a.slice(1)),
	],
	[
		'last',
		(a: MalVal[]) =>
			a !== null && a.length > 0 ? a[a.length - 1] : MalNil.create(),
	],
	[
		'butlast',
		(a: MalVal[]) =>
			a === null ? [] : MalVector.create(...a.slice(0, a.length - 1)),
	],
	['count', (a: MalVal[]) => MalNumber.create(a === null ? 0 : a.length)],
	[
		'slice',
		(a: MalVal[], start: number, end: number) => {
			if (isMalSeq(a)) {
				return MalVector.create(...a.slice(start, end))
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
	['map', (f: MalFunc, a: MalVal[]) => MalVector.create(...a.map(x => f(x)))],
	[
		'map-indexed',
		(f: MalFunc, a: MalVal[]) => MalVector.create(...a.map((x, i) => f(i, x))),
	],
	[
		'filter',
		(f: MalFunc, a: MalVal[]) => MalVector.create(...a.filter(x => f(x))),
	],
	[
		'remove',
		(f: MalFunc, a: MalVal[]) => MalVector.create(...a.filter(x => !f(x))),
	],
	['sort', (coll: MalVal[]) => MalVector.create(...[...coll].sort())],
	[
		'partition',
		(n: number, coll: MalVal[]) =>
			MalVector.create(...partition(n, coll).map(x => MalVector.create(...x))),
	],
	[
		'index-of',
		(value: MalVal[] | string, a: string) => MalNumber.create(value.indexOf(a)),
	],
	[
		'last-index-of',
		(value: MalVal[] | string, a: string) =>
			MalNumber.create(value.lastIndexOf(a)),
	],
	['repeat', (a: MalVal, n: number) => MalVector.create(...Array(n).fill(a))],
	['reverse', (coll: MalVal[]) => MalVector.create(...[...coll].reverse())],
	['cons', (a: MalVal, b: MalVal) => MalVector.create(...[a].concat(b))],
	[
		'conj',
		(lst: MalVal, ...args: MalVal[]) => {
			if (MalList.isType((lst)) {
				const newList = L(...lst)
				args.forEach(arg => newList.unshift(arg))
				return newList
			} else if (MalVector.isType(lst)) {
				return MalVector.create(...lst, ...args)
			}
		},
	],
	[
		'concat',
		(...args: MalVal[]) =>
			MalVector.create(
				...[].concat(...(args.filter(v => v !== null) as any[]))
			),
	],
	[
		'join',
		(separator: string, coll: MalVal[]) =>
			MalString.create(coll.map(v => printExp(v, false)).join(separator)),
	],

	// Map
	['hash-map', (...a: MalVal[]) => assocBang({}, ...a)],
	['map?', (x: MalVal) => MalBoolean.create(isMap(x))],
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
		(m: MalMap, a: string, notfound: MalVal = MalNil.create()) => {
			if (isMap(m)) {
				return a in m ? m[a] : notfound
			} else {
				return notfound
			}
		},
	],
	[
		'contains?',
		(m: MalMap, a: MalVal) =>
			MalBoolean.create(typeof a === 'string' ? a in m : false),
	],
	['keys', (a: MalMap) => MalVector.create(...Object.keys(a))],
	['vals', (a: MalMap) => MalVector.create(...Object.values(a))],
	[
		'entries',
		(a: MalMap) =>
			MalVector.create(...Object.entries(a).map(x => MalVector.create(...x))),
	],
	[
		'merge',
		(...xs: MalVal[]) => {
			return xs.filter(isMap).reduce((ret, m) => assocBang(ret, m), {})
		},
	],

	// String
	[
		'pr-str',
		(...a: MalVal[]) => MalString.create(a.map(e => printExp(e, true)).join(' ')),
	],
	[
		'str',
		(...a: MalVal[]) => MalString.create(a.map(e => printExp(e, false)).join('')),
	],
	[
		'subs',
		(a: string, from: number, to?: number) => MalString.create(a.substr(from, to)),
	],

	// Meta
	['meta', getMeta],
	[
		'console.log',
		(...xs: MalVal[]) => {
			console.log(...xs)
			return MalNil.create()
		},
	],
	['with-meta', withMeta],
	['set-meta!', setMeta],
	['with-meta-sugar', (m: any, a: MalVal) => withMeta(a, m)],
	[
		// Atom
		'atom',
		(a: MalVal) => new MalAtom(a),
	],
	['atom?', (a: MalVal) => MalBoolean.create(a instanceof MalAtom)],
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
			return MalVector.create(...ret)
		},
	],
	// Random
	['rnd', (a: MalVal) => MalNumber.create(seedrandom(a)())],

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

			return MalNil.create()
		},
	],
] as [string, MalVal][]

// Expose Math
Object.getOwnPropertyNames(Math).forEach(k =>
	Exports.push([k, (Math as any)[k]])
)

const Exp = L(
	MalSymbol.create('do'),
	...Exports.map(([sym, body]) => L(MalSymbol.create('def'), MalSymbol.create(sym), body))
)
;(globalThis as any)['glisp_library'] = Exp

export default Exp
