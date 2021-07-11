{
	function makeCollection(ast, items) {
		const exp = {
			ast,
			items: items.map(p => p[0]),
		}

		exp.items.forEach((e, key) => e.parent = exp)

		return exp
	}
}

Start = Program / BlankProgram

BlankProgram = _ { return }

Program = form:Form
	{
		form.parent = null
		return form
	}

Form "form" = Cast / FromExceptCast

FromExceptCast = Any / Unit / Constant / Number / String
	/ Fn / List / Vector / InfVector / HashMap / Scope
	/ QuotedSymbol / Symbol

Constant "constant" = value:$("true" / "false" / "null")
	{
		return {
			ast: 'value',
			value: JSON.parse(value)
		}
	}

Any "any" = "*" { return {ast: 'value', value: {kind: 'any'}} }

Unit "unit" = (("(" _ ")") / "_")
	{ return {ast: 'value', value: {kind: 'unit'}} }

// Number
Number "number" = str:$(("+" / "-")? [0-9]+)
	{
		return {
			ast: 'value',
			value: parseInt(str),
		}
	}

// String
String "string" = '"' value:$(!'"' .)* '"'
	{
		return {
			ast: 'value',
			value
		}
	}

Symbol "symbol" = name:$([^ :.,\t\n\r`()[\]{}]i+)
	{
		return {
			ast: 'symbol',
			name
		}
	}

QuotedSymbol "quoted symbol" = '`' name:$(!'`' .)* '`'
	{
		return {ast: 'symbol', name}
	}

Fn "fn" = "(" _ "=>" _ fnParams:FnParams _ body:Form _ ")"
	{
		const ret = {ast: 'fn', ...fnParams, body}
		Object.values(ret.params).forEach(p => p.parent = ret)
		body.parent = ret

		return ret
	}

FnParams = "[" _ entries:(Pair _)* rest:("..." _ Pair _)? "]"
	{
		const params = Object.fromEntries(entries.map(p => p[0]))

		const variadic = !!rest

		if (rest) {
			const [name, value] = rest[2]
			params[name] = value
		}
		
		return {
			params,
			variadic
		}
	}

List "list" = "(" _ _fn:(ListFirst _) _params:(Form _)* ")"
	{
		const fn = _fn[0]
		const params = _params.map(p => p[0])

		const ret = {ast: 'list', fn, params}

		fn.parent = ret
		params.forEach(p => p.parent = ret)

		return ret
	}

ListFirst = Unit / Constant / Number / String
	/ Fn / List / Vector / InfVector / HashMap / Scope / QuotedSymbol / Symbol

Vector "vector" = "[" _ items:(Form _)* "]"
	{
		return makeCollection('vector', items)
	}
	
InfVector "infinite vector" = "[" _ _items:(Form _)* "..." rest:Form _ "]"
	{
		const items = _items.map(p => p[0])

		const ret = {ast: 'infVector', items, rest}

		items.forEach(p => p.parent = ret)
		rest.parent = ret

		return ret
	}


// Hash Map
HashMap "hash map" = "{" _ items:(Pair _)* "}"
	{
		const entries = items.map(it => it[0])
		const ret = {ast: 'hashMap', items: Object.fromEntries(entries)}

		entries.forEach(e => e[1].parent = ret)

		return ret
	}

Pair "entry" = key:(Symbol / String) _ ":" _ value:FromExceptCast
	{
		return [key.name ?? key.value, value]
	}

// Cast
Cast "cast" = value:FromExceptCast _ ":" _ type:FromExceptCast
	{
		const ret = {
			ast: 'cast',
			value,
			type
		}
		value.parent = ret
		type.parent = ret
		return ret
	}

// Scope
Scope "scope" = "{" _ items:(Equal _)* out:(Form _)? "}"
	{
		const entries = items.map(it => it[0])
		const ret = {ast: 'scope', scope: Object.fromEntries(entries)}

		entries.forEach(e => e[1].parent = ret)

		if (out) {
			const _out = out[0]
			ret.out = _out
			_out.parent = ret
		}

		return ret
	}

// Equal
Equal "equal" = left:(SymbolEqualLeft / QuotedSymbol) _ "=" _ right:Form
	{
		return [left.name, right]
	}

SymbolEqualLeft "symbol" = name:$([^= :.,\t\n\r`()[\]{}]i+)
	{
		return {
			ast: 'symbol',
			name
		}
	}

Comment "comment" = $(";" [^\n\r]*)

Whitespace "whitespace" = $([ ,\t\n\r]*)

_ = w:Whitespace str:$(Comment Whitespace?)*
	{
		return w + str
	}