import {
	keywordFor,
	assocBang,
	LispError,
	symbolFor as S,
	MalNode,
	MalNodeMap,
	isMap,
	MalMap,
	MalVal,
	markMalVector,
	M_OUTER,
	isMalNode,
	M_ELMSTRS,
	M_DELIMITERS,
	M_KEYS,
	M_ISSUGAR,
	M_OUTER_INDEX,
	MalSelection,
	MalNodeSelection,
	getMalFromSelection,
	isSeq
} from './types'
import printExp from './printer'

const S_QUOTE = S('quote')
const S_QUASIQUOTE = S('quasiquote')
const S_UNQUOTE = S('unquote')
const S_SPLICE_UNQUOTE = S('splice-unquote')
const S_FN_SUGAR = S('fn-sugar')
const S_WITH_META_SUGAR = S('with-meta-sugar')
const S_DEREF = S('deref')

class Reader {
	private tokens: string[] | [string, number][]
	private str: string
	private strlen: number
	private _index: number

	constructor(tokens: string[], str: string) {
		this.tokens = [...tokens]
		this.str = str
		this.strlen = str.length
		this._index = 0
	}

	public next() {
		const token = this.tokens[this._index++]
		return Array.isArray(token) ? token[0] : token
	}

	public peek(pos = this._index) {
		const token = this.tokens[pos]
		return Array.isArray(token) ? token[0] : token
	}

	public get index() {
		return this._index
	}

	public getStr(start: number, end: number) {
		return this.str.slice(start, end)
	}

	public offset(pos = this._index): number {
		const token = this.tokens[pos]
		return (token !== undefined ? token[1] : this.strlen) as number
	}

	public endOffset(pos = this._index): number {
		const token = this.tokens[pos]
		return (token !== undefined
			? (token[1] as number) + token[0].length
			: this.strlen) as number
	}

	public prevEndOffset(): number {
		return this.endOffset(this._index - 1)
	}
}

function tokenize(str: string, saveStr = false) {
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

		if (saveStr) {
			spaceMatch = spaceRe.exec(match[0])
			spaceOffset = spaceMatch ? spaceMatch[0].length : 0

			results.push([match[1], match.index + spaceOffset] as [string, number])
		} else {
			results.push(match[1])
		}
	}
	return results
}

function readAtom(reader: Reader) {
	const token = reader.next()

	if (typeof token === 'string') {
		if (token.match(/^[-+]?[0-9]+$/)) {
			// integer
			return parseInt(token, 10)
		} else if (token.match(/^[-+]?([0-9]*\.[0-9]+|[0-9]+)$/)) {
			// float
			return parseFloat(token)
		} else if (token.match(/^"(?:\\.|[^\\"])*"$/)) {
			// string
			return token
				.slice(1, token.length - 1)
				.replace(/\\(.)/g, (_: any, c: string) => (c === 'n' ? '\n' : c)) // handle new line
		} else if (token[0] === '"') {
			throw new LispError("[READ] expected '\"', got EOF")
		} else if (token[0] === ':') {
			return keywordFor(token.slice(1))
		} else if (token === 'nil') {
			return null
		} else if (token === 'true') {
			return true
		} else if (token === 'false') {
			return false
		} else {
			// symbol
			return S(token as string)
		}
	} else {
		return token
	}
}

// read list of tokens
function readList(reader: Reader, saveStr: boolean, start = '(', end = ')') {
	const exp: any = []

	let elmStrs: any = null,
		delimiters: string[] | null = null

	let token = reader.next()

	if (token !== start) {
		throw new LispError(`[READ] expected '${start}'`)
	}

	if (saveStr) {
		elmStrs = []
		delimiters = []
	}

	let elmStart = 0

	while ((token = reader.peek()) !== end) {
		if (!token) {
			throw new LispError(`[READ] expected '${end}', got EOF`)
		}

		if (saveStr) {
			// Save delimiter
			const delimiter = reader.getStr(reader.prevEndOffset(), reader.offset())
			delimiters?.push(delimiter)

			elmStart = reader.offset()
		}

		// eslint-disable-next-line @typescript-eslint/no-use-before-define
		exp.push(readForm(reader, saveStr))

		if (saveStr) {
			const elm = reader.getStr(elmStart, reader.prevEndOffset())
			elmStrs?.push(elm)
		}
	}

	if (saveStr) {
		// Save a delimiter between a last element and a end tag
		const delimiter = reader.getStr(reader.prevEndOffset(), reader.offset())
		delimiters?.push(delimiter)

		// Save string information
		exp[M_DELIMITERS] = delimiters
		exp[M_ELMSTRS] = elmStrs
	}

	reader.next()
	return exp
}

// read vector of tokens
function readVector(reader: Reader, saveStr: boolean) {
	return markMalVector(readList(reader, saveStr, '[', ']'))
}

