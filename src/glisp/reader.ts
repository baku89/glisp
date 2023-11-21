import {M_DELIMITERS, M_ISLIST, M_ISSUGAR} from './symbols'
import {
	assocBang,
	createList as L,
	Expr,
	ExprMap,
	ExprSeq,
	GlispError,
	keywordFor,
	symbolFor as S,
} from './types'
import {markParent} from './utils'

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
			throw new GlispError("Expected '\"', got EOF")
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
function readVector(reader: Reader, start = '[', end = ']') {
	const exp: any = []

	const elmStrs: string[] = []
	const delimiters: string[] = []

	let token = reader.next()

	if (token !== start) {
		throw new GlispError(`Expected '${start}'`)
	}

	let elmStart = 0

	while ((token = reader.peek()) !== end) {
		if (!token) {
			throw new GlispError(`Expected '${end}', got EOF`)
		}

		// Save delimiter
		const delimiter = reader.getStr(reader.prevEndOffset(), reader.offset())
		delimiters.push(delimiter)

		elmStart = reader.offset()

		// eslint-disable-next-line @typescript-eslint/no-use-before-define
		exp.push(readForm(reader))

		const elm = reader.getStr(elmStart, reader.prevEndOffset())
		elmStrs.push(elm)
	}

	// Save a delimiter between a last element and a end tag
	const delimiter = reader.getStr(reader.prevEndOffset(), reader.offset())
	delimiters.push(delimiter)

	// Save string information
	exp[M_DELIMITERS] = delimiters

	reader.next()
	return exp
}

// read vector of tokens
function readList(reader: Reader) {
	const exp = readVector(reader, '(', ')')
	;(exp as ExprSeq)[M_ISLIST] = true
	return exp
}

// read hash-map key/value pairs
function readHashMap(reader: Reader) {
	const lst = readVector(reader, '{', '}')
	const map = assocBang({} as ExprMap, ...lst) as ExprMap
	map[M_DELIMITERS] = lst[M_DELIMITERS]
	return map
}

function readForm(reader: Reader): any {
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
			sugar = [reader.prevEndOffset(), reader.offset()]
			val = L(S_QUOTE, readForm(reader))
			break
		case '`':
			reader.next()
			sugar = [reader.prevEndOffset(), reader.offset()]
			val = L(S_QUASIQUOTE, readForm(reader))
			break
		case '~':
			reader.next()
			sugar = [reader.prevEndOffset(), reader.offset()]
			val = L(S_UNQUOTE, readForm(reader))
			break
		case '~@':
			reader.next()
			sugar = [reader.prevEndOffset(), reader.offset()]
			val = L(S_SPLICE_UNQUOTE, readForm(reader))
			break
		case '#': {
			reader.next()
			const type = reader.peek()
			if (type === '(') {
				// Syntactic sugar for anonymous function: #( )
				sugar = [reader.prevEndOffset(), reader.offset()]
				val = L(S_FN_SUGAR, readForm(reader))
			} else if (type[0] === '"') {
				// Syntactic sugar for set-id
				sugar = [reader.prevEndOffset(), reader.offset()]
				const meta = readForm(reader)
				if (sugar) sugar.push(reader.prevEndOffset(), reader.offset())
				const expr = readForm(reader)
				val = L(S('set-id'), meta, expr)
			}
			break
		}
		case '^': {
			// Syntactic sugar for with-meta
			reader.next()
			sugar = [reader.prevEndOffset(), reader.offset()]
			const meta = readForm(reader)
			if (sugar) sugar.push(reader.prevEndOffset(), reader.offset())
			const expr = readForm(reader)
			val = L(S_WITH_META_SUGAR, meta, expr)
			break
		}
		case '@':
			// Syntactic sugar for deref
			reader.next()
			sugar = [reader.prevEndOffset(), reader.offset()]
			val = L(S_DEREF, readForm(reader))
			break
		// list
		case ')':
			throw new GlispError("unexpected ')'")
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

	val[M_ISSUGAR] = !!sugar

	if (sugar) {
		// Save str info
		const annotator = reader.peek(startIdx)
		const formEnd = reader.prevEndOffset()

		const delimiters = ['']
		const elmStrs = [annotator]

		sugar.push(formEnd)

		for (let i = 0; i < sugar.length - 1; i += 2) {
			delimiters.push(reader.getStr(sugar[i], sugar[i + 1]))
			elmStrs.push(reader.getStr(sugar[i + 1], sugar[i + 2]))
		}

		delimiters.push('')

		val[M_DELIMITERS] = delimiters
	}

	return val
}

export class BlankException extends Error {}

export function readStr(str: string): Expr {
	const tokens = tokenize(str) as string[]
	if (tokens.length === 0) {
		throw new BlankException()
	}
	const reader = new Reader(tokens, str)
	const exp = readForm(reader)

	if (reader.index < tokens.length - 1) {
		throw new GlispError('Invalid end of file')
	}

	markParent(exp)

	return exp
}
