import {Ast, Type, Unit} from './ast'

export function print(ast: Ast): string {
	if (
		ast === null ||
		typeof ast === 'number' ||
		typeof ast === 'string' ||
		typeof ast === 'boolean' ||
		typeof ast === 'function'
	) {
		return String(ast)
	}

	if (ast === Unit) {
		return '()'
	}

	if (Array.isArray(ast)) {
		return '[' + ast.map(print).join(' ') + ']'
	}

	switch (ast[Type]) {
		case 'Prim':
			return String(ast.value)
		case 'Sym':
			return ast.name
		case 'List':
			return '(' + ast.items.map(print).join(' ') + ')'
		case 'Scope':
			return `{${Object.entries(ast.vars)
				.map(([name, value]) => name + '=' + print(value))
				.join(' ')}}`
	}
}
