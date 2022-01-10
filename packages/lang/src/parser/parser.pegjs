{{
	function zip(coll) {
		const as = []
		const bs = []
		const cs = []
		const ds = []

		for (const [a, b, c, d] of coll) {
			as.push(a)
			bs.push(b)
			cs.push(c)
			ds.push(d)
		}

		return [as, bs, cs, ds]
	}

	function unzip([as, bs]) {
		const unzipped = []
		const len = as.length

		for (let i = 0; i < len; i++) {
			unzipped.push([as[i], bs[i]])
		}

		return unzipped
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

Program = _ exp:Node _
	{
		return exp
	}

Node =
	node:NodeContent
	valueMeta:ValueMeta?
	nodeMeta:NodeMeta?
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
	d:_ "^{" di0:_ defaultValueDi1:(@Node !":" @__)? fields:ValueMetaFields "}"
	{
		const [defaultValue, di1] = defaultValueDi1 ?? [undefined, undefined]

		const valueMeta = new Ast.ValueMeta(defaultValue, fields)
		valueMeta.extras = {
			delimiter: d,
			innerDelimiters: [di0, ...(di1 ? [di1] : [])]
		}
		return valueMeta
	}

ValueMetaFields = entries:(@DictKey ":" @_ @Node @__)*
	{
		if (!entries) return undefined

		const [keys, ds0, nodes, ds1] = zip(entries)

		checkDuplicatedKey(keys, 'key')

		const dict = Ast.dict(fromPairs(unzip([keys, nodes])))
		dict.extras = {delimiters: ['', ...unzip([ds0, ds1]).flat()]}
		return dict
	}

NodeMeta = d:_ "#" fields:Dict
	{
		return new Ast.NodeMeta(fields, {delimiter: [d]})
	}

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

Call "function application" = "(" d0:_ fn:Node d1:__ argsDs:(Node __)* ")"
	{
		const [args, ds] = zip(argsDs)

		const delimiters = [d0, d1, ...ds]

		const call = Ast.call(fn, ...args)
		call.extras = {delimiters}
		return call
	}

Fn "function definition" =
	"(" d0:_ "=>" d1:__ typeVarsDs:(TypeVars __)? param:FnParam d3:__ body:Node d4:_ ")"
	{
		const [typeVars, d2] = typeVarsDs ?? [undefined, undefined]

		const fn = Ast.fn({typeVars, param, body})
		fn.extras = {delimiters: [d0, d1, ...(d2 ? [d2] : []), d3, d4]}
		return fn
	}

FnType "function type definition" =
	"(" d0:_ "->" d1:__ typeVarsDs:(TypeVars __)? param:FnParam d3:__ out:Node d4:_ ")"
	{
		const [typeVars, d2] = typeVarsDs ?? [undefined, undefined]

		const fnType = Ast.fnType({typeVars, param, out})
		fnType.extras = {delimiters: [d0, d1, ...(d2 ? [d2] : []), d3, d4]}
		return fnType
	}
	
FnParam =
	"[" d0:_ entries:(NamedNode __)* rest:("..." @NamedNode @_)? "]"
	{
		let optionalFlags, d1s, d2s

		;[entries, d1s] = zip(entries)
		;[entries, optionalFlags] = zip(entries)
		;[rest, d2s] = rest ?? [undefined, []]

		const paramDict = fromPairs(entries)
		const optionalPos = getOptionalPos(optionalFlags, 'parameter')
		rest = parseRestParameter(rest)
	
		const paramNames = entries.map(([name]) => name)
		if (rest) paramNames.push(rest.name)
		checkDuplicatedKey(paramNames, 'parameter')

		const param = Ast.param(paramDict, optionalPos, rest) 
		param.extras = {delimiters: [d0, ...d1s, ...d2s]}
		return param
	}

TypeVars = "<" d0:_ namesDs:($([a-zA-Z] [a-zA-Z0-9]*) _)* ">"
	{
		const [names, ds] = zip(namesDs)

		const typeVars = new Ast.TypeVarsDef(names)
		typeVars.extras = {delimiters: [d0, ...ds]}
		return typeVars
	}

NamedNode = id:Identifier optional:"?"? ":" _ node:Node
	{
		return [[id.name, node], optional]
	}

Vec "vector" =
	"[" d0:_ entries:(Node "?"? __)* restDs:("..." @Node @_)? "]"
	{
		const [items, optionalFlags, ds] = zip(entries)
		const [rest, dsr] = restDs ?? [undefined, []]

		const optionalPos = getOptionalPos(optionalFlags, 'item')

		const delimiters = [d0, ...ds, ...dsr]

		const vec = Ast.vec(items, optionalPos, rest)
		vec.extras = {delimiters}
		return vec
	}

Dict "dictionary" = "{"
	d0:_ entries:DictEntry* restDs:("..." @Node @_)? "}"
	{
		const items = {}
		const optionalKeys = new Set()
		const [rest, dsr] = restDs ?? [undefined, []]

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
	"(" d0:_ "let" d1:__ pairs:(@Identifier ":" @_ @Node @__)* out:Node? dl:_ ")"
	{
		const vars = {}
		const delimiters = [d0, d1]

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

_ "delimiter" = Whitespace* (Comment? Newline Whitespace*)* (Comment EOF)?
	{
		return text()
	}

__ "non-zero length delimiter" =
	(
		Whitespace+ (Comment? Newline Whitespace*)* /
		Whitespace* (Comment? Newline Whitespace*)+ /
		Whitespace* &[)\]}]
	)
	{
		return text()
	}

Comment = ";" (!Newline .)*

Punctuation = [()[\]{}:`"?.;^@#~\\]

Newline = [\n\r]

Whitespace = [ \t,]

Digit = [0-9]

EOF = !.
End = EOF / Whitespace / Newline / Punctuation
