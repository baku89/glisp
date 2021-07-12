Start = Program / BlankProgram

BlankProgram = _ { return }

Program = form:Form
	{
		form.parent = null
		return form
	}

Form "form" = Cast / FromExceptCast

FromExceptCast = Any / Unit / Constant / Number / String
	/ Fn / List / Vector / Spread / Dict / Scope
	/ QuotedSymbol / Symbol

Constant "constant" = _value:$("true" / "false" / "null" / "inf" / "-inf" / "nan")
	{
		let value
		switch (_value) {
			case 'inf':
				value = Infinity
				break
			case '-inf':
				value = -Infinity
				break
			case 'nan':
				value = NaN
				break
			default:
				value = JSON.parse(_value)
		}

		return {ast: 'value', value}
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

Symbol "symbol" = name:$[^ :?#.,\t\n\r`()[\]{}]i+
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

Fn "fn" = "(" _ "=>" _ params:FnParams _ body:Form _ ")"
	{
		const ret = {ast: 'fn', params, body}
		Object.values(ret.params).forEach(p => p.value.parent = ret)
		body.parent = ret

		return ret
	}

FnParams = "[" _ params:(("..." _)? Pair _)* "]"
	{
		const paramItems = params.map(e => {
			const [inf, [name, value]] = e
			return [name, {inf: !!inf, value}]
		})
		
		return Object.fromEntries(paramItems)
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
	/ Fn / List / Vector / Spread / Dict / Scope / QuotedSymbol / Symbol

Vector "vector" = "[" _ items:(Form _)* "]"
	{
		const exp = {
			ast: 'vector',
			items: items.map(p => p[0]),
		}

		exp.items.forEach((e, key) => e.parent = exp)

		return exp
	}
	
Spread "spread vector" = "[" _ _items:(("..." _)? Form _)+ "]"
	{
		const items = _items.map(it => {
			const [inf, value] = it
			return {inf: !!inf, value}
		})

		const ret = {ast: 'spread', items}

		items.forEach(p => p.value.parent = ret)

		return ret
	}


// Hash Map
Dict "hash map" = "{" _ items:(Pair _)* rest:("..." _ Form _)? "}"
	{
		const entries = items.map(it => it[0])
		const ret = {ast: 'dict', items: Object.fromEntries(entries)}

		entries.forEach(e => e[1].parent = ret)

		if (rest) {
			ret.rest = rest[2]
			ret.rest.parent = ret
		}

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

SymbolEqualLeft "symbol" = name:$[^= :?#.,\t\n\r`()[\]{}]i+
	{
		return {
			ast: 'symbol',
			name
		}
	}

Comment "comment" = $(";" [^\n\r]*)

Whitespace "whitespace" = $[ ,\t\n\r]*

_ = w:Whitespace str:$(Comment Whitespace?)*
	{
		return w + str
	}