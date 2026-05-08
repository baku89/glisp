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
	return printAST(ast, false)
}

/**
 * @param inQuote whether we're inside a quasiquote region (for splice form)
 */
function printAST(ast: AST, inQuote: boolean): string {
	switch (ast.kind) {
		case 'lit':
			return printLit(ast.value)
		case 'sym':
			return ast.name
		case 'call': {
			const positional = [ast.head, ...ast.args].map(a => printAST(a, inQuote))
			const kw: string[] = []
			if (ast.kwargs) {
				for (const [k, v] of ast.kwargs) {
					kw.push(`${k}=${printAST(v, inQuote)}`)
				}
			}
			return `(${[...positional, ...kw].join(' ')})`
		}
		case 'access':
			return `${printAST(ast.target, inQuote)}.${ast.key}`
		case 'vec':
			return `[${ast.elements.map(e => printAST(e, inQuote)).join(' ')}]`
		case 'record':
			return printRecord(ast, inQuote)
		case 'let':
			return printLet(ast, inQuote)
		case 'fn':
			return printFn(ast, inQuote)
		case 'path':
			return printPath(ast.segments)
		case 'quote':
			return '`' + printAST(ast.expr, true)
		case 'unquote':
			return '~' + printAST(ast.expr, false)
		case 'splice':
			// inside quasiquote: `...~expr`; otherwise spread `...expr`
			return inQuote
				? '...~' + printAST(ast.expr, false)
				: '...' + printAST(ast.expr, inQuote)
		case 'meta':
			return `^${printAST(ast.metadata, inQuote)} ${printAST(ast.expr, inQuote)}`
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

function printRecord(ast: RecordAST, inQuote: boolean): string {
	const entries: string[] = []
	for (const [k, v] of ast.fields) {
		const optMark = ast.optional?.has(k) ? '?' : ''
		entries.push(`${k}${optMark}: ${printAST(v, inQuote)}`)
	}
	return `{${entries.join(' ')}}`
}
// (iteration is the same — `fields` is now an array of pairs and
// `for...of` walks it in order, including duplicates.)

function printLet(ast: LetAST, inQuote: boolean): string {
	const parts: string[] = []
	for (const [name, expr] of ast.bindings) {
		parts.push(`${name} = ${printAST(expr, inQuote)}`)
	}
	if (ast.body !== null) {
		parts.push(printAST(ast.body, inQuote))
	}
	return `{${parts.join(' ')}}`
}

function printFn(ast: FnAST, inQuote: boolean): string {
	const segments: string[] = ['=>']
	if (ast.generics.length > 0) {
		segments.push(`(${ast.generics.join(' ')})`)
	}
	const params = ast.params.map(p => printParam(p, inQuote)).join(' ')
	segments.push(`(${params}): ${printAST(ast.returnType, inQuote)}`)
	if (ast.body !== null) {
		segments.push(printAST(ast.body, inQuote))
	}
	return `(${segments.join(' ')})`
}

function printParam(p: FnParam, inQuote: boolean): string {
	let name = p.name
	if (p.optional) name += '?'
	if (p.variadic) name = '...' + name
	return `${name}: ${printAST(p.type, inQuote)}`
}

function printPath(
	segments: ReadonlyArray<'..' | string | number>
): string {
	if (segments.length === 0) return './'
	const head = segments[0] === '..' ? '../' : './'
	const rest = segments[0] === '..' ? segments.slice(1) : segments
	return head + rest.map(String).join('/')
}
