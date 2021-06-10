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
	/ Pair / List / Vector / HashMap / QuotedSymbol / Symbol

FormNotPair =
	Constant / Number / String
	/ List / Vector / HashMap / QuotedSymbol / Symbol

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

Symbol "symbol" = name:$([^ :,.\t\n\r`()[\]{}]i+)
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

Pair "pair" = left:FormNotPair _ ":" _ right:Form
	{
		return {
			ast: 'pair',
			left,
			right
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

HashMap "hash map" = "{" _ items:(Form _)* "}"
	{
		return makeCollection('hashMap', items)
	}

Comment "comment" = $(";" [^\n\r]*)

Whitespace "whitespace" = $([ ,\t\n\r]*)

_ = w:Whitespace str:$(Comment Whitespace?)*
	{
		return w + str
	}