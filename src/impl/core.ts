import seedrandom from 'seedrandom'

import {
	MalVal,
	MalFunc,
	MalAtom,
	cloneAST,
	isKeyword,
	keywordFor
} from './types'
import printExp, {printer} from './printer'
import readStr from './reader'
import {lispError} from './repl'

const _SYM = Symbol.for

// String functions
function slurp(url: string) {
	const req = new XMLHttpRequest()
	req.open('GET', url, false)
	req.send()
	if (req.status !== 200) {
		lispError(`Failed to slurp file: ${url}`)
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

export const coreNS = new Map<string, any>([
	['throw', lispError],

	['nil?', (a: MalVal) => a === null],
	['true?', (a: MalVal) => a === true],
	['false?', (a: MalVal) => a === false],
	['bool?', (a: MalVal) => typeof a === 'boolean'],
	['number?', (a: MalVal) => typeof a === 'number'],
	['string?', (a: MalVal) => typeof a === 'string'],
	['symbol', (a: string) => _SYM(a)],
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
				lispError('[nth] Index should be specified by number')
			} else if (i < 0) {
				return -i <= a.length
					? a[a.length - i]
					: lispError('[nth] index out of range')
			} else {
				return i < a.length ? a[i] : lispError('[nth] index out of range')
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
	['last-index-of', (a: MalVal, coll: MalVal[]) => coll.lastIndexOf(a)],

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

	['cons', (a: MalVal, b: MalVal) => [a].concat(b)],
	['push', (a: MalVal[], ...b: MalVal[]) => [...a, ...b]],
	[
		'concat',
		(...args: MalVal[]) => args.reduce((x: MalVal[], y) => x.concat(y), [])
	],

	['meta', (a: MalVal) => (a as any)?.meta || null],
	[
		'with-meta',
		(a: MalVal, m: any) => {
			if (m === undefined) {
				throw lispError('[with-meta] Need the metadata to attach')
			}
			const c = cloneAST(a)
			;(c as any).meta = m
			return c
		}
	],
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

	// Random
	['random', (a: MalVal) => seedrandom(a)()]
])

// Expose Math
Object.getOwnPropertyNames(Math)
	.filter(k => k !== 'random')
	.forEach(k => coreNS.set(k, (Math as any)[k]))
