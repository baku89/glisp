Program = d0:_ value:Form? d1:_
	{
		return {
			type: 'program',
			value,
			delimiters: [d0, d1]
		}
	}

Form =
	Null / Boolean / Number / String / Keyword / Symbol /
	List / Vector / HashMap / Tag

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

Keyword = ":" str:$(([a-z_+\-*/=?<>]i [0-9a-z_+\-*/=?<>]i*))
	{
		return {
			type: 'keyword',
			value: str
		}
	}

Symbol = SymbolIdentifier / SymbolPath

SymbolIdentifier = str:$(([a-z_+\-*/=?<>]i [0-9a-z_+\-*/=?<>]i*))
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
			str: `@"${str}"`
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

HashMap =
	"{"
	d0:_
	pairs:((((SymbolIdentifier / String) ":" _ Form) / Symbol) _)*
	"}"
	{
		const value = {} // as {[key: string]: ExpForm}
		const keyQuoted = {} // as {[key: string]: boolean}
		const delimiters = [d0] // as string[]

		for (const [pair, d2] of pairs) {


			if (pair.length === 4) {
				// Has value
				const [{type, value: key}, colon, d1, val] = pair
				value[key] = val
				keyQuoted[key] = type === 'string'
				delimiters.push([colon + d1, d2])
			} else {
				// Value omitted
				const val = pair
				const {type, value: key, str} = val
				value[key] = val
				keyQuoted[key] = str[0] === '@'
				delimiters.push(d2)
			}
		}

		const exp = {
			type: "hashMap",
			value,
			keyQuoted,
			delimiters
		}

		Object.values(exp.value).forEach(v => v.parent = exp)

		return exp
	}

Tag = "^" d0:_ meta:(Symbol / List) d1:_ value:Form
	{
		value['meta'] = {
			value: meta,
			delimiters: [d0, d1]
		}
		return value
	}

_ = $([ \t\n\r]*)