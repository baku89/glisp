import peggy from 'peggy'

import * as Exp from '../exp'
import {GlobalScope} from '../std/global'
import * as Val from '../val'

const parserDefinition = `
Start = _ exp:Node _
	{
		return exp
	}

Node = Scope / Call / Int / Bool / Sym

Reserved = "true" / "false" / "null"

Sym "Sym" = !(Reserved End) $([^0-9()[\\]{}\\:] [^()[\\]{}\\: \\t\\n\\r]*)
	{
		return Exp.sym(text())
	}

Int "Int" = [0-9]+ &End
	{
		const v = parseInt(text())
		return Exp.int(v)
	}

Bool "Bool" = ("true" / "false") &End
	{
		const v = text() === 'true'
		return Exp.bool(v)
	}

Call "Call" = "(" _ fn:Node args:CallArg* _ ")"
	{
		return Exp.call(fn, args)
	}

CallArg = _ arg:Node
	{
		return arg
	}

Scope = "{" _ pairs:ScopePair+ out:Node? _ "}"
	{
		return Exp.scope(Object.fromEntries(pairs), out ?? null)
	}

ScopePair = s:Sym _ "=" _ node:Node _
	{
		return [s.name, node]
	}


_ = Whitespace*
__ = Whitespace+

EOF = _ !.
End = EOF / Whitespace / [()[\\]{}\\:]

Whitespace = $[ \\t\\n\\r]
`

const parserSource = peggy.generate(parserDefinition, {
	exportVar: {Exp},
	output: 'source',
})

const parser = eval(parserSource)

export function parse(str: string): Exp.Node {
	const exp: Exp.Node | undefined = parser.parse(str)
	if (!exp) return Exp.obj(Val.bottom)

	exp.parent = GlobalScope

	return exp
}
