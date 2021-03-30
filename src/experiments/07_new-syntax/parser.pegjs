Program = d0:_ value:Form? d1:_
	{
		return {
			type: 'program',
			value,
			delimiters: [d0, d1]
		}
	}

Form =
	Boolean / Number / String / Symbol /
	Scope /
	List / Vector / HashMap / Meta

Null = "null" { return { type: 'null' } }

Boolean = value:("true" / "false")
	{
		return {
			type: 'boolean',
			value: value === 'true'
		}
	}

// Number
Number = NumberExponential / NumberFloat / NumberHex / NumberInteger

IntegerLiteral = $(("+" / "-")? [0-9]+)

FloatLiteral = $(IntegerLiteral? "." [0-9]*)

NumberInteger = str:IntegerLiteral
	{ 
		return {
			type: 'number',
			value: parseInt(str),
			str
		}
	}

NumberFloat = str:FloatLiteral
	{
		return {
			type: 'number',
			value: parseFloat(str),
			str
		}
	}

NumberExponential = str:$((IntegerLiteral / FloatLiteral) "e" IntegerLiteral)
	{
		return {
			type: 'number',
			value: parseFloat(str),
			str
		}
	}

NumberHex = str:$("0x" [0-9a-f]i+)
	{
		return {
			type: 'number',
			value: parseInt(str),
			str
		}
	}

// String
String = value:StringLiteral
	{
		return {
			type: 'string',
			value
		}
	}

StringLiteral = '"' str:$(!'"' .)+ '"'
	{ return str }

Symbol = SymbolIdentifier / SymbolPath

SymbolIdentifier = str:$(([a-z_+\-*/=?<>]i [0-9a-z_+\-*/=?<>]i*) / ':' / ':?')
	{ 
		return {
			type: 'symbol',
			value: str,
			str
		}
	}

SymbolPath = "@" str:StringLiteral
	{
		return {
			type: 'symbol',
			value: str,
			str: `@${str}`
		}
	}

List = "(" d0:_ values:(Form _)* ")"
	{
		const exp = {
			type: 'list',
			value: values.map(p => p[0]),
			delimiters: [d0, ...values.map(p => p[1])]
		}

		exp.value.forEach((e, key) => e.parent = exp)

		return exp
	}

Vector = "[" d0:_ values:(Form _)* "]"
	{
		const exp = {
			type: 'vector',
			value: values.map(p => p[0]),
			delimiters: [d0, ...values.map(p => p[1])]
		}

		exp.value.forEach((e, key) => e.parent = exp)

		return exp
	}

HashMap = "{" d0:_ pairs:((SymbolIdentifier / String) _ Form _)* "}"
	{
		const exp = {
			type: "hashMap",
			value: Object.fromEntries(pairs.map(p => [p[0].value, p[2]])),
			key: Object.fromEntries(pairs.map(([p]) => [p.value, p])),
			delimiters: [d0, ...pairs.map(p => [p[1], p[3]]).flat()]
		}

		Object.values(exp.value).forEach(v => v.parent = exp)

		return exp
	}

Scope = "(" d0:_ "let" d1:_  vars:HashMap d2:_ ret:Form d3:_ ")"
	{
		const value = {
			type: 'scope',
			vars,
			ret,
			delimiters: [d0, d1, d2, d3]
		}
		vars.parent = value
		ret.parent = value

		return value
	}

Meta = "^" d0:_ meta:(Symbol / List / HashMap) d1:_ value:Form
	{
		value['meta'] = {
			value: meta,
			delimiters: [d0, d1]
		}
		return value
	}

_ = $([ \t\n\r]*)