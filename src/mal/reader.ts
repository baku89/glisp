import isNodeJS from 'is-node'
import {
	MalError,
	MalSymbol,
	MalMap,
	MalVal,
	MalNil,
	MalBoolean,
	MalNumber,
	MalString,
	MalVector,
	MalList,
	MalKeyword,
	MalColl,
	isMalSeq,
	MalFn,
	isMal,
	MalAtom,
	MalCallableValue,
} from './types'

export class MalBlankException extends MalError {}
export class MalReadError extends MalError {}

class Reader {
	private strlen: number
	private _index: number

	constructor(private tokens: [string, number][], private str: string) {
		this.strlen = str.length
		this._index = 0
	}

	public next() {
		const token = this.tokens[this._index++]
		if (!token) {
			throw new MalReadError('Invalid end of file')
		}
		return token[0]
	}

	public peek(pos = this._index) {
		const token = this.tokens[pos]
		if (!token) {
			throw new MalReadError('Invalid end of file')
		}
		return token[0]
	}

	public get index() {
		return this._index
	}

	public strInRange(start: number, end: number) {
		return this.str.slice(start, end)
	}

	public offset(pos = this._index) {
		const token = this.tokens[pos]
		return token !== undefined ? token[1] : this.strlen
	}

	public endOffset(pos = this._index) {
		const token = this.tokens[pos]
		return token !== undefined ? token[1] + token[0].length : this.strlen
	}

	public prevEndOffset() {
		return this.endOffset(this._index - 1)
	}
}

