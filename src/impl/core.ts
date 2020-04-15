import seedrandom from 'seedrandom'

import {
	MalVal,
	MalFunc,
	MalAtom,
	cloneAST,
	isKeyword,
	keywordFor,
	assocBang,
	MalMap
} from './types'
import printExp, {printer} from './printer'
import readStr from './reader'
import {LispError} from './repl'
import interop from './interop'

// String functions
function slurp(url: string) {
	const req = new XMLHttpRequest()
	req.open('GET', url, false)
	req.send()
	if (req.status !== 200) {
		throw new LispError(`Failed to slurp file: ${url}`)
	}
	return req.responseText
}

export function partition(n: number, coll: any[]) {
	const ret = []

	for (let i = 0; i < coll.length; i += n) {
		ret.push(coll.slice(i, i + n))
	}
	return ret
}

// Interop
function jsEval(str: string): MalVal {
	return interop.jsToMal(eval(str.toString()))
}

function jsMethodCall(objMethodStr: string, ...args: MalVal[]): MalVal {
	const [obj, f] = interop.resolveJS(objMethodStr)
	const res = f.apply(obj, args)
	return interop.jsToMal(res)
}

export const coreNS = new Map<string, any>([
	[
		'throw',
		(msg: string) => {
			throw new LispError(msg)
		}
	],

	['nil?', (a: MalVal) => a === null],
	['true?', (a: MalVal) => a === true],
	['false?', (a: MalVal) => a === false],
	['bool?', (a: MalVal) => typeof a === 'boolean'],
	['number?', (a: MalVal) => typeof a === 'number'],
	['string?', (a: MalVal) => typeof a === 'string'],
	['symbol', Symbol.for],
	['symbol?', (a: MalVal) => typeof a === 'symbol'],
	['keyword?', isKeyword],
	['keyword', keywordFor],
	['fn?', (a: MalVal) => typeof a === 'function' && !(a as MalFunc).ismacro],
	[
		'macro?',
		(a: MalVal) => typeof a === 'function' && !!(a as MalFunc).ismacro
	],

	// Compare
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
		(i: number, ...a: number[]) =>
			a.length ? a.reduce((x, y) => x - y, i) : -i
	],
	['*', (...args: number[]) => args.reduce((a, b) => a * b, 1)],
	[
		'/',
		(i: number, ...a: number[]) =>
			a.length ? a.reduce((x, y) => x / y, i) : 1 / i
	],
	['mod', (a: number, b: number) => a % b],

	// Array
	['list', (...a: MalVal[]) => a],
	['list?', Array.isArray],

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
	['slice', (a: MalVal[], start: number, end: number) => a.slice(start, end)],
	[
		'apply',
		(f: MalFunc, ...a: MalVal[]) => f(...a.slice(0, -1).concat(a[a.length - 1]))
	],
	['partition', partition],
	['index-of', (a: MalVal, coll: MalVal[]) => coll.indexOf(a)],
	['last-index-of', (a: MalVal, coll: MalVal[]) => coll.lastIndexOf(a)],
	['repeat', (a: MalVal, n: number) => Array(n).fill(a)],
	['reverse', (coll: MalVal[]) => coll.reverse()],
	['cons', (a: MalVal, b: MalVal) => [a].concat(b)],
	['push', (a: MalVal[], ...b: MalVal[]) => [...a, ...b]],
	[
		'concat',
		(...args: MalVal[]) => args.reduce((x: MalVal[], y) => x.concat(y), [])
	],

	// Map
	['hash-map', (...a: MalVal[]) => assocBang(new Map(), ...a)],
	['map?', (a: MalVal) => a instanceof Map],
	[
		'assoc',
		(m: MalMap, ...a: MalVal[]) => assocBang(cloneAST(m) as MalMap, ...a)
	],
	[
		'dissoc',
		(m: MalMap, ...a: MalVal[]) => {
			const n = cloneAST(m) as MalMap
			a.forEach(k => n.delete(k))
			return n
		}
	],
	[
		'get',
		(m: MalMap, a: MalVal) => (m === null ? null : m.has(a) ? m.get(a) : null)
	],
	['contains?', (m: MalMap, a: MalVal) => m.has(a)],
	['keys', (a: MalMap) => Array.from(a.keys())],
	['vals', (a: MalMap) => Array.from(a.values())],

	// String
	['str', (...a: MalVal[]) => a.map(e => printExp(e, false)).join('')],
	[
		'prn',
		(...a: MalVal[]) => {
			printer.log(...a.map(e => printExp(e, true)))
			return null
		}
	],
	[
		'println',
		(...a: MalVal[]) => {
			printer.log(...a.map(e => printExp(e, false)))
			return null
		}
	],
	['read-string', readStr],
	['slurp', slurp],

	// Meta
	['meta', (a: MalVal) => (a as any)?.meta || null],
	[
		'with-meta',
		(a: MalVal, m: any) => {
			if (m === undefined) {
				throw new LispError('[with-meta] Need the metadata to attach')
			}
			const c = cloneAST(a)
			;(c as any).meta = m
			return c
		}
	],

	// Atom
	['atom', (a: MalVal) => new MalAtom(a)],
	['atom?', (a: MalVal) => a instanceof MalAtom],
	['deref', (atm: MalAtom) => atm.val],
	['reset!', (atm: MalAtom, a: MalVal) => (atm.val = a)],
	[
		'swap!',
		(atm: MalAtom, fn: MalFunc, ...args: any) =>
			(atm.val = fn(...[atm.val].concat(args)))
	],

	// Conditionals
	[
		'range',
		(...args: number[]) => {
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

			if (start === end) {
				return []
			}

			if ((end - start) * step <= 0) {
				step = Math.sign(end - start) * Math.abs(step) || 1
			}

			const arr = []

			for (let i = start; step > 0 ? i < end : i > end; i += step) {
				arr.push(i)
			}

			return arr
		}
	],

	// Other useful functions in JS
	['time-ms', Date.now],

	// Interop
	['js-eval', jsEval],
	['.', jsMethodCall],

	// Random
	['random', (a: MalVal) => seedrandom(a)()]
])

// Expose Math
Object.getOwnPropertyNames(Math)
	.filter(k => k !== 'random')
	.forEach(k => coreNS.set(k, (Math as any)[k]))
