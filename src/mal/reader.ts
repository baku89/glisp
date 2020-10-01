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
} from './types'
import {reconstructTree} from './utils'

class Reader {
	private strlen: number
	private _index: number

	constructor(private tokens: [string, number][], private str: string) {
		this.strlen = str.length
		this._index = 0
	}

	public next() {
		const token = this.tokens[this._index++]
		return token[0]
	}

	public peek(pos = this._index) {
		const token = this.tokens[pos]
		return token[0]
	}

	public get index() {
		return this._index
	}

	public getStr(start: number, end: number) {
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
			throw new MalError("Expected '\"', got EOF")
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

	let elmStrs: string[] = [],
		delimiters: string[] = []

	let token = reader.next()

	if (token !== start) {
		throw new MalError(`Expected '${start}'`)
	}

	let elmStart = 0

	while ((token = reader.peek()) !== end) {
		if (!token) {
			throw new MalError(`Expected '${end}', got EOF`)
		}

		// Save delimiter
		const delimiter = reader.getStr(reader.prevEndOffset(), reader.offset())
		delimiters?.push(delimiter)

		elmStart = reader.offset()

		coll.push(readForm(reader))

		const elm = reader.getStr(elmStart, reader.prevEndOffset())
		elmStrs.push(elm)
	}

	// Save a delimiter between a last element and a end tag
	const delimiter = reader.getStr(reader.prevEndOffset(), reader.offset())
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
	const list = MalVector.create(...coll)
	list.delimiters = delimiters
	return list
}

function readList(reader: Reader) {
	const {coll, delimiters} = readColl(reader, '(', ')')
	const list = MalList.create(...coll)
	list.delimiters = delimiters
	return list
}

// read hash-map key/value pairs
function readHashMap(reader: Reader) {
	const {coll, delimiters} = readColl(reader, '{', '}')
	const map = MalMap.fromMalSeq(...coll)
	map.delimiters = delimiters
	return map
}

function readForm(reader: Reader): any {
	let val: MalVal

	// For syntaxtic sugars
	const startIdx = reader.index

	// Set offset array value if the form is syntaxic sugar.
	// the offset array is like [<end of arg0>, <start of arg1>]
	let sugar: number[] | null = null

	switch (reader.peek()) {
		// reader macros/transforms
		case ';':
			val = MalNil.create()
			break
		case "'":
			reader.next()
			sugar = [reader.prevEndOffset(), reader.offset()]
			val = MalList.create(MalSymbol.create('quote'), readForm(reader))
			break
		case '`':
			reader.next()
			sugar = [reader.prevEndOffset(), reader.offset()]
			val = MalList.create(MalSymbol.create('quasiquote'), readForm(reader))
			break
		case '~':
			reader.next()
			sugar = [reader.prevEndOffset(), reader.offset()]
			val = MalList.create(MalSymbol.create('unquote'), readForm(reader))
			break
		case '~@':
			reader.next()
			sugar = [reader.prevEndOffset(), reader.offset()]
			val = MalList.create(MalSymbol.create('splice-unquote'), readForm(reader))
			break
		case '#': {
			reader.next()
			const type = reader.peek()
			if (type === '(') {
				// Syntactic sugar for anonymous function: #( )
				sugar = [reader.prevEndOffset(), reader.offset()]
				val = MalList.create(MalSymbol.create('fn-sugar'), readForm(reader))
			} else if (type === '@') {
				// Syntactic sugar for ui-annotation #@
				reader.next()
				sugar = [reader.prevEndOffset(), reader.offset()]
				const annotation = readForm(reader)
				sugar.push(reader.prevEndOffset(), reader.offset())
				const expr = readForm(reader)
				val = MalList.create(MalSymbol.create('ui-annotate'), annotation, expr)
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
			val = MalList.create(MalSymbol.create('with-meta-sugar'), meta, expr)
			break
		}
		case '@':
			// Syntactic sugar for deref
			reader.next()
			sugar = [reader.prevEndOffset(), reader.offset()]
			val = MalList.create(MalSymbol.create('deref'), readForm(reader))
			break
		// list
		case ')':
			throw new MalError("unexpected ')'")
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
			val = readHashMap(reader)
			break

		// atom
		default:
			val = readAtom(reader)
	}

	if (sugar) {
		const _val = val as MalList

		// Save str info
		const annotator = reader.peek(startIdx)
		const formEnd = reader.prevEndOffset()

		_val.isSugar = true

		const delimiters = ['']
		const elmStrs = [annotator]

		sugar.push(formEnd)

		for (let i = 0; i < sugar.length - 1; i += 2) {
			delimiters.push(reader.getStr(sugar[i], sugar[i + 1]))
			elmStrs.push(reader.getStr(sugar[i + 1], sugar[i + 2]))
		}

		delimiters.push('')
		_val.delimiters = delimiters
	}

	return val
}

export class BlankException extends Error {}

export default function readStr(str: string): MalVal {
	const tokens = tokenize(str)
	if (tokens.length === 0) {
		throw new BlankException()
	}
	const reader = new Reader(tokens, str)
	const exp = readForm(reader)

	if (reader.index < tokens.length - 1) {
		throw new MalError('Invalid end of file')
	}

	reconstructTree(exp)

	return exp
}