function tokenize(str: string) {
	// eslint-disable-next-line no-useless-escape
	const re = /[\s,]*(~@|[\[\]{}()'`~^@#]|"(?:\\.|[^\\"])*"|;.*|[^\s\[\]{}('"`,;)]*)/g
	let match = null
	const spaceRe = /^[\s,]*/
	let spaceMatch = null,
		spaceOffset = null
	const results = []

	while ((match = re.exec(str)) && match[1] != '') {
		if (match[1][0] === ';') {
			continue
		}

		spaceMatch = spaceRe.exec(match[0])
		spaceOffset = spaceMatch ? spaceMatch[0].length : 0

		results.push([match[1], match.index + spaceOffset] as [string, number])
	}
	return results
}

function readAtom(reader: Reader) {
	const token = reader.next()

	if (typeof token === 'string') {
		if (token.match(/^[-+]?[0-9]+$/)) {
			// integer
			return MalNumber.create(parseInt(token, 10))
		} else if (token.match(/^[-+]?([0-9]*\.[0-9]+|[0-9]+)$/)) {
			// float
			return MalNumber.create(parseFloat(token))
		} else if (token.match(/^"(?:\\.|[^\\"])*"$/)) {
			// string
			return MalString.create(
				token
					.slice(1, token.length - 1)
					.replace(/\\(.)/g, (_: any, c: string) => (c === 'n' ? '\n' : c)) // handle new line
			)
		} else if (token[0] === '"') {
			throw new MalReadError("Expected '\"', got EOF")
		} else if (token[0] === ':') {
			return MalKeyword.create(token.slice(1))
		} else if (token === 'nil') {
			return MalNil.create()
		} else if (token === 'true') {
			return MalBoolean.create(true)
		} else if (token === 'false') {
			return MalBoolean.create(false)
		} else if (/^NaN$|^-?Infinity$/.test(token)) {
			return MalNumber.create(parseFloat(token))
		} else {
			// symbol
			return MalSymbol.create(token as string)
		}
	} else {
		return token
	}
}

// read list of tokens
function readColl(reader: Reader, start = '[', end = ']') {
	const coll: MalVal[] = []

	const delimiters: string[] = []

	let token = reader.next()

	if (token !== start) {
		throw new MalReadError(`Expected '${start}'`)
	}

	while ((token = reader.peek()) !== end) {
		if (!token) {
			throw new MalReadError(`Expected '${end}', got EOF`)
		}

		// Save delimiter
		const delimiter = reader.strInRange(reader.prevEndOffset(), reader.offset())
		delimiters?.push(delimiter)

		coll.push(readForm(reader))
	}

	// Save a delimiter between a last element and a end tag
	const delimiter = reader.strInRange(reader.prevEndOffset(), reader.offset())
	delimiters.push(delimiter)

	reader.next()
	return {
		coll,
		delimiters,
	}
}

// read vector of tokens
function readVector(reader: Reader) {
	const {coll, delimiters} = readColl(reader, '[', ']')
	const vec = MalVector.create(coll)
	vec.delimiters = delimiters
	return vec
}

function readList(reader: Reader) {
	const {coll, delimiters} = readColl(reader, '(', ')')
	const list = MalList.create(coll)
	list.delimiters = delimiters
	return list
}

// read hash-map key/value pairs
function readMap(reader: Reader) {
	const {coll, delimiters} = readColl(reader, '{', '}')
	const map = MalMap.fromSeq(coll)
	map.delimiters = delimiters
	return map
}

function readForm(reader: Reader): any {
	let val: MalVal

	// For syntaxtic sugars
	// const startIdx = reader.index

	// Set offset array value if the form is syntaxic sugar.
	// the offset array is like [<end of arg0>, <start of arg1>]
	let sugar: number[] | null = null

	const token = reader.peek()

	switch (token) {
		// reader macros/transforms
		case ';':
			val = MalNil.create()
			break
		case "'":
			reader.next()
			sugar = [reader.prevEndOffset(), reader.offset()]
			val = MalList.fromSeq(MalSymbol.create('quote'), readForm(reader))
			break
		case '`':
			reader.next()
			sugar = [reader.prevEndOffset(), reader.offset()]
			val = MalList.fromSeq(MalSymbol.create('quasiquote'), readForm(reader))
			break
		case '~':
			reader.next()
			sugar = [reader.prevEndOffset(), reader.offset()]
			val = MalList.fromSeq(MalSymbol.create('unquote'), readForm(reader))
			break
		case '~@':
			reader.next()
			sugar = [reader.prevEndOffset(), reader.offset()]
			val = MalList.fromSeq(
				MalSymbol.create('splice-unquote'),
				readForm(reader),
			)
			break
		case '#': {
			reader.next()
			const type = reader.peek()
			if (type === '(') {
				// Syntactic sugar for anonymous function: #( )
				sugar = [reader.prevEndOffset(), reader.offset()]
				val = MalList.fromSeq(MalSymbol.create('fn-sugar'), readForm(reader))
			} else {
				throw new Error('Invalid # syntactic sugar')
			}
			break
		}
		case '^': {
			// Syntactic sugar for with-meta
			reader.next()
			sugar = [reader.prevEndOffset(), reader.offset()]
			const meta = readForm(reader)
			sugar.push(reader.prevEndOffset(), reader.offset())
			const expr = readForm(reader)
			val = MalList.fromSeq(MalSymbol.create('with-meta-sugar'), meta, expr)
			break
		}
		case '@':
			// Syntactic sugar for deref
			reader.next()
			sugar = [reader.prevEndOffset(), reader.offset()]
			val = MalList.fromSeq(MalSymbol.create('deref'), readForm(reader))
			break
		// list
		case ')':
			throw new MalReadError("unexpected ')'")
		case '(':
			val = readList(reader)
			break
		// vector
		case ']':
			throw new Error("unexpected ']'")
		case '[':
			val = readVector(reader)
			break
		// hash-map
		case '}':
			throw new Error("unexpected '}'")
		case '{':
			val = readMap(reader)
			break

		// atom
		default:
			val = readAtom(reader)
	}

	if (sugar) {
		const _val = val as MalList

		// Save str info
		const formEnd = reader.prevEndOffset()

		_val.sugar = token

		const delimiters = ['']

		sugar.push(formEnd)

		for (let i = 0; i < sugar.length - 1; i += 2) {
			delimiters.push(reader.strInRange(sugar[i], sugar[i + 1]))
		}

		delimiters.push('')
		_val.delimiters = delimiters
	}

	return val
}

export default function readStr(str: string): MalVal {
	const tokens = tokenize(str)
	if (tokens.length === 0) {
		throw new MalBlankException()
	}
	const reader = new Reader(tokens, str)
	const exp = readForm(reader)

	if (reader.index < tokens.length - 1) {
		throw new MalReadError('Invalid end of file')
	}

	reconstructTree(exp)

	return exp
}

export function jsToMal(obj: number | MalNumber): MalNumber
export function jsToMal(obj: string | MalString): MalString
export function jsToMal(obj: MalKeyword): MalKeyword
export function jsToMal(obj: MalSymbol): MalSymbol
export function jsToMal(obj: boolean | MalBoolean): MalBoolean
export function jsToMal(obj: null | undefined | MalNil): MalNil
export function jsToMal(obj: MalCallableValue | MalFn): MalFn
export function jsToMal(obj: MalList): MalList
export function jsToMal(obj: any[] | MalVector): MalVector
export function jsToMal(obj: {[k: string]: any} | MalMap): MalMap
export function jsToMal(obj: MalAtom): MalAtom
export function jsToMal(obj: any): MalVal {
	if (isMal(obj)) {
		// MalVal
		return obj
	} else if (Array.isArray(obj)) {
		// Vector
		return MalVector.create(obj.map(jsToMal))
	} else if (obj instanceof Function) {
		// Function
		return MalFn.create(obj)
	} else if (obj instanceof Object) {
		// Map
		const ret: {[k: string]: MalVal} = {}
		for (const [key, value] of Object.entries(obj)) {
			ret[key] = jsToMal(value as any)
		}
		return MalMap.create(ret)
	} else if (obj === null || obj === undefined) {
		// Nil
		return MalNil.create()
	} else {
		switch (typeof obj) {
			case 'number':
				return MalNumber.create(obj)
			case 'string':
				return MalString.create(obj)
			case 'boolean':
				return MalBoolean.create(obj)
			default:
				return MalNil.create()
		}
	}
}

export const slurp = (() => {
	if (isNodeJS) {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const fs = require('fs')
		return (url: string) => {
			return fs.readFileSync(url, 'UTF-8')
		}
	} else {
		return (url: string) => {
			const req = new XMLHttpRequest()
			req.open('GET', url, false)
			req.send()
			if (req.status !== 200) {
				throw new MalError(`Failed to slurp file: ${url}`)
			}
			return req.responseText
		}
	}
})()

export function reconstructTree(exp: MalVal) {
	seek(exp)

	function seek(exp: MalVal, parent?: {ref: MalColl; index: number}) {
		if (parent) {
			exp.parent = parent
		}

		if (isMalSeq(exp)) {
			exp.value.forEach((child, index) => seek(child, {ref: exp, index}))
		} else if (MalMap.is(exp)) {
			exp
				.entries()
				.forEach(([, child], index) => seek(child, {ref: exp, index}))
		}
	}
}