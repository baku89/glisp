{{
	function zip(coll) {
		const as = []
		const bs = []

		for (const [a, b] of coll) {
			as.push(a)
			bs.push(b)
		}

		return [as, bs]
	}
	const fromPairs = Object.fromEntries
}}

{
	const Ast = options.Ast
}

Program = _ exp:Node _ Comment?
	{
		return exp
	}

Node "node" =
	Dict /
	Unit / Never / All /
	Fn / FnType / Scope / TryCatch / Call /
	Vec /
	Num / Str / Identifier

Reserved = "_" / "Never" / "..." / "=>" / "->" / "let" / "try" / "catch"

Unit = "(" _ ")" { return Ast.unit() }

All = "_" { return Ast.all() }

Never = "Never" { return Ast.never() }

Identifier "identifier" =
	!(Reserved End)
	!(Digit / End) .
	(!End .)*
	{
		return Ast.id(text())
	}

Num "number" = [+-]? (Digit* ".")? Digit+
	{
		const v = parseFloat(text())
		return Ast.num(v)
	}

Str "string" = '"' value:$(!'"' .)* '"'
	{
		return Ast.str(value)
	}

Call "function application" = "(" _ fn:Node _ args:(@Node _)* ")"
	{
		return Ast.call(fn, ...args)
	}

Fn "function" =
	"(" _ "=>" _ typeVars:FnTypeVars? param:FnParam body:Node _ ")"
	{
		typeVars ??= undefined
		return Ast.fn({typeVars, param, body})
	}

FnParam =
	"[" _ pairs:NamedNode* "]" _ { return fromPairs(pairs) } /
	pair:NamedNode _             { return fromPairs([pair]) }

FnType "function type" =
	"(" _ "->" _ typeVars:FnTypeVars? param:FnTypeParam out:Node _ ")"
	{
		typeVars ??= undefined
		param = fromPairs(param.map(([name, type], i) => [name ?? i, type]))
		return Ast.fnType({typeVars, param, out})
	}

FnTypeParam =
	"[" _ params:FnTypeParamEntry* "]" _ { return params } /
	param:FnTypeParamEntry _             { return [param] }

FnTypeParamEntry =
	NamedNode /
	type:Node _ { return [null, type] }

FnTypeVars = "<" _ typeVars:(@$([a-zA-Z] [a-zA-Z0-9]*) _)* ">" _
	{
		return typeVars
	}

NamedNode = sym:Identifier _ ":" _ value:Node _
	{
		return [sym.name, value]
	}

Vec "vector" =
	"[" _ itemsWithOptionalFlag:(@Node @"?"? _)* rest:Rest? "]"
	{
		const [items, optionalFlags] = zip(itemsWithOptionalFlag)

		let optionalPos = undefined
		
		for (let i = 0; i < optionalFlags.length; i++) {
			if (optionalFlags[i]) {
				if (optionalPos === undefined)
					optionalPos = i
			} else {
				if (optionalPos !== undefined) 
					throw new Error('A required item cannot follow an optional item')
			}
		}

		return Ast.vec(items, optionalPos, rest)
	}

Dict "dictionary" = "{" _ entries:DictEntry* rest:Rest? "}"
	{
		const items = {}
		const optionalKeys = new Set()
		for (const [key, value, optional] of entries) {
			items[key] = value
			if (optional) optionalKeys.add(key)
		}
		return Ast.dictFrom(items, optionalKeys, rest)
	}

DictEntry = key:(Str / DictKey) optional:"?"? ":" _ value:Node _
	{
		return [key.value, value, optional]
	}

DictKey = (!End .)+
	{
		return Ast.str(text())
	}

Rest = "..." @rest:Node _

Scope "scope" = "(" _ "let" _ pairs:(@Identifier _ "=" _ @Node _)* out:Node? _ ")"
	{
		const vars = {}
		for (const [{name}, value] of pairs) {
			if (name in vars) throw new Error('Duplicated symbol name: ' + name)
			vars[name] = value
		}
		return Ast.scope(vars, out ?? null)
	}

TryCatch = "(" _ "try" _ block:Node _ handler:Node _ ")"
	{
		return Ast.tryCatch(block, handler)
	}

_ "delimiter" = Whitespace* (Comment? Newline Whitespace*)*

Comment = ";" (!Newline .)*

Punctuation = [()[\]{}:`"?.;]

Newline = [\n\r]

Whitespace = [ \t]

Digit = [0-9]

EOF = !.
End = EOF / Whitespace / Newline / Punctuation
