import peggy from 'peggy'

import * as Exp from '../exp'
import * as Val from '../val'

const parserDefinition = `
Program = _ exp:Node _
	{
		return exp
	}

Node =
	Dict / Scope /
	Unit / Bottom / All /
	Fn / TyFn / App /
	Vec /
	Num / Str / TyVar / Sym

Reserved = "_" / "_|_" / "=>" / "->" / "~>" / "<" [^>]+ ">"

Unit = "(" _ ")" { return Exp.unit }

All "all" = "_" { return Exp.all }

Bottom "bottom" = "_|_" { return Exp.bottom }

Sym "Sym" = SymIdent /*/ SymQuoted*/

SymIdent =
	!(Reserved End)
	!(Digit / Delimiter / Whitespace) .
	(!(Delimiter / Whitespace) .)*
	{
		return Exp.sym(text())
	}

/*
SymQuoted = "\`" name:$(!"\`" .)+ "\`"
	{
		return Exp.sym(name)
	}
*/

TyVar = "<" name:$[^>]+ ">"
	{
		return Exp.tyVar(name)
	}

Num "Num" = [+-]? ([0-9]* ".")? [0-9]+ &End
	{
		const v = parseFloat(text())
		return Exp.num(v)
	}

Str "Str" = '"' value:$(!'"' .)* '"'
	{
		return Exp.str(value)
	}


App "App" = "(" _ fn:Node _ args:AppArg* ")"
	{
		return Exp.app(fn, ...args)
	}

AppArg = arg:Node _ { return arg }

Fn = "(" _ "=>" _ param:FnParam body:Node _ ")"
	{
		return Exp.eFn(param, body)
	}

FnParam = "[" _ pairs:NamedNode* "]" _
	{
		return Object.fromEntries(pairs)
	}

TyFn = "(" _ "->" _ param:TyFnParam out:Node _ ")"
	{
		const entries = param.map(([name, type], i) => [name ?? i, type])
		const paramDict = Object.fromEntries(entries)
		return Exp.eTyFnFrom(paramDict, out)
	}

TyFnParam = "[" _ params:TyFnParamEntry* "]" _ { return params }

TyFnParamEntry = type:Node _ { return [null, type] }

NamedNode = sym:Sym _ ":" _ value:Node _
	{
		return [sym.name, value]
	}

Vec = "[" _ items:VecItem* rest:Rest? "]"
	{		
		return Exp.eVecFrom(items, rest)
	}

VecItem = !("..." _) item:Node _ { return item }

Dict = "{" _ entries:DictEntry* rest:Rest? "}"
	{
		return Exp.eDictFrom(Object.fromEntries(entries), rest)
	}

DictEntry = key:(Str / DictKey) _ optional:"?"? _ ":" _ value:Node _
	{
		const field = {optional: !!optional, value}
		return [key.value, field]
	}

DictKey = (!(Whitespace / Delimiter) .)+
	{
		return Exp.str(text())
	}

Rest = "..." _ rest:Node _ { return rest }

Scope = "{" _ pairs:ScopePair* out:Node? _ "}"
	{
		return Exp.scope(Object.fromEntries(pairs), out ?? null)
	}

ScopePair = s:Sym _ "=" _ node:Node _
	{
		return [s.name, node]
	}


_ "whitespace" = Whitespace*
__ "whitespace" = Whitespace+

Delimiter = [()[\\]{}\\:\`"?.]

Digit = [0-9]

EOF = _ !.
End = EOF / Whitespace / [()[\\]{}\\:]

Whitespace = [ \\t\\n\\r]

`

const parserSource = peggy.generate(parserDefinition, {
	exportVar: {Exp, Val},
	output: 'source',
})

const parser = eval(parserSource)

type Literal =
	| Exp.Exp
	| Exp.All
	| Exp.Bottom
	| Exp.Unit
	| Exp.Num
	| Exp.Str
	| Exp.TyVar

export function parse(str: string, parent: Exp.Exp['parent'] = null): Literal {
	const exp: Literal | undefined = parser.parse(str)
	if (!exp) return Exp.unit

	if ('parent' in exp) exp.parent = parent

	return exp
}

export function parseModule(str: string): Record<string, Exp.Node> {
	const exp: Exp.Node | undefined = parser.parse('{' + str + '}')
	if (!exp || exp.type !== 'scope') return {}

	return exp.vars
}
