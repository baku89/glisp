import * as Ast from '../ast'
import parser from './parser.peg.js'

export function parse(str: string, parent: Ast.Exp | null = null): Ast.Node {
	const exp: Ast.Node | undefined = parser.parse(str, {Ast})
	if (!exp) return Ast.lUnit()

	if ('parent' in exp) exp.parent = parent

	return exp
}

export function parseModule(str: string): Record<string, Ast.Node> {
	const exp: Ast.Node | undefined = parser.parse('(let ' + str + ')', {Ast})
	if (!exp || exp.type !== 'scope') return {}

	return exp.vars
}
