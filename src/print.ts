/**
 * AST → source string. Inverse of parse.
 *
 * Spec: docs/spec/host-api.md — `g.print`
 *
 * For builder-constructed ASTs (no trivia), output uses default whitespace
 * consistent with syntax.md. For parse-constructed ASTs (with trivia),
 * trivia is preserved verbatim — but trivia handling is not implemented yet.
 */

import {
	type AST,
	type FnAST,
	type FnParam,
	type LetAST,
	type LitAST,
	type RecordAST,
	UNIT,
} from './types.js'

export function print(ast: AST): string {
	return printAST(ast)
}

function printAST(ast: AST): string {
	switch (ast.kind) {
		case 'lit':
			return printLit(ast.value)
		case 'sym':
			return ast.name
		case 'call': {
			const positional = [ast.head, ...ast.args].map(printAST)
			const kw: string[] = []
			if (ast.kwargs) {
				for (const [k, v] of ast.kwargs) {
					kw.push(`${k}=${printAST(v)}`)
				}
			}
			return `(${[...positional, ...kw].join(' ')})`
		}
		case 'access':
			return `${printAST(ast.target)}.${ast.key}`
		case 'vec':
			return `[${ast.elements.map(printAST).join(' ')}]`
		case 'record':
			return printRecord(ast)
		case 'let':
			return printLet(ast)
		case 'fn':
			return printFn(ast)
		case 'path':
			return printPath(ast.segments)
		case 'quote':
			return '`' + printAST(ast.expr)
		case 'unquote':
			return '~' + printAST(ast.expr)
		case 'spread':
			return '...' + printAST(ast.expr)
		case 'splice':
			return '...~' + printAST(ast.expr)
		case 'meta':
			return `^${printAST(ast.metadata)} ${printAST(ast.expr)}`
	}
}

function printLit(value: LitAST['value']): string {
	if (value === UNIT) return '()'
	if (typeof value === 'number') return numberLiteral(value)
	if (typeof value === 'string') return stringLiteral(value)
	return value ? 'true' : 'false'
}

function numberLiteral(n: number): string {
	// IEEE 754 double; basic toString. Special cases like Infinity/NaN are
	// not Glisp literals but appear here as their JS string forms.
	return n.toString()
}

function stringLiteral(s: string): string {
	// Glisp escapes per syntax.md: \n \r \t \" \\ \uXXXX
	return (
		'"' +
		s.replace(/[\n\r\t"\\\u0000-\u001f]/g, (ch) => {
			switch (ch) {
				case '\n':
					return '\\n'
				case '\r':
					return '\\r'
				case '\t':
					return '\\t'
				case '"':
					return '\\"'
				case '\\':
					return '\\\\'
				default:
					return '\\u' + ch.codePointAt(0)!.toString(16).padStart(4, '0')
			}
		}) +
		'"'
	)
}

function printRecord(ast: RecordAST): string {
	const entries: string[] = []
	for (const [k, v] of ast.fields) {
		const optMark = ast.optional?.has(k) ? '?' : ''
		entries.push(`${k}${optMark}: ${printAST(v)}`)
	}
	return `{${entries.join(' ')}}`
}

function printLet(ast: LetAST): string {
	const parts: string[] = []
	for (const [name, expr] of ast.bindings) {
		parts.push(`${name} = ${printAST(expr)}`)
	}
	if (ast.body !== null) {
		parts.push(printAST(ast.body))
	}
	return `{${parts.join(' ')}}`
}

function printFn(ast: FnAST): string {
	const segments: string[] = ['=>']
	if (ast.generics.length > 0) {
		segments.push(`(${ast.generics.join(' ')})`)
	}
	const params = ast.params.map(printParam).join(' ')
	segments.push(`(${params}): ${printAST(ast.returnType)}`)
	if (ast.body !== null) {
		segments.push(printAST(ast.body))
	}
	return `(${segments.join(' ')})`
}

function printParam(p: FnParam): string {
	let name = p.name
	if (p.optional) name += '?'
	if (p.variadic) name = '...' + name
	return `${name}: ${printAST(p.type)}`
}

function printPath(
	segments: ReadonlyArray<'..' | string | number>
): string {
	if (segments.length === 0) return './'
	const head = segments[0] === '..' ? '../' : './'
	const rest = segments[0] === '..' ? segments.slice(1) : segments
	return head + rest.map(String).join('/')
}
