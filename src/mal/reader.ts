import printExp from './printer'
import {
	assocBang,
	createList as L,
	getName,
	isMap,
	isNode,
	isSeq,
	isSymbol,
	keywordFor,
	M_DELIMITERS,
	M_ELMSTRS,
	M_ISLIST,
	M_ISSUGAR,
	M_OUTER,
	M_OUTER_INDEX,
	MalError,
	MalMap,
	MalNode,
	MalSeq,
	MalVal,
	symbolFor as S,
} from './types'

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
		return (
			token !== undefined ? (token[1] as number) + token[0].length : this.strlen
		) as number
	}

	public prevEndOffset(): number {
		return this.endOffset(this._index - 1)
	}
}

function tokenize(str: string, saveStr = false) {
	const re =
		// eslint-disable-next-line no-useless-escape
		/[\s,]*(~@|[\[\]{}()'`~^@#]|"(?:\\.|[^\\"])*"|;.*|[^\s\[\]{}('"`,;)]*)/g
	let match = null
	const spaceRe = /^[\s,]*/
	let spaceMatch = null,
		spaceOffset = null
	const results = []

	while ((match = re.exec(str)) && match[1] !== '') {
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
			throw new MalError("Expected '\"', got EOF")
		} else if (token[0] === ':') {
			return keywordFor(token.slice(1))
		} else if (token === 'nil') {
			return null
		} else if (token === 'true') {
			return true
		} else if (token === 'false') {
			return false
		} else if (/^NaN$|^-?Infinity$/.test(token)) {
			return parseFloat(token)
		} else {
			// symbol
			return S(token as string)
		}
	} else {
		return token
	}
}

// read list of tokens
function readVector(reader: Reader, saveStr: boolean, start = '[', end = ']') {
	const exp: any = []

	let elmStrs: any = null,
		delimiters: string[] | null = null

	let token = reader.next()

	if (token !== start) {
		throw new MalError(`Expected '${start}'`)
	}

	if (saveStr) {
		elmStrs = []
		delimiters = []
	}

	let elmStart = 0

	while ((token = reader.peek()) !== end) {
		if (!token) {
			throw new MalError(`Expected '${end}', got EOF`)
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
function readList(reader: Reader, saveStr: boolean) {
	const exp = readVector(reader, saveStr, '(', ')')
	;(exp as MalSeq)[M_ISLIST] = true
	return exp
}

// read hash-map key/value pairs
function readHashMap(reader: Reader, saveStr: boolean) {
	const lst = readVector(reader, saveStr, '{', '}')
	const map = assocBang({} as MalMap, ...lst) as MalMap
	if (saveStr) {
		const elmStrs = []

		for (let i = 0; i < lst.length; i += 2) {
			elmStrs.push(lst[M_ELMSTRS][i], lst[M_ELMSTRS][i + 1])
		}

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
			val = L(S_QUOTE, readForm(reader, saveStr))
			break
		case '`':
			reader.next()
			if (saveStr) sugar = [reader.prevEndOffset(), reader.offset()]
			val = L(S_QUASIQUOTE, readForm(reader, saveStr))
			break
		case '~':
			reader.next()
			if (saveStr) sugar = [reader.prevEndOffset(), reader.offset()]
			val = L(S_UNQUOTE, readForm(reader, saveStr))
			break
		case '~@':
			reader.next()
			if (saveStr) sugar = [reader.prevEndOffset(), reader.offset()]
			val = L(S_SPLICE_UNQUOTE, readForm(reader, saveStr))
			break
		case '#': {
			reader.next()
			const type = reader.peek()
			if (type === '(') {
				// Syntactic sugar for anonymous function: #( )
				if (saveStr) sugar = [reader.prevEndOffset(), reader.offset()]
				val = L(S_FN_SUGAR, readForm(reader, saveStr))
			} else if (type[0] === '"') {
				// Syntactic sugar for set-id
				if (saveStr) sugar = [reader.prevEndOffset(), reader.offset()]
				const meta = readForm(reader, saveStr)
				if (sugar) sugar.push(reader.prevEndOffset(), reader.offset())
				const expr = readForm(reader, saveStr)
				val = L(S('set-id'), meta, expr)
			}
			break
		}
		case '^': {
			// Syntactic sugar for with-meta
			reader.next()
			if (saveStr) sugar = [reader.prevEndOffset(), reader.offset()]
			const meta = readForm(reader, saveStr)
			if (sugar) sugar.push(reader.prevEndOffset(), reader.offset())
			const expr = readForm(reader, saveStr)
			val = L(S_WITH_META_SUGAR, meta, expr)
			break
		}
		case '@':
			// Syntactic sugar for deref
			reader.next()
			if (saveStr) sugar = [reader.prevEndOffset(), reader.offset()]
			val = L(S_DEREF, readForm(reader, saveStr))
			break
		// list
		case ')':
			throw new MalError("unexpected ')'")
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

export function getRangeOfExp(
	exp: MalNode,
	root?: MalNode
): [number, number] | null {
	function isParent(parent: MalNode, child: MalNode): boolean {
		if (parent === child) {
			return true
		}

		const outer = child[M_OUTER]
		if (!outer) {
			return false
		} else if (outer === parent) {
			return true
		} else {
			return isParent(parent, outer)
		}
	}

	function calcOffset(exp: MalNode): number {
		if (!exp[M_OUTER] || exp === root) {
			return 0
		}

		const outer = exp[M_OUTER]
		let offset = calcOffset(outer)

		// Creates a delimiter cache
		printExp(outer)

		if (isSeq(outer)) {
			const index = exp[M_OUTER_INDEX]
			offset +=
				(outer[M_ISSUGAR] ? 0 : 1) +
				outer[M_DELIMITERS].slice(0, index + 1).join('').length +
				outer[M_ELMSTRS].slice(0, index).join('').length
		} else if (isMap(outer)) {
			const index = exp[M_OUTER_INDEX]
			offset +=
				1 /* '{'.   length */ +
				outer[M_DELIMITERS].slice(0, (index + 1) * 2).join('').length +
				outer[M_ELMSTRS].slice(0, index * 2 + 1).join('').length
		}

		return offset
	}

	const isExpOutsideOfParent = root && !isParent(root, exp)

	if (!isNode(exp) || isExpOutsideOfParent) {
		return null
	}

	const expLength = printExp(exp, true).length
	const offset = calcOffset(exp)

	return [offset, offset + expLength]
}

export function findExpByRange(
	exp: MalVal,
	start: number,
	end: number
): MalNode | null {
	if (!isNode(exp)) {
		// If Atom
		return null
	}

	// Creates a caches of children at the same time calculating length of exp
	const expLen = printExp(exp, true).length

	if (!(0 <= start && end <= expLen)) {
		// Does not fit within the exp
		return null
	}

	if (isSeq(exp)) {
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

		const keys = Object.keys(exp)
		const elmStrs = exp[M_ELMSTRS]
		const delimiters = exp[M_DELIMITERS]

		// Search Children
		for (let i = 0; i < keys.length; i++) {
			const child = exp[keys[i]]

			// Offsets
			offset +=
				delimiters[i * 2].length + // delimiter before key
				elmStrs[i * 2].length + // key
				delimiters[i * 2 + 1].length // delimiter between key and value

			const ret = findExpByRange(child, start - offset, end - offset)
			if (ret !== null) {
				return ret
			}

			offset += elmStrs[i * 2 + 1].length
		}
	}

	return exp
}

export function convertJSObjectToMalMap(obj: any): MalVal {
	if (Array.isArray(obj)) {
		const ret = obj.map(v => convertJSObjectToMalMap(v))
		return ret
	} else if (isSymbol(obj) || obj instanceof Function) {
		return obj
	} else if (obj instanceof Object) {
		const ret = {} as MalMap
		for (const [key, value] of Object.entries(obj)) {
			ret[keywordFor(key)] = convertJSObjectToMalMap(value)
		}
		return ret
	} else {
		return obj
	}
}

export function convertMalNodeToJSObject(exp: MalVal): any {
	if (isMap(exp)) {
		const ret: {[Key: string]: MalVal} = {}
		for (const [key, value] of Object.entries(exp)) {
			const jsKey = getName(key)
			ret[jsKey] = convertMalNodeToJSObject(value)
		}
		return ret
	} else if (isSeq(exp)) {
		return (exp as MalVal[]).map(e => convertMalNodeToJSObject(e))
	} else {
		return exp
	}
}

export class BlankException extends Error {}

export function reconstructTree(exp: MalVal) {
	if (!isNode(exp)) {
		return
	} else {
		if (isMap(exp)) {
			const keys = Object.keys(exp)
			keys.forEach((key, i) => {
				const e = exp[key]
				if (isNode(e)) {
					e[M_OUTER] = exp
					e[M_OUTER_INDEX] = i
					reconstructTree(e)
				}
			})
		} else {
			exp.forEach((e, i) => {
				if (isNode(e)) {
					e[M_OUTER] = exp
					e[M_OUTER_INDEX] = i
					reconstructTree(e)
				}
			})
		}
	}
}

export default function readStr(str: string, saveStr = true): MalVal {
	const tokens = tokenize(str, saveStr) as string[]
	if (tokens.length === 0) {
		throw new BlankException()
	}
	const reader = new Reader(tokens, str)
	const exp = readForm(reader, saveStr)

	if (reader.index < tokens.length - 1) {
		throw new MalError('Invalid end of file')
	}

	if (saveStr) {
		saveOuter(exp, null)
	}

	return exp

	function saveOuter(exp: MalVal, outer: MalVal, index?: number) {
		if (isNode(exp) /*&& !(M_OUTER in exp)*/) {
			if (isNode(outer) && index !== undefined) {
				exp[M_OUTER] = outer
				exp[M_OUTER_INDEX] = index
			}

			const children: MalVal[] | null = Array.isArray(exp)
				? exp
				: isMap(exp)
				  ? Object.keys(exp).map(k => exp[k])
				  : null

			if (children) {
				children.forEach((child, index) => saveOuter(child, exp, index))
			}
		}
	}
}
