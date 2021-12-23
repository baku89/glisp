{{}}

{
	const Exp = options.Exp
}

Program = _ exp:Node _
	{
		return exp
	}

Node =
	Dict /
	Unit / Bottom / All /
	Fn / TyFn / Scope / App /
	Vec /
	Num / Str / TyVar / Sym

Reserved = "_" / "_|_" / "..." / "=>" / "->" / "let" / "<" [^>]+ ">"

Unit = "(" _ ")" { return Exp.unit }

All "all" = "_" { return Exp.all }

Bottom "bottom" = "_|_" { return Exp.bottom }

Sym "Sym" = SymIdent

SymIdent =
	!(Reserved End)
	!(Digit / Delimiter / Whitespace) .
	(!(Delimiter / Whitespace) .)*
	{
		return Exp.sym(text())
	}

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


App "App" = "(" _ fn:Node _ args:(@Node _)* ")"
	{
		return Exp.call(fn, ...args)
	}

Fn = "(" _ "=>" _ tyVars:FnTyVars? param:FnParam body:Node _ ")"
	{
		return Exp.eFn(tyVars ?? [], param, body)
	}

FnParam =
	"[" _ pairs:NamedNode* "]" _ { return Object.fromEntries(pairs) } /
	pair:NamedNode _             { return Object.fromEntries([pair]) }

TyFn = "(" _ "->" _ tyVars:FnTyVars? param:TyFnParam out:Node _ ")"
	{
		const entries = param.map(([name, type], i) => [name ?? i, type])
		const paramDict = Object.fromEntries(entries)
		return Exp.eTyFnFrom(tyVars ?? [], paramDict, out)
	}

TyFnParam =
	"[" _ params:TyFnParamEntry* "]" _ { return params } /
	param:TyFnParamEntry _             { return [param] }

TyFnParamEntry =
	NamedNode /
	type:Node _ { return [null, type] }

FnTyVars = "<" _ tyVars:FnTyVarEntry* ">" _
	{
		return tyVars
	}

FnTyVarEntry = name:$([a-zA-Z] [a-zA-Z0-9]*) _
	{
		return name
	}

NamedNode = sym:Sym _ ":" _ value:Node _
	{
		return [sym.name, value]
	}

Vec = "[" _ items:(@Node _)* rest:Rest? "]"
	{		
		return Exp.eVecFrom(items, rest)
	}

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

Scope = "(" _ "let" _ pairs:ScopePair* out:Node? _ ")"
	{
		const vars = {}
		for (const [name, value] of pairs) {
			if (name in vars) throw new Error('Duplicated symbol name: ' + name)
			vars[name] = value
		}
		return Exp.scope(vars, out ?? null)
	}

ScopePair = s:Sym _ "=" _ node:Node _
	{
		return [s.name, node]
	}


_ "whitespace" = Whitespace*
__ "whitespace" = Whitespace+

Delimiter = [()[\]{}:`"?.]

Digit = [0-9]

EOF = _ !.
End = EOF / Whitespace / [()[\]{}:]

Whitespace = [ \t\n\r]