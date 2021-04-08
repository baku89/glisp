Start = Program / BlankProgram

Program = d0:_ value:Form d1:_
	{
		return {
			ast: 'program',
			value,
			delimiters: [d0, d1]
		}
	}

BlankProgram = _ { return null }

Form =
	LabeledForm / Void / Null / False / True / Number / String / Symbol /
	List / Vector / HashMap

Void = "Void"
	{
		return {
			ast: 'data',
			value: {dataType: 'void'}
		}
	}

Null = "null" { return {ast: 'data', value: null} }

False = "false" { return {ast: 'data', value: false} }

True = "true" { return {ast: 'data', value: true} }

// Number
Number = NumberInf / NumberMinusInf / NumberNan / NumberPercentage / NumberExponential / NumberFloat / NumberHex / NumberInteger

IntegerLiteral = $(("+" / "-")? [0-9]+)

FloatLiteral = $(IntegerLiteral? "." [0-9]+)

NumberInf = "inf" { return {ast: 'data', value: Infinity} }
NumberMinusInf = "-inf" { return {ast: 'data', value: -Infinity} }
NumberNan = "nan" { return {ast: 'data', value: NaN} }

NumberInteger = str:IntegerLiteral
	{ 
		return {
			ast: 'data',
			value: parseInt(str),
			str
		}
	}

NumberFloat = str:FloatLiteral
	{
		return {
			ast: 'data',
			value: parseFloat(str),
			str
		}
	}

NumberExponential = str:$((IntegerLiteral / FloatLiteral) "e" IntegerLiteral)
	{
		return {
			ast: 'data',
			value: parseFloat(str),
			str
		}
	}

NumberHex = str:$("0x" [0-9a-f]i+)
	{
		return {
			ast: 'data',
			value: parseInt(str),
			str
		}
	}

NumberPercentage = str:$(IntegerLiteral / FloatLiteral) "%"
	{
		return {
			ast: 'data',
			value: (parseFloat(str) / 100),
			str: str + '%'
		}
	}

// String
String = value:StringLiteral
	{
		return {
			ast: 'data',
			value
		}
	}

StringLiteral = '"' str:$(!'"' .)* '"'
	{ return str }

Symbol = SymbolIdentifier / SymbolPath

SymbolIdentifier = str:SymbolLiteral
	{ 
		return {
			ast: 'symbol',
			value: str,
			str
		}
	}

SymbolLiteral = $("#"? [a-z_+\-*/=?|&<>]i [0-9a-z_+\-*/=?|&<>]i*)

SymbolPath = "@" str:StringLiteral
	{
		return {
			ast: 'symbol',
			value: str,
			str: `@"${str}"`
		}
	}

List = "(" d0:_ values:(Form _)* ")"
	{
		const exp = {
			ast: 'list',
			value: values.map(p => p[0]),
			delimiters: [d0, ...values.map(p => p[1])]
		}

		exp.value.forEach((e, key) => e.parent = exp)

		return exp
	}

Vector = "[" d0:_ values:(Form _)* variadic:("..." _ Form _)? "]"
	{
		const exp = {
			ast: 'specialList',
			kind: 'vector',
		}

		const value = values.map(p => p[0])
		const itemDelimiters = values.map(p => p[1])

		if (variadic) {
			const [, d1, restValue, d2] = variadic
			exp.value = [...value, restValue]
			exp.delimiters = [d0, ...itemDelimiters, d1, d2]
			exp.variadic = true
		} else {
			exp.value = value
			exp.delimiters = [d0, ...itemDelimiters]
			exp.variadic = false
		}

		exp.value.forEach((e, key) => e.parent = exp)

		return exp
	}

HashMap =
	"{" d0:_
	pairs:(LabeledForm _)*
	"}"
	{
		const value = {} // as {[key: string]: ExpForm}
		const delimiters = [d0] // as string[]

		for (const [pair, d1] of pairs) {
			value[pair.label.str] = pair
			delete pair.label
			delimiters.push(d1)
		}

		const exp = {
			ast: 'specialList',
			kind: 'hashMap',
			value,
			delimiters
		}

		Object.values(exp.value).forEach(v => v.parent = exp)

		return exp
	}

LabeledForm = str:(SymbolLiteral / StringLiteral) d0:_ ":" d1:_ form:Form
	{
		form.label = {
			str,
			delimiters: [d0, d1]
		}
		return form
	}

Comment = $(";" [^\n\r]*)

Whitespace = $([ ,\t\n\r]*)

_ = w:Whitespace str:$(Comment Whitespace?)*
	{
		return w + str
	}