import peggy from 'peggy'

import * as Exp from '../exp'

const parserDefinition = `
Start = _ exp:Node _
	{
		return exp
	}

Node = Var / Int / Bool

Reserved = "true" / "false" / "null"

Var = !(Reserved End) $([^0-9()[\\]{}:] [^()[\\]{}: \\t\\n\\r]+)
	{
		return new Exp.Var(text())
	}

Int = [0-9]+
	{
		const v = parseInt(text())
		return new Exp.Int(v)
	}

Bool = ("true" / "false")
	{
		const v = text() === 'true'
		return new Exp.Bool(v)
	}

_ = Whitespace*
__ = Whitespace+

EOF = _ !.
End = EOF / __

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
