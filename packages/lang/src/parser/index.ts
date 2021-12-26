import * as Exp from '../exp'
import parser from './parser.peg.js'

type Literal =
	| Exp.Exp
	| Exp.LAll
	| Exp.LBottom
	| Exp.LUnit
	| Exp.LNum
	| Exp.LStr
	| Exp.LTyVar

export function parse(str: string, parent: Exp.Exp['parent'] = null): Literal {
	const exp: Literal | undefined = parser.parse(str, {Exp})
	if (!exp) return Exp.lUnit()

	if ('parent' in exp) exp.parent = parent

	return exp
}

export function parseModule(str: string): Record<string, Exp.Exp> {
	const exp: Exp.Exp | undefined = parser.parse('(let ' + str + ')', {Exp})
	if (!exp || exp.type !== 'scope') return {}

	return exp.vars
}
