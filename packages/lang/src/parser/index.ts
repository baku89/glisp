import * as Ast from '../ast'
import parser from './parser.peg.js'

export function parse(
	str: string,
	parent: Ast.InnerNode | null = null
): Ast.Node {
	const node: Ast.Node | undefined = parser.parse(str, {Ast})
	if (!node) return Ast.unit()

	if ('parent' in node) node.parent = parent

	return node
}

export function parseModule(str: string): Record<string, Ast.Node> {
	const node: Ast.Node | undefined = parser.parse('(let ' + str + ')', {Ast})
	if (!node || node.type !== 'Scope') return {}

	return node.vars
}
