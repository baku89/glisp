import {
	keywordFor,
	assocBang,
	LispError,
	symbolFor as S,
	MalTreeWithRange,
	isMap,
	M_START,
	M_END,
	MalMap,
	MalVal,
	M_META,
	markMalVector,
	M_OUTER
} from './types'

class Reader {
	private tokens: string[] | [string, number][]
	private strlen: number
	private position: number

	constructor(tokens: string[], originalStr: string) {
		this.tokens = [...tokens]
		this.strlen = originalStr.length
		this.position = 0
	}

	public next() {
		const token = this.tokens[this.position++]
		return Array.isArray(token) ? token[0] : token
	}

	public peek() {
		const token = this.tokens[this.position]
		return Array.isArray(token) ? token[0] : token
	}

	public getPosition(): number {
		const token = this.tokens[this.position]
		return (token !== undefined ? token[1] : this.strlen) as number
	}

	public getLastPosition(): number {
		const token = this.tokens[this.position - 1]
		if (token === undefined) {
			throw new Error('Cannot determine prev position')
		}
		return (token[1] as number) + token[0].length
	}
}

function tokenize(str: string, outputPosition = false) {
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

		if (outputPosition) {
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
function readList(
	reader: Reader,
	outputPosition: boolean,
	start = '(',
	end = ')'
) {
	const ast: any = []

	if (outputPosition) {
		ast[M_START] = reader.getPosition()
	}

	let token = reader.next()

	if (token !== start) {
		throw new LispError(`[READ] expected '${start}'`)
	}

	while ((token = reader.peek()) !== end) {
		if (!token) {
			throw new LispError(`[READ] expected '${end}', got EOF`)
		}

		// eslint-disable-next-line @typescript-eslint/no-use-before-define
		ast.push(readForm(reader, outputPosition))
	}

	if (outputPosition) {
		ast[M_END] = reader.getPosition() + token.length
	}

	reader.next()
	return ast
}

// read vector of tokens
function readVector(reader: Reader, outputPosition: boolean) {
	return markMalVector(readList(reader, outputPosition, '[', ']'))
}

// read hash-map key/value pairs
function readHashMap(reader: Reader, outputPosition: boolean) {
	const lst = readList(reader, outputPosition, '{', '}')
	const map = assocBang({}, ...lst)
	if (outputPosition) {
		;(map as MalTreeWithRange)[M_START] = lst[M_START]
		;(map as MalTreeWithRange)[M_END] = lst[M_END]
	}
	return map
}

function readForm(reader: Reader, outputPosition: boolean): any {
	const token = reader.peek()
	const pos = outputPosition ? reader.getPosition() : -1
	let val

	switch (token) {
		// reader macros/transforms
		case ';':
			val = null
			break
		case "'":
			reader.next()
			val = [S('quote'), readForm(reader, outputPosition)]
			break
		case '`':
			reader.next()
			val = [S('quasiquote'), readForm(reader, outputPosition)]
			break
		case '~':
			reader.next()
			val = [S('unquote'), readForm(reader, outputPosition)]
			break
		case '~@':
			reader.next()
			val = [S('splice-unquote'), readForm(reader, outputPosition)]
			break
		case '#':
			reader.next()
			val = [S('fn'), [], readForm(reader, outputPosition)]
			break
		case '^': {
			reader.next()
			const meta = readForm(reader, outputPosition)
			val = [S('with-meta'), readForm(reader, outputPosition), meta]
			break
		}
		case '@':
			reader.next()
			val = [S('deref'), readForm(reader, outputPosition)]
			break
		// list
		case ')':
			throw new LispError("unexpected ')'")
		case '(':
			val = readList(reader, outputPosition)
			break
		// vector
		case ']':
			throw new Error("unexpected ']'")
		case '[':
			val = readVector(reader, outputPosition)
			break
		// hash-map
		case '}':
			throw new Error("unexpected '}'")
		case '{':
			val = readHashMap(reader, outputPosition)
			break

		// atom
		default:
			val = readAtom(reader)
	}

	if (
		outputPosition &&
		val instanceof Object &&
		(val as MalTreeWithRange)[M_START] === undefined
	) {
		;(val as MalTreeWithRange)[M_START] = pos
		;(val as MalTreeWithRange)[M_END] = reader.getLastPosition()
	}

	return val
}

export function findAstByPosition(
	ast: any,
	pos: number
): MalTreeWithRange | null {
	if (
		ast instanceof Object &&
		(ast as MalTreeWithRange)[M_START] !== undefined
	) {
		if (
			(ast as MalTreeWithRange)[M_START] <= pos &&
			pos <= (ast as MalTreeWithRange)[M_END]
		) {
			for (const child of ast) {
				const ret = findAstByPosition(child, pos)
				if (ret !== null) {
					return ret
				}
			}
			return ast
		} else {
			return null
		}
	} else {
		return null
	}
}

export function findAstByRange(
	ast: any,
	start: number,
	end: number
): MalTreeWithRange | null {
	if (
		ast instanceof Object &&
		(ast as MalTreeWithRange)[M_START] !== undefined
	) {
		if (
			(ast as MalTreeWithRange)[M_START] <= start &&
			end <= (ast as MalTreeWithRange)[M_END]
		) {
			if (isMap(ast)) {
				for (const child of Object.values(ast)) {
					const ret = findAstByRange(child, start, end)
					if (ret !== null) {
						return ret
					}
				}
				return ast as MalTreeWithRange
			} else {
				for (const child of ast) {
					const ret = findAstByRange(child, start, end)
					if (ret !== null) {
						return ret
					}
				}
				return ast
			}
		} else {
			return null
		}
	} else {
		return null
	}
}

export function convertJSObjectToMalMap(obj: MalVal): MalVal {
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

export function attachMetaToJSObject(obj: any, meta: any): MalVal {
	if (obj instanceof Object) {
		obj[M_META] = convertJSObjectToMalMap(meta)
	}

	return obj
}

export class BlankException extends Error {}

function saveOuter(ast: MalVal, outer: MalVal) {
	if (ast !== null && typeof ast === 'object') {
		;(ast as any)[M_OUTER] = outer

		const children = Array.isArray(ast)
			? ast
			: isMap(ast)
			? Object.values(ast)
			: null

		if (children) {
			children.forEach(c => saveOuter(c, ast))
		}
	}
}

export default function readStr(str: string, outputPosition = false) {
	const tokens = tokenize(str, outputPosition) as string[]
	if (tokens.length === 0) {
		throw new BlankException()
	}
	const ast = readForm(new Reader(tokens, str), outputPosition)

	if (outputPosition) {
		saveOuter(ast, null)
	}

	return ast
}
