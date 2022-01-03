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
	Fn / TyFn / Scope / TryCatch / Call /
	Vec /
	Num / Str / Sym

Reserved = "_" / "_|_" / "..." / "=>" / "->" / "let" / "try" / "catch"

Unit = "(" _ ")" { return Ast.lUnit() }

All "_" = "_" { return Ast.lAll() }

Bottom "_|_" = "_|_" { return Ast.lBottom() }

Sym "symbol" =
	!(Reserved End)
	!(Digit / Delimiter / Whitespace) .
	(!(Delimiter / Whitespace) .)*
	{
		return Ast.sym(text())
	}

Num "number" = [+-]? ([0-9]* ".")? [0-9]+
	{
		const v = parseFloat(text())
		return Ast.lNum(v)
	}

Str "string" = '"' value:$(!'"' .)* '"'
	{
		return Ast.lStr(value)
	}

Call "function application" = "(" _ fn:Node _ args:(@Node _)* ")"
	{
		return Ast.call(fn, ...args)
	}

Fn "function" = "(" _ "=>" _ tyVars:FnTyVars? param:FnParam body:Node _ ")"
	{
		return Ast.eFn(tyVars ?? [], param, body)
	}

FnParam =
	"[" _ pairs:NamedNode* "]" _ { return Object.fromEntries(pairs) } /
	pair:NamedNode _             { return Object.fromEntries([pair]) }

TyFn "function type" = "(" _ "->" _ tyVars:FnTyVars? param:TyFnParam out:Node _ ")"
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

Vec "vector" = "[" _ items:(@Node !"?" _)* optionalItems:(@Node "?" _)* rest:Rest? "]"
	{		
		return Ast.eVecFrom([...items, ...optionalItems], items.length, rest)
	}

Dict "dictionary" = "{" _ entries:DictEntry* rest:Rest? "}"
	{
		const items = {}
		const optionalKeys = new Set()
		for (const [key, value, optional] of entries) {
			items[key] = value
			if (optional) optionalKeys.add(key)
		}
		return Ast.eDictFrom(items, optionalKeys, rest)
	}

DictEntry = key:(Str / DictKey) optional:"?"? ":" _ value:Node _
	{
		return [key.value, value, optional]
	}

DictKey = (!(Whitespace / Delimiter) .)+
	{
		return Ast.lStr(text())
	}

Rest = "..." @rest:Node _

Scope "scope" = "(" _ "let" _ pairs:(@Sym _ "=" _ @Node _)* out:Node? _ ")"
	{
		const vars = {}
		for (const [{name}, value] of pairs) {
			if (name in vars) throw new Error('Duplicated symbol name: ' + name)
			vars[name] = value
		}
		return Ast.scope(vars, out ?? null)
	}

TryCatch = "(" _ "try" _ block:Node _ handler:(@Node _)? ")"
	{
		return Ast.tryCatch(block, handler)
	}

_ "whitespace" = Whitespace*

Delimiter = [()[\]{}:`"?.]

Digit = [0-9]

EOF = _ !.
End = EOF / Whitespace / [()[\]{}:]

Whitespace = [ \t\n\r]