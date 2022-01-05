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

	function getOptionalPos(optionalFlags) {
		let optionalPos = undefined
		
		for (let i = 0; i < optionalFlags.length; i++) {
			if (optionalFlags[i]) {
				if (optionalPos === undefined) optionalPos = i
			} else {
				if (optionalPos !== undefined) return null
			}
		}

		return optionalPos
	}
}}

{
	const Ast = options.Ast
}

Program = _ exp:Node _ Comment?
	{
		return exp
	}

Node = node:NodeContent valueMeta:(_ "^" _ @ValueMeta)?
	{
		if (valueMeta) {
			node.valueMeta = valueMeta
		}
		return node
	}

NodeContent =
	Unit / Never / All /
	Num / Str / Identifier /
	Fn / FnType / Scope / TryCatch / Call /
	Vec / Dict

ValueMeta = "{" _ defaultValue:Node _ "}"
	{
		return {defaultValue}
	}

Reserved = "_" / "Never" / "..." / "=>" / "->" / "let" / "try" / "catch"

Unit = "(" _ ")" { return Ast.call() }

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

Fn "function definition" =
	"(" _ "=>" _ typeVars:TypeVars? param:FnParam body:Node _ ")"
	{
		const {entries, rest: _rest} = param
		const [paramEntries, optionalFlags] = zip(entries)

		typeVars ??= undefined
		param = fromPairs(paramEntries)

		const optionalPos = getOptionalPos(optionalFlags)
		if (optionalPos === null) {
			throw new Error('A required parameter cannot follow an optional parameter')
		}

		let rest
		if (_rest) {
			const [[name, node], optional] = _rest
			rest = {name, node}

			if (optional) {
				throw new Error('A rest parameter cannot be marked optional')
			}
		}

		return Ast.fn({typeVars, param, optionalPos, rest, body})
	}

FnParam = FnParamMulti / FnParamSingle
	
FnParamMulti =
	"[" _ entries:(@NamedNode _)* rest:("..." @NamedNode _)? "]" _
	{
		return {entries, rest}
	}

FnParamSingle = entry:NamedNode _ { return {entries: [entry]} }

FnType "function type definition" =
	"(" _ "->" _ typeVars:TypeVars? param:FnTypeParam out:Node _ ")"
	{
		const {entries, rest: _rest} = param
		const [paramEntries, optionalFlags] = zip(entries)

		typeVars ??= undefined
		param = fromPairs(paramEntries.map(([name, node], i) => [name ?? i, node]))
		
		const optionalPos = getOptionalPos(optionalFlags)
		if (optionalPos === null) {
			throw new Error('A required parameter cannot follow an optional parameter')
		}

		let rest
		if (_rest) {
			const [[name, node], optional] = _rest
			rest = {name, node}

			if (optional) {
				throw new Error('A rest parameter cannot be marked optional')
			}
		}
		
		return Ast.fnType({typeVars, param, optionalPos, rest, out})
	}

FnTypeParam = FnTypeParamMulti / FnTypeParamSingle
 
FnTypeParamMulti =
	"[" _ entries:FnTypeParamEntry* rest:("..." @FnTypeParamEntry _)? "]" _
	{
		return {entries, rest}
	}

FnTypeParamSingle = entry:FnTypeParamEntry _ { return {entries: [entry]} }

FnTypeParamEntry =
	@NamedNode _ /
	node:Node optional:"?"? _ { return [[null, node], optional] }

TypeVars = "<" _ @(@$([a-zA-Z] [a-zA-Z0-9]*) _)* ">" _

NamedNode = id:Identifier optional:"?"? ":" _ node:Node
	{
		return [[id.name, node], optional]
	}

Vec "vector" =
	"[" _ entries:(@Node @"?"? _)* rest:("..." @Node _)? "]"
	{
		const [items, optionalFlags] = zip(entries)
		const optionalPos = getOptionalPos(optionalFlags)
		
		if (optionalPos === null) {
			throw new Error('A required item cannot follow an optional item')
		}

		return Ast.vec(items, optionalPos, rest)
	}

Dict "dictionary" = "{" _ entries:DictEntry* rest:("..." @Node _)? "}"
	{
		const items = {}
		const optionalKeys = new Set()
		for (const [key, value, optional] of entries) {
			items[key] = value
			if (optional) optionalKeys.add(key)
		}
		return Ast.dict(items, optionalKeys, rest)
	}

DictEntry = key:(Str / DictKey) optional:"?"? ":" _ value:Node _
	{
		return [key.value, value, optional]
	}

DictKey = (!End .)+
	{
		return Ast.str(text())
	}

Scope "scope" = "(" _ "let" _ pairs:(@Identifier ":" _ @Node _)* out:Node? _ ")"
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

Punctuation = [()[\]{}:`"?.;^@#~\\]

Newline = [\n\r]

Whitespace = [ \t,]

Digit = [0-9]

EOF = !.
End = EOF / Whitespace / Newline / Punctuation
