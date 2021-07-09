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

Form = Any / Unit / Constant / Number / String
	/ List / Vector / InfVector / HashMap / Scope / QuotedSymbol / Symbol

Constant "constant" = value:$("true" / "false" / "null")
	{
		return {
			ast: 'value',
			value: JSON.parse(value)
		}
	}

Any "any" = "*" { return {ast: 'value', value: {kind: 'any'}} }

Unit "unit" = "(" _ ")" _{ return {ast: 'value', value: {kind: 'unit'}} }

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

Symbol "symbol" = name:$([^ .,\t\n\r`()[\]{}]i+)
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

List "list" = "(" _ fn:(ListFirst _) items:(Form _)* ")"
	{
		if (items.length === 0) {
			return {ast: 'value', value: {kind: 'unit'}}
		}
		return makeCollection('list', [fn,...items])
	}

ListFirst = List / Scope / QuotedSymbol / Symbol

Vector "vector" = "[" _ items:(Form _)* "]"
	{
		return makeCollection('vector', items)
	}
	
InfVector "infinite vector" = "[" _ items:(Form _)+ "..." _ "]"
	{
		return makeCollection('infVector', items)
	}


// Hash Map
HashMap "hash map" = "{" _ items:(Entry _)* "}"
	{
		const entries = items.map(it => it[0])
		const ret = {ast: 'hashMap', items: Object.fromEntries(entries)}

		entries.forEach(e => e[1].parent = ret)

		return ret
	}

Entry "entry" = key:(EntryKey / String) _ ":" _ value:Form
	{
		return [key.value, value]
	}

EntryKey "entry key" = value:$([^ :.,\t\n\r`()[\]{}]i+)
	{
		return {value}
	}


// Scope
Scope "scope" = "{" _ items:(Equal _)+ out:(Form _)? "}"
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

SymbolEqualLeft "symbol" = name:$([^ =.,\t\n\r`()[\]{}]i+)
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