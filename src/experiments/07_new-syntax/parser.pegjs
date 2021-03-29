Program = d0:_ value:Form? d1:_
	{
		return {
			type: 'program',
			value,
			delimiters: [d0, d1]
		}
	}

Form =
	Boolean / Number / String / Symbol
	/ List / Vector / HashMap / Scope / Meta

Nil = "nil" { return { type: 'nil' } }

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

SymbolIdentifier = str:$([a-z_+\-*/=?<>]i [a-z0-9_+\-*/=?<>]i*)
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

List = "(" d0:_ fn:(Symbol / List) d1:_ params:(Form _)* ")"
	{
		const value = {
			type: 'list',
			fn,
			params: params.map(p => p[0]),
			delimiters: [d0, d1, ...params.map(p => p[1])]
		}

		value.fn.parent = {key: 0, value}
		value.params.forEach((p, i) => p.parent = {key: i + 1, value})

		return value
	}

Vector = "[" d0:_ values:(Form _)* "]"
	{
		const value = {
			type: 'vector',
			value: values.map(p => p[0]),
			delimiters: [d0, ...values.map(p => p[1])]
		}

		value.value.forEach((e, key) => e.parent = {key, value})

		return value
	}

HashMap = "{" d0:_ pairs:((SymbolIdentifier / String) _ Form _)* "}"
	{
		const value = {
			type: "hashMap",
			value: Object.fromEntries(pairs.map(p => [p[0].value, p[2]])),
			key: Object.fromEntries(pairs.map(([p]) => [p.value, p])),
			delimiters: [d0, ...pairs.map(p => [p[1], p[3]]).flat()]
		}

		Object.keys(value.value).forEach(
			key => value.value[key].parent = {key, value}
		)

		return value
	}

Scope = "{" d0:_ vars:HashMap d1:_ ret:Form d2:_ "}"
	{
		const value = {
			type: 'scope',
			vars,
			ret,
			delimiters: [d0, d1, d2]
		}
		vars.parent = {key: Symbol.for('scope'), value}

		return value
	}

Meta = "^" d0:_ meta:Form d1:_ value:Form
	{
		value['meta'] = {
			value: meta,
			delimiters: [d0, d1]
		}
		return value
	}

_ = $([ \t\n\r]*)