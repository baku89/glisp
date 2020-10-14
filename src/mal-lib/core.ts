import FileSaver from 'file-saver'
import {vsprintf} from 'sprintf-js'
import {
	MalVal,
	MalSymbol,
	MalList,
	MalMap,
	MalError,
	MalAtom,
	isMalSeq,
	MalVector,
	MalBoolean,
	MalString,
	MalKeyword,
	MalNil,
	MalNumber,
	MalFn,
	MalMacro,
	MalSeq,
	MalCallableValue,
	MalType,
} from '@/mal/types'
import printExp, {printer} from '@/mal/printer'
import {partition} from '@/utils'
import isNodeJS from 'is-node'
import readStr, {jsToMal, slurp} from '@/mal/reader'

const Exports = [
	['type', (x: MalVal) => MalKeyword.create(x.type)],
	['nil?', (x: MalVal) => MalBoolean.create(MalNil.is(x))],
	['true?', (x: MalVal) => MalBoolean.create(x.value === true)],
	['false?', (x: MalVal) => MalBoolean.create(x.value === false)],
	['boolean?', (x: MalVal) => MalBoolean.create(MalBoolean.is(x))],
	['number?', (x: MalVal) => MalBoolean.create(MalNumber.is(x))],
	['string?', (x: MalVal) => MalBoolean.create(MalString.is(x))],
	['keyword?', (x: MalVal) => MalBoolean.create(MalKeyword.is(x))],
	['list?', (x: MalVal) => MalBoolean.create(MalList.is(x))],
	['vector?', (x: MalVal) => MalBoolean.create(MalVector.is(x))],
	['map?', (x: MalVal) => MalBoolean.create(MalMap.is(x))],
	['atom?', (a: MalVal) => MalBoolean.create(a instanceof MalAtom)],
	['fn?', (x: MalVal) => MalBoolean.create(MalFn.is(x))],
	['macro?', (x: MalVal) => MalBoolean.create(MalMacro.is(x))],

	['keyword', (x: MalString) => MalKeyword.create(x.value)],
	['symbol', (x: MalString) => MalSymbol.create(x.value)],
	['symbol?', (x: MalVal) => MalBoolean.create(MalSymbol.is(x))],
	[
		'name',
		(x: MalVal) => {
			if (typeof x.value !== 'string') {
				throw new MalError(`Doesn't support name: ${x.print()}`)
			}
			return MalString.create(x.value)
		},
	],

	// Compare
	[
		'=',
		(a: MalVal, ...b: MalVal[]) => MalBoolean.create(b.every(x => a.equals(x))),
	],
	['!=', (a: MalVal, b: MalVal) => MalBoolean.create(!a.equals(b))],
	[
		'<',
		(...xs: MalNumber[]) =>
			MalBoolean.create(
				xs.slice(0, -1).every((x, i) => x.value < xs[i + 1].value)
			),
	],
	[
		'<=',
		(...xs: MalNumber[]) =>
			MalBoolean.create(
				xs.slice(0, -1).every((x, i) => x.value <= xs[i + 1].value)
			),
	],
	[
		'>',
		(...xs: MalNumber[]) =>
			MalBoolean.create(
				xs.slice(0, -1).every((x, i) => x.value > xs[i + 1].value)
			),
	],
	[
		'>=',
		(...xs: MalNumber[]) =>
			MalBoolean.create(
				xs.slice(0, -1).every((x, i) => x.value >= xs[i + 1].value)
			),
	],

	// Calculus
	[
		'+',
		(...a: MalNumber[]) => MalNumber.create(a.reduce((x, y) => x + y.value, 0)),
	],
	[
		'-',
		(...xs: MalNumber[]) => {
			switch (xs.length) {
				case 0:
					return MalNumber.create(0)
				case 1:
					return MalNumber.create(-xs[0].value)
				case 2:
					return MalNumber.create(xs[0].value - xs[1].value)
				default:
					return MalNumber.create(
						xs.slice(1).reduce((a, b) => a - b.value, xs[0].value)
					)
			}
		},
	],
	[
		'*',
		(...args: MalNumber[]) =>
			MalNumber.create(args.reduce((a, b) => a * b.value, 1)),
	],
	[
		'/',
		(...xs: MalNumber[]) => {
			switch (xs.length) {
				case 0:
					return MalNumber.create(1)
				case 1:
					return MalNumber.create(1 / xs[0].value)
				case 2:
					return MalNumber.create(xs[0].value / xs[1].value)
				default:
					return MalNumber.create(
						xs.slice(1).reduce((a, b) => a / b.value, xs[0].value)
					)
			}
		},
	],
	[
		'mod',
		(x: MalNumber, y: MalNumber) => {
			const _x = x.value
			const _y = y.value
			MalNumber.create(((_x % _y) + _y) % _y)
		},
	],

	// Array
	['list', (...coll: MalVal[]) => MalList.create(coll)],
	['lst', (coll: MalSeq) => MalList.create(coll.value)],

	['vector', (...xs: MalVal[]) => MalVector.create(xs)],
	['vec', (a: MalSeq) => MalVector.create(a.value)],
	['sequential?', (x: MalVal) => MalBoolean.create(isMalSeq(x))],
	[
		'seq',
		(a: MalVal) => {
			if (isMalSeq(a)) {
				return a.clone()
			} else if (MalString.is(a)) {
				return MalVector.create(a.value.split('').map(MalString.create))
			} else if (MalMap.is(a)) {
				return MalVector.create(
					a
						.entries()
						.map(([k, v]) => MalVector.create([MalString.create(k), v]))
				)
			} else {
				return MalNil.create()
			}
		},
	],
	[
		'nth',
		(a: MalSeq, index: MalNumber) => {
			if (!MalNumber.is(index)) {
				throw new MalError('index argument to nth must be a number')
			}

			const i = index.value

			if (i < 0 && -i <= a.count) {
				return a.get(a.count + i)
			} else if (i < a.count) {
				return a.get(i)
			}

			throw new MalError('index out of range')
		},
	],
	[
		'count',
		(a: MalVal) =>
			MalNumber.create(isMalSeq(a) || MalString.is(a) ? a.value.length : 0),
	],
	[
		'subvec',
		(a: MalSeq, start: MalNumber, end?: MalNumber) => {
			if (!isMalSeq(a)) {
				throw new MalError(`[slice] ${printExp(a)} is not an array`)
			}
			return MalVector.create(a.value.slice(start.value, end?.value))
		},
	],
	[
		'apply',
		(f: MalFn, ...a: MalSeq[]) => {
			const args: MalVal[] = []
			a.forEach(x => args.push(...x.value))
			return f.value(...args)
		},
	],
	[
		'map',
		async (f: MalFn, coll: MalSeq) => {
			const arr = []
			for (const x of coll.value) {
				arr.push(await f.value(x))
			}
			return MalVector.create(arr)
		},
	],
	[
		'map-indexed',
		async (f: MalFn, coll: MalSeq) => {
			const arr = []
			for (let i = 0; i < coll.count; i++) {
				arr.push(await f.value(MalNumber.create(i), coll.get(i)))
			}
			return MalVector.create(arr)
		},
	],
	[
		'filter',
		(f: MalFn, coll: MalSeq) =>
			MalVector.create(coll.value.filter(x => f.value(x))),
	],
	[
		'remove',
		(f: MalFn, coll: MalSeq) =>
			MalVector.create(coll.value.filter(x => !f.value(x))),
	],
	['sort', (coll: MalSeq) => MalVector.create([...coll.value].sort())],
	[
		'partition',
		(n: MalNumber, coll: MalSeq) =>
			MalVector.create(
				partition(n.value, coll.value).map(x => MalVector.create(x))
			),
	],
	[
		'index-of',
		(coll: MalSeq, a: MalString) => MalNumber.create(coll.value.indexOf(a)),
	],
	[
		'last-index-of',
		(coll: MalSeq, a: MalString) => MalNumber.create(coll.value.lastIndexOf(a)),
	],
	[
		'repeat',
		(a: MalVal, n: MalNumber) =>
			MalVector.create(Array(n).map(() => a.clone())),
	],
	['reverse', (coll: MalSeq) => MalVector.create([...coll.value].reverse())],
	['cons', (a: MalVal, b: MalVal) => MalVector.create([a].concat(b))],
	[
		'conj',
		(coll: MalVal, ...xs: MalVal[]) => {
			if (MalList.is(coll)) {
				return MalList.create([...xs.reverse(), ...coll.value])
			} else if (MalVector.is(coll)) {
				return MalVector.create([...coll.value, ...xs])
			}
		},
	],
	[
		'concat',
		(...xs: MalVal[]) =>
			MalVector.create(xs.map(x => (isMalSeq(x) ? x.value : [x])).flat()),
	],
	[
		'join',
		(separator: MalString, coll: MalSeq) =>
			MalString.create(
				coll.value
					.map(v => (MalString.is(v) ? v.value : v.print()))
					.join(separator.value)
			),
	],

	// Map
	['hash-map', (...pairs: MalVal[]) => MalMap.fromSeq(pairs)],
	[
		'assoc',
		(m: MalVal, ...pairs: MalVal[]) => {
			switch (m.type) {
				case MalType.Map:
					return m.assoc(pairs)
				case MalType.Nil:
					return MalMap.fromSeq(pairs)
				default:
					throw new MalError(
						`Cannot apply assoc to ${m.print()} ${pairs
							.map(x => x.print())
							.join(' ')}`
					)
			}
		},
	],
	[
		'get',
		(m: MalMap, a: MalString, notfound: MalVal = MalNil.create()) => {
			if (MalMap.is(m)) {
				return a.value in m.value ? m.value[a.value] : notfound
			} else {
				return notfound
			}
		},
	],
	[
		'contains?',
		(m: MalMap, a: MalVal) =>
			MalBoolean.create(
				MalKeyword.is(a) || MalString.is(a) ? a.value in m.value : false
			),
	],
	[
		'entries',
		(a: MalMap) =>
			MalVector.create(
				a.entries().map(([k, v]) => MalVector.create([MalString.create(k), v]))
			),
	],
	[
		'merge',
		(...xs: MalVal[]) => {
			return MalMap.create(
				xs
					.filter(MalMap.is)
					.reduce(
						(ret, m) => ({...ret, ...m.value}),
						{} as {[k: string]: MalVal}
					)
			)
		},
	],

	// String
	[
		'pr-str',
		(...a: MalVal[]) => MalString.create(a.map(e => e.print()).join(' ')),
	],
	[
		'str',
		(...a: MalVal[]) => MalString.create(a.map(e => e.print(false)).join('')),
	],
	[
		'subs',
		(a: MalString, from: MalNumber, to?: MalNumber) =>
			MalString.create(a.value.substr(from.value, to?.value)),
	],
	[
		'format',
		(fmt: MalString, ...xs: (MalNumber | MalString)[]) =>
			MalString.create(
				vsprintf(
					fmt.value,
					xs.map(x => x.toJS())
				)
			),
	],

	// Meta
	['meta', x => x.meta],
	['with-meta', (x, meta) => x.withMeta(meta)],
	// ['with-meta-sugar', (meta, x) => x.withMeta(meta)],
	[
		// Atom
		'atom',
		(a: MalVal) => MalAtom.create(a),
	],
	[
		'deref',
		(atm: MalAtom) => {
			if (!MalAtom.is(atm)) {
				throw new MalError('Cannot deref non-atom value')
			}
			return atm.value
		},
	],
	[
		'reset!',
		(atm: MalAtom, a: MalVal) => {
			if (!MalAtom.is(atm)) throw new MalError('Cannot reset non-atom value')
			return (atm.value = a)
		},
	],
	[
		'swap!',
		async (atm: MalAtom, f: MalFn, ...args: MalVal[]) => {
			if (!MalAtom.is(atm)) throw new MalError('Cannot swap non-atom value')
			return (atm.value = await f.value(atm.value, ...args))
		},
	],

	// Other useful functions in JS
	[
		'range',
		(...args: MalNumber[]) => {
			const ret = []
			let start = 0,
				end = 0,
				step = Math.sign(end - start)
			if (args.length === 1) {
				end = args[0].value
			} else if (args.length === 2) {
				start = args[0].value
				end = args[1].value
			} else {
				start = args[0].value
				end = args[1].value
				step = args[2].value
			}
			if (start !== end) {
				if ((end - start) * step <= 0) {
					step = Math.sign(end - start) * Math.abs(step) || 1
				}
				for (let i = start; step > 0 ? i < end : i > end; i += step) {
					ret.push(i)
				}
			}
			return jsToMal(ret)
		},
	],

	// I/O
	[
		'prn',
		(...a: MalVal[]) => {
			printer.log(...a.map(e => e.print()))
			return MalNil.create()
		},
	],
	[
		'print-str',
		(...a: MalVal[]) => {
			return MalString.create(a.map(e => e.print()).join(' '))
		},
	],
	[
		'println',
		(...a: MalVal[]) => {
			printer.log(...a.map(e => e.print(false)))
			return MalNil.create()
		},
	],
	['read-string', (x: MalString) => readStr(x.value)],
	[
		'clear',
		() => {
			printer.clear()
			return MalNil.create()
		},
	],
	['slurp', (x: MalString) => MalString.create(slurp(x.value))],
	[
		'spit',
		(f: MalString, content: MalString) => {
			if (isNodeJS) {
				// eslint-disable-next-line @typescript-eslint/no-var-requires
				const fs = require('fs')
				// eslint-disable-next-line @typescript-eslint/no-var-requires
				const path = require('path')
				fs.writeFileSync(path.join(process.cwd(), f), content.value)
			} else {
				// Download
				const file = new File([content.value], f.value, {
					type: 'text/plain;charset=utf-8',
				})
				FileSaver.saveAs(file)
			}

			return MalNil.create()
		},
	],

	// Interop
	['js-eval', (x: MalString) => jsToMal(eval(x.value))],
	[
		'js-fn',
		(x: MalString) => {
			const fn = eval(x.value)
			if (typeof fn !== 'function') {
				throw new MalError('Cannot convert to MalFn')
			}
			return MalFn.create((...args: MalVal[]) => {
				const ret = fn(...args.map(x => x.toJS()))
				return jsToMal(ret)
			})
		},
	],

	// Thread
	[
		'sleep',
		(ms: MalNumber) =>
			new Promise(resolve => {
				setTimeout(() => resolve(MalNil.create()), ms.value)
			}),
	],
] as [string, MalCallableValue | MalVal][]

const Exp = MalList.create([
	MalSymbol.create('do'),
	...Exports.map(([sym, body]) =>
		MalList.create([
			MalSymbol.create('def'),
			MalSymbol.create(sym),
			jsToMal(body as any),
		])
	),
])

;(globalThis as any)['glisp_library'] = Exp

export default Exp
