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

Form =
	Constant / Number / String
	/ Pair / List / Vector / InfVector / HashMap / Scope / QuotedSymbol / Symbol

Constant "constant" = value:$("true" / "false" / "null")
	{
		return {
			ast: 'value',
			value: JSON.parse(value)
		}
	}

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

// Pair
Pair "pair" = left:FormPairLeft _ ":" _ right:Form
	{
		const ret = {
			ast: 'pair',
			left,
			right
		}
		ret.left.parent = ret
		ret.right.parent = ret

		return ret
	}

FormPairLeft =
	Constant / Number / String
	/ List / Vector / InfVector / HashMap / QuotedSymbol / SymbolPairLeft

SymbolPairLeft "symbol" = name:$([^ :.,\t\n\r`()[\]{}]i+)
	{
		return {
			ast: 'symbol',
			name
		}
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

List "list" = "(" _ items:(Form _)* ")"
	{
		return makeCollection('list', items)
	}

Vector "vector" = "[" _ items:(Form _)* "]"
	{
		return makeCollection('vector', items)
	}
	
InfVector "infinite vector" = "[" _ items:(Form _)+ "..." _ "]"
	{
		return makeCollection('infVector', items)
	}

HashMap "hash map" = "{" _ items:(Pair _)* "}"
	{
		return makeCollection('hashMap', items)
	}

Scope "scope" = "{" _ items:(Equal _)+ out:(Form _)? "}"
	{
		const entries = items.map(it => it[0])
		const ret = {ast: 'scope', scope: Object.fromEntries(entries)}

		entries.forEach(it => it[1].parent = ret)

		if (out) {
			const _out = out[0]
			ret.out = _out
			_out.parent = ret
		}

		return ret
	}

Comment "comment" = $(";" [^\n\r]*)

Whitespace "whitespace" = $([ ,\t\n\r]*)

_ = w:Whitespace str:$(Comment Whitespace?)*
	{
		return w + str
	}