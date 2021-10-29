import peggy from 'peggy'

import * as Exp from '../exp'

const parserDefinition = `
Start = _ exp:Node _
	{
		return exp
	}

Node = Call / Int / Bool / Var

Reserved = "true" / "false" / "null"

Var "Var" = !(Reserved End) $([^0-9()[\\]{}\\:] [^()[\\]{}\\: \\t\\n\\r]*)
	{
		return new Exp.Var(text())
	}

Int "Int" = [0-9]+ &End
	{
		const v = parseInt(text())
		return new Exp.Int(v)
	}

Bool "Bool" = ("true" / "false") &End
	{
		const v = text() === 'true'
		return new Exp.Bool(v)
	}

Call "Call" = "(" _ fn:Node args:CallArg* _ ")"
	{
		return new Exp.Call(fn, args)
	}

CallArg = __ arg:Node
	{
		return arg
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
	return parser.parse(str)
}
