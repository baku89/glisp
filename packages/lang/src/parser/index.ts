import * as Exp from '../exp'
import parser from './parser.peg.js'

type Literal =
	| Exp.Exp
	| Exp.All
	| Exp.Bottom
	| Exp.Unit
	| Exp.Num
	| Exp.Str
	| Exp.TyVar

export function parse(str: string, parent: Exp.Exp['parent'] = null): Literal {
	const exp: Literal | undefined = parser.parse(str, {Exp})
	if (!exp) return Exp.unit

	if ('parent' in exp) exp.parent = parent

	return exp
}

export function parseModule(str: string): Record<string, Exp.Node> {
	const exp: Exp.Node | undefined = parser.parse('(let ' + str + ')', {Exp})
	if (!exp || exp.type !== 'scope') return {}

	return exp.vars
}
