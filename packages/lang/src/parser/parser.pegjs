{{
	function zip(coll) {
		const as = []
		const bs = []
		const cs = []

		for (const [a, b, c] of coll) {
			as.push(a)
			bs.push(b)
			cs.push(c)
		}

		return [as, bs, cs]
	}

	const fromPairs = Object.fromEntries

	function getOptionalPos(optionalFlags, label) {
		let optionalPos = undefined
		
		for (let i = 0; i < optionalFlags.length; i++) {
			if (optionalFlags[i]) {
				if (optionalPos === undefined) {
					optionalPos = i
				}
			} else {
				if (optionalPos !== undefined) {
					throw new Error(
						`A required ${label} cannot follow an optional ${label}`
					)
				}
			}
		}

		return optionalPos
	}

	function checkDuplicatedKey(keys, label) {
		const set = new Set()
		for (const key of keys) {
			if (typeof key !== 'string') continue

			if (set.has(key)) {
				throw new Error(`Duplicated ${label} '${key}'.`)
			}
			set.add(key)
		}
	}

	function parseRestParameter(rest) {
		if (!rest) return

		const [[name, node], optional] = rest

		if (optional) throw new Error('A rest parameter cannot be marked optional')

		return {name, node}
	}

	function checkDelimitersNotEmpty(delimiters) {
		for (const d of delimiters) {
			if (d === '') {
				throw new Error('A delimiter between elements cannot be empty')
			}
		}
	}

}}

{
	const Ast = options.Ast
}

Program = _ exp:Node _ Comment?
	{
		return exp
	}

Node =
	node:NodeContent
	valueMeta:(_ "^" _ @ValueMeta)?
	nodeMeta:(_ "#" _ @Dict)?
	{
		if (valueMeta) {
			node.setValueMeta(valueMeta)
		}

		if (nodeMeta) {
			node.setNodeMeta(nodeMeta)
		}
		
		return node
	}

NodeContent =
	Unit / Never / All /
	Num / Str / Identifier /
	Fn / FnType / Scope / TryCatch / Call /
	Vec / Dict

ValueMeta =
	"(" _ defaultValue:(@Node !":" __)? fields:(@DictKey ":" _ @Node __)* ")"
	{
		checkDuplicatedKey(fields.map(([key]) => key), 'key')

		defaultValue ??= undefined
		fields = fields.length > 0 ? Ast.dict(fromPairs(fields)) : undefined

		return {defaultValue, fields}
	} /
	defaultValue:Node { return {defaultValue} }

Reserved = "_" / "Never" / "=>" / "->" / "let" / "try"

Unit = "(" d:_ ")"
{
	const call = Ast.call()
	call.extras = {delimiters: [d]}
	return call
}

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
		const raw = text()
		const v = parseFloat(raw)
		
		const num = Ast.num(v)
		num.extras = {raw}
		return num
	}

Str "string" = '"' value:$(!'"' .)* '"'
	{
		return Ast.str(value)
	}

Call "function application" = "(" d0:_ fn:Node d1:__ argsAndDs:(Node __)* ")"
	{
		const [args, ds] = zip(argsAndDs)

		const delimiters = [d0, d1, ...ds]

		const call = Ast.call(fn, ...args)
		call.extras = {delimiters}
		return call
	}

Fn "function definition" =
	"(" _ "=>" __ typeVars:TypeVars? param:FnParam __ body:Node _ ")"
	{
		const {entries, rest: _rest} = param
		const [paramEntries, optionalFlags] = zip(entries)

		typeVars ??= undefined
		param = fromPairs(paramEntries)

		const optionalPos = getOptionalPos(optionalFlags, 'parameter')

		const rest = parseRestParameter(_rest)

		const paramNames = paramEntries.map(([name]) => name)
		if (rest) paramNames.push(rest.name)
		checkDuplicatedKey(paramNames, 'parameter')

		return Ast.fn({typeVars, param, optionalPos, rest, body})
	}

FnParam = FnParamMulti / FnParamSingle
	
FnParamMulti =
	"[" _ entries:(@NamedNode __)* rest:("..." @NamedNode _)? "]"
	{
		return {entries, rest}
	}

FnParamSingle = entry:NamedNode { return {entries: [entry]} }

