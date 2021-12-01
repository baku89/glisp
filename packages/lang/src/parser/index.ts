import peggy from 'peggy'

import * as Exp from '../exp'
import {GlobalScope} from '../std/global'
import * as Val from '../val'

const parserDefinition = `
Start = _ exp:Node _
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

Unit = "(" _ ")" { return Exp.obj(Val.unit) }

All "all" = "_" { return Exp.obj(Val.all) }

Bottom "bottom" = "_|_" { return Exp.obj(Val.bottom) }

Sym "Sym" = SymIdent / SymQuoted

SymIdent = !(Reserved End) !(Digit / Delimiter / Whitespace) . (!(Delimiter / Whitespace) .)*
	{
		return Exp.sym(text())
	}

SymQuoted = "\`" name:$(!"\`" .)+ "\`"
	{
		return Exp.sym(name)
	}

TyVar = "<" id:$[^>]+ ">"
	{
		return Exp.obj(Val.tyVar(id))
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

Fn = "(" _ "=>" _ param:FnParam _ body:Node _ ")"
	{
		return Exp.fn(param, body)
	}

FnParam = FnParamMulti / FnParamSingle

FnParamMulti = "(" _ pairs:FnParamPair* _ ")"
	{
		return Object.fromEntries(pairs)
	}

FnParamSingle = pair:FnParamPair
	{
		const [name, type] = pair
		return {[name]: type}
	}

FnParamPair = sym:Sym _ ":" _ type:Node _
	{
		return [sym.name, type]
	}

TyFn = "(" _ "->" _ param:TyFnParam _ out:Node _ ")"
	{
		return Exp.tyFn(param, out)
	}

TyFnParam = 
	"(" _ params:(Node _)* ")" { return params.map(p => p[0]) } /
	param:Node { return [param] }

Vec = "[" _ items:VecItem* rest:Rest? "]"
	{		
		return Exp.vecFrom(items, rest)
	}

VecItem = !("..." _) item:Node _ { return item }

Dict = "{" _ entries:DictEntry* rest:Rest? "}"
	{
		return Exp.dictFrom(Object.fromEntries(entries), rest)
	}

DictEntry = key:(Str / DictKey) _ optional:"?"? _ ":" _ value:Node _
	{
		const field = {optional: !!optional, value}
		return [key.value.value, field]
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

Delimiter = [()[\\]{}\\:\`"?]

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

export function parse(str: string): Exp.Node {
	const exp: Exp.Node | undefined = parser.parse(str)
	if (!exp) return Exp.obj(Val.bottom)

	exp.parent = GlobalScope

	return exp
}
