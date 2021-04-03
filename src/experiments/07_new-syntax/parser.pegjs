Program = d0:_ value:Form? d1:_
	{
		return {
			literal: 'program',
			value,
			delimiters: [d0, d1]
		}
	}

Form =
	ReservedKeyword /
	Number / String / Symbol /
	List / Vector / HashMap / TypeAnnotation

// ReservedKeyword
ReservedKeyword = value:$("|" / "&" / "...")
	{
		return {
			literal: 'const',
			unionOf: 'reservedKeyword',
			value
		}
	}

// Number
Number = NumberPercentage / NumberExponential / NumberFloat / NumberHex / NumberInteger

IntegerLiteral = $(("+" / "-")? [0-9]+)

FloatLiteral = $(IntegerLiteral? "." [0-9]+)

NumberInteger = str:IntegerLiteral
	{ 
		return {
			literal: 'infUnionValue',
			unionOf: 'number',
			value: parseInt(str),
			str
		}
	}

NumberFloat = str:FloatLiteral
	{
		return {
			literal: 'infUnionValue',
			unionOf: 'number',
			value: parseFloat(str),
			str
		}
	}

NumberExponential = str:$((IntegerLiteral / FloatLiteral) "e" IntegerLiteral)
	{
		return {
			literal: 'infUnionValue',
			unionOf: 'number',
			value: parseFloat(str),
			str
		}
	}

NumberHex = str:$("0x" [0-9a-f]i+)
	{
		return {
			literal: 'infUnionValue',
			unionOf: 'number',
			value: parseInt(str),
			str
		}
	}

NumberPercentage = str:$(IntegerLiteral / FloatLiteral) "%"
	{
		return {
			literal: 'infUnionValue',
			unionOf: 'number',
			value: (parseFloat(str) / 100),
			str: str + '%'
		}
	}

// String
String = value:StringLiteral
	{
		return {
			literal: 'infUnionValue',
			unionOf: 'string',
			value
		}
	}

StringLiteral = '"' str:$(!'"' .)+ '"'
	{ return str }

Symbol = SymbolIdentifier / SymbolRest / SymbolPath


SymbolIdentifier = str:$(":"? [a-z_+\-*/=?|<>]i [0-9a-z_+\-*/=?|<>]i*)
	{ 
		console.log('sym', str)
		return {
			literal: 'symbol',
			value: str,
			str
		}
	}

SymbolRest = "..."
	{
		return {
			literal: 'symbol',
			value: '...'
		}
	}

SymbolPath = "@" str:StringLiteral
	{
		return {
			literal: 'symbol',
			value: str,
			str: `@"${str}"`
		}
	}

List = "(" d0:_ values:(Form _)* ")"
	{
		const exp = {
			literal: 'list',
			value: values.map(p => p[0]),
			delimiters: [d0, ...values.map(p => p[1])]
		}

		exp.value.forEach((e, key) => e.parent = exp)

		return exp
	}

Vector = "[" d0:_ values:(Form _)* "]"
	{
		const exp = {
			literal: 'vector',
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
			literal: "hashMap",
			value,
			keyQuoted,
			delimiters
		}

		Object.values(exp.value).forEach(v => v.parent = exp)

		return exp
	}

TypeAnnotation = "^" d0:_ type:(Symbol / List) d1:_ value:Form
	{
		value['type'] = {
			value: type,
			delimiters: [d0, d1]
		}
		return value
	}

_ = $([ \t\n\r]*)