FnType "function type definition" =
	"(" _ "->" __ typeVars:TypeVars? param:FnTypeParam out:Node _ ")"
	{
		const {entries, rest: _rest} = param
		const [paramEntries, optionalFlags] = zip(entries)

		typeVars ??= undefined
		param = fromPairs(paramEntries.map(([name, node], i) => [name ?? i, node]))
		
		const optionalPos = getOptionalPos(optionalFlags, 'parameter')

		const rest = parseRestParameter(_rest)

		const paramNames = paramEntries.map(([name]) => name)
		if (rest) paramNames.push(rest.name)
		checkDuplicatedKey(paramNames, 'parameter')
		
		return Ast.fnType({typeVars, param, optionalPos, rest, out})
	}

FnTypeParam = FnTypeParamMulti / FnTypeParamSingle
 
FnTypeParamMulti =
	"[" _ entries:FnTypeParamEntry* rest:("..." @FnTypeParamEntry _)? "]" __
	{
		return {entries, rest}
	}

FnTypeParamSingle = entry:FnTypeParamEntry { return {entries: [entry]} }

FnTypeParamEntry =
	@NamedNode __ /
	node:Node optional:"?"? __ { return [[null, node], optional] }

TypeVars = "<" _ @(@$([a-zA-Z] [a-zA-Z0-9]*) _)* ">" __

NamedNode = id:Identifier optional:"?"? ":" _ node:Node
	{
		return [[id.name, node], optional]
	}

Vec "vector" =
	"[" d0:_ entries:(Node "?"? __)* restAndDs:("..." @Node @_)? "]"
	{
		const [items, optionalFlags, ds] = zip(entries)
		const [rest, dsr] = restAndDs ?? [undefined, []]

		const optionalPos = getOptionalPos(optionalFlags, 'item')

		const delimiters = [d0, ...ds, ...dsr]

		const vec = Ast.vec(items, optionalPos, rest)
		vec.extras = {delimiters}
		return vec
	}

Dict "dictionary" = "{"
	d0:_ entries:DictEntry* restAndDs:("..." @Node @_)? "}"
	{
		const items = {}
		const optionalKeys = new Set()
		const [rest, dsr] = restAndDs ?? [undefined, []]

		const delimiters = [d0]

		for (const [key, value, optional, ds] of entries) {
			if (key in items) throw new Error(`Duplicated key: '${key}'`)

			items[key] = value
			if (optional) optionalKeys.add(key)

			delimiters.push(...ds)
		}

		delimiters.push(...dsr)

		const dict = Ast.dict(items, optionalKeys, rest)
		dict.extras = {delimiters}
		return dict
	}

DictEntry = key:DictKey optional:"?"? ":" d0:_ value:Node d1:__
	{
		return [key, value, optional, [d0, d1]]
	}

// TODO: Why not allowing reserved words for key?
DictKey =
	id:Identifier {return id.name } /
	str: Str      {return str.value }

Scope "scope" =
	"(" d0:_ "let" __ pairs:(@Identifier ":" @_ @Node @__)* out:Node? dl:_ ")"
	{
		const vars = {}
		const delimiters = [d0]

		for (const [{name}, da, value, db] of pairs) {
			if (name in vars) throw new Error(`Duplicated symbol name: '${name}'`)

			vars[name] = value

			delimiters.push(da, db)
		}

		delimiters.push(dl)

		const scope = Ast.scope(vars, out ?? null)
		scope.extras = {delimiters}
		return scope
	}

TryCatch = "(" d0:_ "try" d1:__ block:Node d2:__ handler:Node d3:_ ")"
	{
		const tryCatch = Ast.tryCatch(block, handler)
		tryCatch.extras = {delimiters: [d0, d1, d2, d3]}
		return tryCatch
	}

_ "delimiter" = Whitespace* (Comment? Newline Whitespace*)*
	{
		return text()
	}

__ "non-zero length delimiter" =
	_ &[)\]}] /
	d:_
	{
		if (d === '')
			throw new Error('A Delimiter between elements needs to be non-zero length')
	}

Comment = ";" (!Newline .)*

Punctuation = [()[\]{}:`"?.;^@#~\\]

Newline = [\n\r]

Whitespace = [ \t,]

Digit = [0-9]

EOF = !.
End = EOF / Whitespace / Newline / Punctuation