// read hash-map key/value pairs
function readHashMap(reader: Reader, saveStr: boolean) {
	const lst = readList(reader, saveStr, '{', '}')
	const map = assocBang({}, ...lst) as MalNodeMap
	if (saveStr) {
		const keys = []
		const elmStrs = []

		for (let i = 0; i < lst.length; i += 2) {
			keys.push(lst[i])
			elmStrs.push(lst[M_ELMSTRS][i + 1])
		}

		map[M_KEYS] = keys
		map[M_ELMSTRS] = elmStrs
		map[M_DELIMITERS] = lst[M_DELIMITERS]
	}
	return map
}

function readForm(reader: Reader, saveStr: boolean): any {
	let val

	// For syntaxtic sugars
	const startIdx = reader.index

	// Set offset array value if the form is syntaxic sugar.
	// the offset array is like [<end of arg0>, <start of arg1>]
	let sugar: number[] | null = null

	switch (reader.peek()) {
		// reader macros/transforms
		case ';':
			val = null
			break
		case "'":
			reader.next()
			if (saveStr) sugar = [reader.prevEndOffset(), reader.offset()]
			val = [S_QUOTE, readForm(reader, saveStr)]
			break
		case '`':
			reader.next()
			if (saveStr) sugar = [reader.prevEndOffset(), reader.offset()]
			val = [S_QUASIQUOTE, readForm(reader, saveStr)]
			break
		case '~':
			reader.next()
			if (saveStr) sugar = [reader.prevEndOffset(), reader.offset()]
			val = [S_UNQUOTE, readForm(reader, saveStr)]
			break
		case '~@':
			reader.next()
			if (saveStr) sugar = [reader.prevEndOffset(), reader.offset()]
			val = [S_SPLICE_UNQUOTE, readForm(reader, saveStr)]
			break
		case '#': {
			reader.next()
			const type = reader.peek()

			if (type === '(') {
				if (saveStr) sugar = [reader.prevEndOffset(), reader.offset()]
				val = [S_FN_SUGAR, readForm(reader, saveStr)]
			} else if (type[0] === '"') {
				if (saveStr) sugar = [reader.prevEndOffset(), reader.offset()]
				const meta = readForm(reader, saveStr)
				if (sugar) sugar.push(reader.prevEndOffset(), reader.offset())
				const expr = readForm(reader, saveStr)
				val = [S('set-id'), meta, expr]
			} else {
				switch (type) {
					case 'f32':
						reader.next()
						if (saveStr) sugar = [reader.prevEndOffset(), reader.offset()]
						val = [S('f32'), readVector(reader, saveStr)]
						break
				}
			}
			break
		}
		case '^': {
			reader.next()
			if (saveStr) sugar = [reader.prevEndOffset(), reader.offset()]
			const meta = readForm(reader, saveStr)
			if (sugar) sugar.push(reader.prevEndOffset(), reader.offset())
			const expr = readForm(reader, saveStr)
			val = [S_WITH_META_SUGAR, meta, expr]
			break
		}
		case '@':
			reader.next()
			if (saveStr) sugar = [reader.prevEndOffset(), reader.offset()]
			val = [S_DEREF, readForm(reader, saveStr)]
			break
		// list
		case ')':
			throw new LispError("unexpected ')'")
		case '(':
			val = readList(reader, saveStr)
			break
		// vector
		case ']':
			throw new Error("unexpected ']'")
		case '[':
			val = readVector(reader, saveStr)
			break
		// hash-map
		case '}':
			throw new Error("unexpected '}'")
		case '{':
			val = readHashMap(reader, saveStr)
			break

		// atom
		default:
			val = readAtom(reader)
	}

	if (sugar) {
		// Save str info
		const annotator = reader.peek(startIdx)
		const formEnd = reader.prevEndOffset()

		val[M_ISSUGAR] = true

		const delimiters = ['']
		const elmStrs = [annotator]

		sugar.push(formEnd)

		for (let i = 0; i < sugar.length - 1; i += 2) {
			delimiters.push(reader.getStr(sugar[i], sugar[i + 1]))
			elmStrs.push(reader.getStr(sugar[i + 1], sugar[i + 2]))
		}

		delimiters.push('')

		val[M_DELIMITERS] = delimiters
		val[M_ELMSTRS] = elmStrs
	}

	return val
}

export function getRangeOfExp(exp: MalNode): [number, number] | null {
	function calcOffset(exp: MalNode): number {
		if (!exp[M_OUTER]) {
			return 0
		}

		const outer = exp[M_OUTER]
		let offset = calcOffset(outer)

		printExp(outer, true, true)

		if (isSeq(outer)) {
			const index = exp[M_OUTER_INDEX]
			offset +=
				(outer[M_ISSUGAR] ? 0 : 1) +
				outer[M_DELIMITERS].slice(0, index + 1).join('').length +
				outer[M_ELMSTRS].slice(0, index).join('').length
		} else if (isMap(outer)) {
			const index = exp[M_OUTER_INDEX]
			offset +=
				1 /* '{'.length */ +
				outer[M_DELIMITERS].slice(0, (index + 1) * 2).join('').length +
				outer[M_KEYS].slice(0, index + 1).join('').length +
				outer[M_ELMSTRS].slice(0, index).join('').length
		}

		return offset
	}

	if (!isMalNode(exp)) {
		return null
	}

	const expLength = printExp(exp, true, true).length
	const offset = calcOffset(exp)

	return [offset, offset + expLength]
}

