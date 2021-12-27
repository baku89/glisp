{
	const Ast = options.Ast
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
	Num / Str / Sym

Reserved = "_" / "_|_" / "..." / "=>" / "->" / "let" / "<" [^>]+ ">"

Unit = "(" _ ")" { return Ast.lUnit() }

All "all" = "_" { return Ast.lAll() }

Bottom "bottom" = "_|_" { return Ast.lBottom() }

Sym "Sym" = SymIdent

SymIdent =
	!(Reserved End)
	!(Digit / Delimiter / Whitespace) .
	(!(Delimiter / Whitespace) .)*
	{
		return Ast.sym(text())
	}

Num "Num" = [+-]? ([0-9]* ".")? [0-9]+ &End
	{
		const v = parseFloat(text())
		return Ast.lNum(v)
	}

Str "Str" = '"' value:$(!'"' .)* '"'
	{
		return Ast.lStr(value)
	}


App "App" = "(" _ fn:Node _ args:(@Node _)* ")"
	{
		return Ast.call(fn, ...args)
	}

Fn = "(" _ "=>" _ tyVars:FnTyVars? param:FnParam body:Node _ ")"
	{
		return Ast.eFn(tyVars ?? [], param, body)
	}

FnParam =
	"[" _ pairs:NamedNode* "]" _ { return Object.fromEntries(pairs) } /
	pair:NamedNode _             { return Object.fromEntries([pair]) }

TyFn = "(" _ "->" _ tyVars:FnTyVars? param:TyFnParam out:Node _ ")"
	{
		const entries = param.map(([name, type], i) => [name ?? i, type])
		const paramDict = Object.fromEntries(entries)
		return Ast.eTyFnFrom(tyVars ?? [], paramDict, out)
	}

TyFnParam =
	"[" _ params:TyFnParamEntry* "]" _ { return params } /
	param:TyFnParamEntry _             { return [param] }

TyFnParamEntry =
	NamedNode /
	type:Node _ { return [null, type] }

FnTyVars = "<" _ tyVars:(@$([a-zA-Z] [a-zA-Z0-9]*) _)* ">" _
	{
		return tyVars
	}

NamedNode = sym:Sym _ ":" _ value:Node _
	{
		return [sym.name, value]
	}

Vec = "[" _ items:(@Node _)* rest:Rest? "]"
	{		
		return Ast.eVecFrom(items, rest)
	}

Dict = "{" _ entries:DictEntry* rest:Rest? "}"
	{
		return Ast.eDictFrom(Object.fromEntries(entries), rest)
	}

DictEntry = key:(Str / DictKey) _ optional:"?"? _ ":" _ value:Node _
	{
		const field = {optional: !!optional, value}
		return [key.value, field]
	}

DictKey = (!(Whitespace / Delimiter) .)+
	{
		return Ast.lStr(text())
	}

Rest = "..." _ rest:Node _ { return rest }

Scope = "(" _ "let" _ pairs:(@Sym _ "=" _ @Node _)* out:Node? _ ")"
	{
		const vars = {}
		for (const [{name}, value] of pairs) {
			if (name in vars) throw new Error('Duplicated symbol name: ' + name)
			vars[name] = value
		}
		return Ast.scope(vars, out ?? null)
	}

_ "whitespace" = Whitespace*
__ "whitespace" = Whitespace+

Delimiter = [()[\]{}:`"?.]

Digit = [0-9]

EOF = _ !.
End = EOF / Whitespace / [()[\]{}:]

Whitespace = [ \t\n\r]