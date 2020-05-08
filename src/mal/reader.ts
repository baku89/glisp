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
	M_STR,
	M_KEYS,
	M_ISSUGAR,
	M_OUTER_KEY
} from './types'

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
	const re = /[\s,]*(~@|[\[\]{}()'`~^@]|"(?:\\.|[^\\"])*"|;.*|[^\s\[\]{}('"`,;)]*)/g
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

	const formStart = saveStr ? reader.offset() : 0
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
		const formEnd = reader.endOffset()

		// Save a delimiter between a last element and a end tag
		const delimiter = reader.getStr(reader.prevEndOffset(), reader.offset())
		delimiters?.push(delimiter)

		// Save string information
		exp[M_STR] = reader.getStr(formStart, formEnd)
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
	const map = assocBang({}, ...lst)
	if (saveStr) {
		;(map as MalNode)[M_STR] = lst[M_STR]
		;(map as MalNode)[M_ELMSTRS] = lst[M_ELMSTRS]
		;(map as MalNode)[M_DELIMITERS] = lst[M_DELIMITERS]

		const keys = []
		for (let i = 0; i < lst.length; i += 2) {
			keys.push(lst[i])
		}
		;(map as MalNodeMap)[M_KEYS] = keys
	}
	return map
}

function readForm(reader: Reader, saveStr: boolean): any {
	const token = reader.peek()
	let val

	// For syntaxtic sugars
	const startIdx = reader.index

	// Set trusy value if the form is syntaxic sugar.
	// It'll set to true if it's unary operator, an offset array if the sugar takes more than one arguments
	// the offset array is like [<end of arg0>, <start of arg1>] when tri operator
	let sugar: number[] | null = null

	switch (token) {
		// reader macros/transforms
		case ';':
			val = null
			break
		case "'":
			reader.next()
			if (saveStr) sugar = [reader.prevEndOffset(), reader.offset()]
			val = [S('quote'), readForm(reader, saveStr)]
			break
		case '`':
			reader.next()
			if (saveStr) sugar = [reader.prevEndOffset(), reader.offset()]
			val = [S('quasiquote'), readForm(reader, saveStr)]
			break
		case '~':
			reader.next()
			if (saveStr) sugar = [reader.prevEndOffset(), reader.offset()]
			val = [S('unquote'), readForm(reader, saveStr)]
			break
		case '~@':
			reader.next()
			if (saveStr) sugar = [reader.prevEndOffset(), reader.offset()]
			val = [S('splice-unquote'), readForm(reader, saveStr)]
			break
		case '#':
			reader.next()
			if (saveStr) sugar = [reader.prevEndOffset(), reader.offset()]
			val = [S('fn'), [], readForm(reader, saveStr)]
			break
		case '^': {
			reader.next()
			if (saveStr) sugar = [reader.prevEndOffset(), reader.offset()]
			const meta = readForm(reader, saveStr)
			if (sugar) sugar.push(reader.prevEndOffset(), reader.offset())
			const expr = readForm(reader, saveStr)
			val = [S('with-meta-sugar'), meta, expr]
			break
		}
		case '@':
			reader.next()
			if (saveStr) sugar = [reader.prevEndOffset(), reader.offset()]
			val = [S('deref'), readForm(reader, saveStr)]
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
		const annotator = reader.peek(startIdx)

		const formStart = reader.offset(startIdx)
		const formEnd = reader.prevEndOffset()

		val[M_ISSUGAR] = true
		val[M_STR] = reader.getStr(formStart, formEnd)

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

export function getRangeOfExp(exp: MalVal): [number, number] | null {
	function calcOffset(exp: MalVal, outer: MalVal): number {
		let offset = 0

		if (isMalNode(outer)) {
			if (Array.isArray(outer)) {
				const index = (exp as MalNode)[M_OUTER_KEY] as number
				offset +=
					(outer[M_ISSUGAR] ? 0 : 1) +
					outer[M_DELIMITERS].slice(0, index + 1).join('').length +
					outer[M_ELMSTRS].slice(0, index).join('').length
			} else if (isMap(outer)) {
				const index = outer[M_KEYS].indexOf(
					(exp as MalNode)[M_OUTER_KEY] as string
				)
				offset +=
					1 +
					outer[M_DELIMITERS].slice(0, (index + 1) * 2).join('').length +
					outer[M_ELMSTRS].slice(0, index * 2 + 1).join('').length

				// console.log(
				// 	offset,
				// 	index,
				// 	outer[M_DELIMITERS],
				// 	outer[M_DELIMITERS].slice(0, (index + 1) * 2),
				// 	outer[M_ELMSTRS].slice(0, index * 2 + 1),
				// 	outer[M_STR]
				// )
			}

			if (outer[M_OUTER]) {
				offset += calcOffset(outer, outer[M_OUTER])
			}
		}

		return offset
	}

	if (!isMalNode(exp)) {
		return null
	}

	let start = 0,
		end = exp[M_STR].length

	if (exp[M_OUTER]) {
		const offset = calcOffset(exp, exp[M_OUTER])
		start += offset
		end += offset
	}

	return [start, end]
}

export function findExpByRange(
	exp: MalVal,
	start: number,
	end: number
): MalNode | null {
	if (isMalNode(exp)) {
		if (!(M_STR in exp)) {
			// throw new Error('Cannot analyze the range')
			return null
		}
		// Has str cache
		if (0 <= start && end <= exp[M_STR].length) {
			let offset = exp[M_ISSUGAR] ? 0 : 1 /* '('.length */

			if (isMap(exp)) {
				const delimiters = exp[M_DELIMITERS]
				const elmStrs = exp[M_ELMSTRS]
				const keys = exp[M_KEYS]

				// { <d0> <:e0> <d1> <e1> ... }
				for (let i = 0, i2 = 0; i < keys.length; i++, i2 = i * 2) {
					const child = exp[keys[i]]

					offset +=
						delimiters[i2].length +
						elmStrs[i2].length +
						delimiters[i2 + 1].length

					const ret = findExpByRange(child, start - offset, end - offset)
					if (ret !== null) {
						return ret
					}

					offset += elmStrs[i2 + 1].length
				}

				return exp

				return null
			} else {
				// Sequential
				for (let i = 0; i < exp.length; i++) {
					const child = exp[i]
					offset += exp[M_DELIMITERS][i].length

					// console.log('offset->', offset)

					const ret = findExpByRange(child, start - offset, end - offset)
					if (ret !== null) {
						return ret
					}

					offset += exp[M_ELMSTRS][i].length
				}
				return exp
			}
		} else {
			return null
		}
	} else {
		return null
	}
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

export function saveOuter(exp: MalVal, outer: MalVal, key?: string | number) {
	if (isMalNode(exp) && !(M_OUTER in exp)) {
		exp[M_OUTER] = outer
		exp[M_OUTER_KEY] = key

		const children: [string | number, MalVal][] | null = Array.isArray(exp)
			? exp.map((v, i) => [i, v])
			: isMap(exp)
			? Object.entries(exp)
			: null

		if (children) {
			children.forEach(([key, child]) => saveOuter(child, exp, key))
		}
	}
}

export default function readStr(str: string, saveStr = false) {
	const tokens = tokenize(str, saveStr) as string[]
	if (tokens.length === 0) {
		throw new BlankException()
	}
	const exp = readForm(new Reader(tokens, str), saveStr)

	if (saveStr) {
		saveOuter(exp, null)
	}

	return exp
}