export function getRangeOfExp2(sel: MalSelection): [number, number] | null {
	function calcOffset({outer, index}: MalNodeSelection): number {
		if (!outer) {
			return 0
		}

		let offset = calcOffset({
			outer: outer[M_OUTER],
			index: outer[M_OUTER_INDEX]
		})

		if (Array.isArray(outer)) {
			offset +=
				(outer[M_ISSUGAR] ? 0 : 1) +
				outer[M_DELIMITERS].slice(0, index + 1).join('').length +
				outer[M_ELMSTRS].slice(0, index).join('').length
		} else {
			// Map
			offset +=
				1 /* '{'.length */ +
				outer[M_DELIMITERS].slice(0, (index + 1) * 2).join('').length +
				outer[M_KEYS].slice(0, index + 1).join('').length +
				outer[M_ELMSTRS].slice(0, index).join('').length
		}

		return offset
	}

	const exp = getMalFromSelection(sel)

	const expLength = printExp(exp).length

	const offset = 'root' in sel ? 0 : calcOffset(sel)

	return [offset, offset + expLength]
}

export function findExpByRange(
	exp: MalVal,
	start: number,
	end: number
): MalNode | null {
	if (!isMalNode(exp)) {
		// If Atom
		return null
	}

	// Creates a caches of children at the same time calculating length of exp
	const expLen = printExp(exp, true, true).length

	if (!(0 <= start && end <= expLen)) {
		// Does not fit within the exp
		return null
	}

	if (Array.isArray(exp)) {
		// Sequential

		// Add the length of open-paren
		let offset = exp[M_ISSUGAR] ? 0 : 1

		// Search Children
		for (let i = 0; i < exp.length; i++) {
			const child = exp[i]
			offset += exp[M_DELIMITERS][i].length

			const ret = findExpByRange(child, start - offset, end - offset)
			if (ret !== null) {
				return ret
			}

			// For #() syntaxtic sugar
			if (i < exp[M_ELMSTRS].length) {
				offset += exp[M_ELMSTRS][i].length
			}
		}
	} else if (isMap(exp)) {
		// Hash Map

		let offset = 1 // length of '{'

		const keys = exp[M_KEYS]
		const elmStrs = exp[M_ELMSTRS]
		const delimiters = exp[M_DELIMITERS]

		// Search Children
		// { <d0> <:e0>s <d1> <e1> ... }
		for (let i = 0; i < keys.length; i++) {
			const child = exp[keys[i]]

			offset +=
				delimiters[i * 2].length + keys[i].length + delimiters[i * 2 + 1].length

			const ret = findExpByRange(child, start - offset, end - offset)
			if (ret !== null) {
				return ret
			}

			offset += elmStrs[i].length
		}
	}

	return exp
}

export function convertJSObjectToMalMap(obj: any): MalVal {
	if (isMap(obj)) {
		const ret: MalMap = {}
		for (const [key, value] of Object.entries(obj)) {
			ret[keywordFor(key)] = convertJSObjectToMalMap(value)
		}
		return ret
	} else if (Array.isArray(obj)) {
		return markMalVector(obj.map(v => convertJSObjectToMalMap(v)))
	} else {
		return obj
	}
}

export class BlankException extends Error {}

export function saveOuter(exp: MalVal, outer: MalVal, index?: number) {
	if (isMalNode(exp) && !(M_OUTER in exp)) {
		if (isMalNode(outer) && index !== undefined) {
			exp[M_OUTER] = outer
			exp[M_OUTER_INDEX] = index
		}

		if (isMap(exp) && !(M_KEYS in exp)) {
			exp[M_KEYS] = Object.keys(exp)
		}

		const children: MalVal[] | null = Array.isArray(exp)
			? exp
			: isMap(exp)
			? exp[M_KEYS].map(k => exp[k])
			: null

		if (children) {
			children.forEach((child, index) => saveOuter(child, exp, index))
		}
	}
}

export default function readStr(str: string, saveStr = false): MalVal {
	const tokens = tokenize(str, saveStr) as string[]
	if (tokens.length === 0) {
		throw new BlankException()
	}
	const reader = new Reader(tokens, str)
	const exp = readForm(reader, saveStr)

	if (reader.index < tokens.length - 1) {
		throw new LispError('Invalid end of file')
	}

	if (saveStr) {
		saveOuter(exp, null)
	}

	return exp
}
