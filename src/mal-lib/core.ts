import FileSaver from 'file-saver'
import isNodeJS from 'is-node'
import {chunk} from 'lodash'
import {vsprintf} from 'sprintf-js'

import printExp, {printer} from '@/mal/printer'
import readStr, {readJS, slurp} from '@/mal/reader'
import {
	isMalColl,
	isMalSeq,
	MalAtom,
	MalBoolean,
	MalBuffer,
	MalCallableValue,
	MalError,
	MalFn,
	MalKeyword,
	MalList,
	MalMacro,
	MalMap,
	MalNil,
	MalNumber,
	MalSeq,
	MalString,
	MalSymbol,
	MalType,
	MalVal,
	MalVector,
} from '@/mal/types'
const Exports = [
	['type', (x: MalVal) => MalKeyword.from(x.type)],
	['nil?', (x: MalVal) => MalBoolean.from(MalNil.is(x))],
	['true?', (x: MalVal) => MalBoolean.from(x.value === true)],
	['false?', (x: MalVal) => MalBoolean.from(x.value === false)],
	['boolean?', (x: MalVal) => MalBoolean.from(MalBoolean.is(x))],
	['number?', (x: MalVal) => MalBoolean.from(MalNumber.is(x))],
	['string?', (x: MalVal) => MalBoolean.from(MalString.is(x))],
	['keyword?', (x: MalVal) => MalBoolean.from(MalKeyword.is(x))],
	['list?', (x: MalVal) => MalBoolean.from(MalList.is(x))],
	['vector?', (x: MalVal) => MalBoolean.from(MalVector.is(x))],
	['map?', (x: MalVal) => MalBoolean.from(MalMap.is(x))],
	['atom?', (a: MalVal) => MalBoolean.from(a instanceof MalAtom)],
	['fn?', (x: MalVal) => MalBoolean.from(MalFn.is(x))],
	['macro?', (x: MalVal) => MalBoolean.from(MalMacro.is(x))],

	['keyword', (x: MalString) => MalKeyword.from(x.value)],
	['symbol', (x: MalString) => MalSymbol.from(x.value)],
	['symbol?', (x: MalVal) => MalBoolean.from(MalSymbol.is(x))],
	[
		'name',
		(x: MalVal) => {
			if (typeof x.value !== 'string') {
				throw new MalError(`Doesn't support name: ${x.print()}`)
			}
			return MalString.from(x.value)
		},
	],

	// Compare
	[
		'=',
		(a: MalVal, ...b: MalVal[]) => MalBoolean.from(b.every(x => a.equals(x))),
	],
	['not=', (a: MalVal, b: MalVal) => MalBoolean.from(!a.equals(b))],
	[
		'<',
		(...xs: MalNumber[]) =>
			MalBoolean.from(
				xs.slice(0, -1).every((x, i) => x.value < xs[i + 1].value)
			),
	],
	[
		'<=',
		(...xs: MalNumber[]) =>
			MalBoolean.from(
				xs.slice(0, -1).every((x, i) => x.value <= xs[i + 1].value)
			),
	],
	[
		'>',
		(...xs: MalNumber[]) =>
			MalBoolean.from(
				xs.slice(0, -1).every((x, i) => x.value > xs[i + 1].value)
			),
	],
	[
		'>=',
		(...xs: MalNumber[]) =>
			MalBoolean.from(
				xs.slice(0, -1).every((x, i) => x.value >= xs[i + 1].value)
			),
	],

	// Calculus
	[
		'+',
		(...a: MalNumber[]) => MalNumber.from(a.reduce((x, y) => x + y.value, 0)),
	],
	[
		'-',
		(...xs: MalNumber[]) => {
			switch (xs.length) {
				case 0:
					return MalNumber.from(0)
				case 1:
					return MalNumber.from(-xs[0].value)
				case 2:
					return MalNumber.from(xs[0].value - xs[1].value)
				default:
					return MalNumber.from(
						xs.slice(1).reduce((a, b) => a - b.value, xs[0].value)
					)
			}
		},
	],
	[
		'*',
		(...args: MalNumber[]) =>
			MalNumber.from(args.reduce((a, b) => a * b.value, 1)),
	],
	[
		'/',
		(...xs: MalNumber[]) => {
			switch (xs.length) {
				case 0:
					return MalNumber.from(1)
				case 1:
					return MalNumber.from(1 / xs[0].value)
				case 2:
					return MalNumber.from(xs[0].value / xs[1].value)
				default:
					return MalNumber.from(
						xs.slice(1).reduce((a, b) => a / b.value, xs[0].value)
					)
			}
		},
	],
	[
		'mod',
		(x: MalVal, y: MalVal) => {
			const _x = MalNumber.check(x)
			const _y = MalNumber.check(y)
			return MalNumber.from(((_x % _y) + _y) % _y)
		},
	],
	[
		'quot',
		(num: MalVal, div: MalVal) =>
			MalNumber.from(Math.floor(MalNumber.check(num) / MalNumber.check(div))),
	],
	[
		'rem',
		(num: MalVal, div: MalVal) =>
			MalNumber.from(MalNumber.check(num) % MalNumber.check(div)),
	],
	[
		// Array
		'list',
		(...coll: MalVal[]) => MalList.from(coll),
	],
	['lst', (coll: MalSeq) => MalList.from(coll.value)],

	['vector', (...xs: MalVal[]) => MalVector.from(xs)],
	['vec', (a: MalSeq) => MalVector.from(a.value)],
	['sequential?', (x: MalVal) => MalBoolean.from(isMalSeq(x))],
	[
		'seq',
		(a: MalVal) => {
			if (isMalSeq(a)) {
				return a.clone()
			} else if (MalString.is(a)) {
				return MalVector.from(a.value.split('').map(MalString.from))
			} else if (MalMap.is(a)) {
				return MalVector.from(
					a.entries().map(([k, v]) => MalVector.from([MalString.from(k), v]))
				)
			} else {
				return MalNil.from()
			}
		},
	],
	[
		'nth',
		(a: MalSeq | MalBuffer | MalMap, index: MalNumber) => {
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
			MalNumber.from(isMalColl(a) || MalString.is(a) ? a.count : 0),
	],
	[
		'slice',
		(a: MalVal, start: MalNumber, end?: MalNumber) => {
			if (!isMalSeq(a) && !MalString.is(a)) {
				throw new MalError(
					`[slice] ${printExp(a)} should be sequence or string`
				)
			}
			const sub = a.value.slice(start.value, end?.value)
			return typeof sub === 'string' ? MalString.from(sub) : MalVector.from(sub)
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
		async (f: MalFn, coll: MalSeq | MalBuffer) => {
			const _f = MalFn.check(f)
			const arr = []
			for (let i = 0, l = coll.count; i < l; i++) {
				arr.push(await _f(coll.get(i), MalNumber.from(i)))
			}
			return MalVector.from(arr)
		},
	],
	[
		'filter',
		(f: MalFn, coll: MalSeq) =>
			MalVector.from(coll.value.filter(x => f.value(x))),
	],
	[
		'remove',
		(f: MalFn, coll: MalSeq) =>
			MalVector.from(coll.value.filter(x => !f.value(x))),
	],
	['sort', (coll: MalSeq) => MalVector.from([...coll.value].sort())],
	[
		'partition',
		(n: MalNumber, coll: MalSeq) =>
			MalVector.from(chunk(coll.value, n.value).map(x => MalVector.from(x))),
	],
	[
		'index-of',
		(coll: MalSeq, a: MalVal) =>
			MalNumber.from(coll.value.findIndex(x => a.equals(x))),
	],
	[
		'last-index-of',
		(coll: MalSeq, a: MalVal) => {
			let ret = -1
			for (let i = coll.count; i >= 0; i--) {
				if (a.equals(coll.get(i))) {
					ret = i
					break
				}
			}
			return MalNumber.from(ret)
		},
	],
	[
		'repeat',
		(n: MalNumber, a: MalVal) => MalVector.from(Array(n).map(() => a.clone())),
	],
	['reverse', (coll: MalSeq) => MalVector.from([...coll.value].reverse())],
	['cons', (a: MalVal, b: MalVal) => MalVector.from([a].concat(b))],
	[
		'conj',
		(coll: MalVal, ...xs: MalVal[]) => {
			if (MalList.is(coll)) {
				return MalList.from([...xs.reverse(), ...coll.value])
			} else if (MalVector.is(coll)) {
				return MalVector.from([...coll.value, ...xs])
			}
		},
	],
	[
		'concat',
		(...xs: MalVal[]) =>
			MalVector.from(xs.map(x => (isMalSeq(x) ? x.value : [x])).flat()),
	],
	[
		'join',
		(separator: MalString, coll: MalSeq) =>
			MalString.from(
				coll.value
					.map(v => (MalString.is(v) ? v.value : v.print()))
					.join(separator.value)
			),
	],

	// Map
	['hash-map', (...pairs: MalVal[]) => MalMap.of(pairs)],
	[
		'assoc',
		(m: MalVal, ...pairs: MalVal[]) => {
			switch (m.type) {
				case MalType.Map:
					return m.assoc(pairs)
				case MalType.Nil:
					return MalMap.of(pairs)
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
		(m: MalMap, a: MalString, notfound: MalVal = MalNil.from()) => {
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
			MalBoolean.from(
				MalKeyword.is(a) || MalString.is(a) ? a.value in m.value : false
			),
	],
	[
		'entries',
		(a: MalMap) =>
			MalVector.from(
				a.entries().map(([k, v]) => MalVector.from([MalString.from(k), v]))
			),
	],
	[
		'merge',
		(...xs: MalVal[]) => {
			return MalMap.from(
				xs
					.filter(MalMap.is)
					.reduce(
						(ret, m) => ({...ret, ...m.value}),
						{} as Record<string, MalVal>
					)
			)
		},
	],

	// String
	[
		'pr-str',
		(...a: MalVal[]) => MalString.from(a.map(e => e.print()).join(' ')),
	],
	[
		'str',
		(...a: MalVal[]) => MalString.from(a.map(e => e.print(false)).join('')),
	],
	[
		'format',
		(fmt: MalString, ...xs: (MalNumber | MalString)[]) =>
			MalString.from(
				vsprintf(
					fmt.value,
					xs.map(x => x.toObject())
				)
			),
	],

	// Meta
	['meta', x => x.meta],
	['with-meta', (x, meta) => x.withMeta(meta)],
	['with-meta-sugar', (meta, x) => x.withMeta(meta)],
	[
		// Atom
		'atom',
		(a: MalVal) => MalAtom.from(a),
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
		(...args: MalVal[]) => {
			const ret = []
			let start = 0,
				end = 0,
				step = Math.sign(end - start)
			if (args.length === 1) {
				end = MalNumber.check(args[0])
			} else if (args.length === 2) {
				start = MalNumber.check(args[0])
				end = MalNumber.check(args[1])
			} else {
				start = MalNumber.check(args[0])
				end = MalNumber.check(args[1])
				step = MalNumber.check(args[2])
			}
			if (start !== end) {
				if ((end - start) * step <= 0) {
					step = Math.sign(end - start) * Math.abs(step) || 1
				}
				for (let i = start; step > 0 ? i < end : i > end; i += step) {
					ret.push(i)
				}
			}
			return readJS(ret)
		},
	],

	// I/O
	[
		'prn',
		(...a: MalVal[]) => {
			printer.log(...a.map(e => e.print()))
			return MalNil.from()
		},
	],
	[
		'print-str',
		(...a: MalVal[]) => {
			return MalString.from(a.map(e => e.print()).join(' '))
		},
	],
	[
		'println',
		(...a: MalVal[]) => {
			printer.log(...a.map(e => e.print(false)))
			return MalNil.from()
		},
	],
	['read-string', (x: MalString) => readStr(x.value)],
	[
		'clear',
		() => {
			printer.clear()
			return MalNil.from()
		},
	],
	['slurp', (x: MalString) => MalString.from(slurp(x.value))],
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

			return MalNil.from()
		},
	],

	// Interop
	['js-eval', (x: MalString) => readJS(eval(x.value))],
	[
		'js-fn',
		(x: MalString) => {
			const fn = eval(x.value)
			if (typeof fn !== 'function') {
				throw new MalError('Cannot convert to MalFn')
			}
			return MalFn.from((...args: MalVal[]) => {
				const ret = fn(...args.map(x => x.toObject()))
				return readJS(ret)
			})
		},
	],

	// Buffer
	['buffer?', (x: MalVal) => MalBoolean.from(MalBuffer.is(x))],
	[
		'buffer-type',
		(x: MalVal) =>
			MalBuffer.is(x) ? MalString.from(x.bufferType) : MalNil.from(),
	],
	[
		'buffer-f32',
		(x: MalVal) => {
			const buf = x.toFloats()
			return MalBuffer.from(buf)
		},
	],
	[
		'buffer-u8',
		(x: MalVal) => {
			const buf = new Uint8Array(x.toFloats())
			return MalBuffer.from(buf)
		},
	],

	// Thread
	[
		'sleep',
		(ms: MalNumber) =>
			new Promise(resolve => {
				setTimeout(() => resolve(MalNil.from()), ms.value)
			}),
	],
	['performance-now', () => MalNumber.from(performance.now())],
] as [string, MalCallableValue | MalVal][]

const Exp = MalList.from([
	MalSymbol.from('do'),
	...Exports.map(([sym, body]) =>
		MalList.from([
			MalSymbol.from('def'),
			MalSymbol.from(sym),
			readJS(body as any),
		])
	),
])

;(globalThis as any)['glisp_library'] = Exp

export default Exp
