class Reader {
	public tokens: Array<string>
	public position: number

	constructor(tokens: Array<string>) {
		this.tokens = tokens.map(x => x)
		this.position = 0
	}

	public next() {
		return this.tokens[this.position++]
	}

	public peek() {
		return this.tokens[this.position]
	}
}

function tokenize(str: string): any[] {
	// eslint-disable-next-line no-useless-escape
	const re = /[\s,]*(~@|[\[\]{}()'`~^@]|"(?:\\.|[^\\"])*"|;.*|[^\s\[\]{}('"`,;)]*)/g
	let match = null
	const results = []
	while ((match = re.exec(str)) && match[1] != '') {
		if (match[1][0] === ';') {
			continue
		}
		results.push(match[1])
	}
	return results || []
}

function readAtom(reader: Reader) {
	const token = reader.next()

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
		throw new Error("expected '\"', got EOF")
		// } else if (token[0] === ':') {
		// 	return types._keyword(token.slice(1))
	} else if (token === 'nil') {
		return null
	} else if (token === 'true') {
		return true
	} else if (token === 'false') {
		return false
	} else {
		// symbol
		return Symbol.for(token)
	}
}

// read list of tokens
function readList(reader: Reader, start = '(', end = ')') {
	const ast = []

	let token = reader.next()

	if (token !== start) {
		throw new Error(`expected '${start}'`)
	}

	while ((token = reader.peek()) !== end) {
		if (!token) {
			throw new Error(`expected '${end}', got EOF`)
		}

		ast.push(readForm(reader)) // eslint-disable-line @typescript-eslint/no-use-before-define
	}

	reader.next()
	return ast
}

function readForm(reader: Reader): any {
	const token = reader.peek()

	switch (token) {
		// reader macros/transforms
		case ';':
			return null
		case "'":
			reader.next()
			return [Symbol.for('quote'), readForm(reader)]
		case '`':
			reader.next()
			return [Symbol.for('quasiquote'), readForm(reader)]
		case '~':
			reader.next()
			return [Symbol.for('unquote'), readForm(reader)]
		case '~@':
			reader.next()
			return [Symbol.for('splice-unquote'), readForm(reader)]
		case '#':
			reader.next()
			return [Symbol.for('do'), readForm(reader)]
		case '^': {
			reader.next()
			const meta = readForm(reader)
			return [Symbol.for('with-meta'), readForm(reader), meta]
		}
		case '@':
			reader.next()
			return [Symbol.for('deref'), readForm(reader)]

		// list
		case ')':
			throw new Error("unexpected ')'")
		case '(':
			return readList(reader)

		// hash-map
		// case '}':
		// 	throw new Error("unexpected '}'")
		// case '{':
		// 	return read_hash_map(reader)

		// atom
		default:
			return readAtom(reader)
	}
}

export class BlankException extends Error {
	constructor() {
		super('Blank Exception')
	}
}

export default function readStr(str: string) {
	const tokens = tokenize(str)
	if (tokens.length === 0) {
		throw new BlankException()
	}
	return readForm(new Reader(tokens))
}
