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

Form = All / Void / Null / False / True
	/ Number / String
	/ Quote
	/ Path / Symbol / Scope / Fn / VectorType
	/ List / Vector / HashMap

All "All" = "All"
	{
		return {
			ast: 'value',
			value: {type: 'all'}
		}
	}

Void "Void" = "Void"
	{
		return {
			ast: 'value',
			value: {type: 'void'}
		}
	}

Null "null" = "null" { return {ast: 'value', value: null} }

False "false" = "false" { return {ast: 'value', value: false} }

True "true" = "true" { return {ast: 'value', value: true} }

// Number
Number "number" = NumberInf / NumberMinusInf / NumberNan / NumberPercentage / NumberExponential / NumberFloat / NumberHex / NumberInteger

IntegerLiteral = $(("+" / "-")? [0-9]+)

FloatLiteral = $(IntegerLiteral? "." [0-9]+)

NumberInf "Infinity" = "Infinity"
	{ return {ast: 'value', value: Infinity} }
NumberMinusInf "-Infinity" = "-Infinity"
	{ return {ast: 'value', value: -Infinity} }
NumberNan "NaN" = "NaN"
	{ return {ast: 'value', value: NaN} }

NumberInteger "integer" = str:IntegerLiteral
	{ 
		return {
			ast: 'value',
			value: parseInt(str),
			str
		}
	}

NumberFloat "float" = str:FloatLiteral
	{
		return {
			ast: 'value',
			value: parseFloat(str),
			str
		}
	}

NumberExponential "exponential number"
	= str:$((IntegerLiteral / FloatLiteral) "e" IntegerLiteral)
	{
		return {
			ast: 'value',
			value: parseFloat(str),
			str
		}
	}

NumberHex "hex number" = str:$("0x" [0-9a-f]i+)
	{
		return {
			ast: 'value',
			value: parseInt(str),
			str
		}
	}

NumberPercentage "percentage number"
	= str:$(IntegerLiteral / FloatLiteral) "%"
	{
		return {
			ast: 'value',
			value: (parseFloat(str) / 100),
			str: str + '%'
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

Symbol "symbol" = SymbolIdentifier / SymbolQuoted

SymbolIdentifier "symbol" = str:SymbolLiteral
	{ 
		return {
			ast: 'symbol',
			value: str,
			quoted: false
		}
	}

SymbolLiteral = $([a-z_+\-*=?<>@]i [0-9a-z_+\-*=?<>@]i*)

SymbolQuoted "quoted symbol" = '`' str:$(!'`' .)+ '`'
	{
		return {
			ast: 'symbol',
			value: str,
			quoted: true
		}
	}

Path "path" = elements:(PathElement "/")+ last:PathElement
 {
	 return {
		 ast: 'path',
		 value: [...elements.map(e => e[0]), last]
	 }
 }

PathElement "path element" = sym:(Symbol / ".." / ".")
	{
		return typeof sym === 'string'
			? sym
			: {value: sym.value, quoted: sym.quoted}
	}

Scope "scope" = "{" d0:_ vars:HashMap d1:_ value:Form d2:_ "}"
	{
		if (value.ast === 'label') {
			throw new Error('Out form cannot be labeled')
		}

		const exp = {
			ast: 'scope',
			vars: vars.value,
			value
		}

		value.parent = exp
		Object.values(exp.vars).forEach(v => v.parent = exp)

		return exp
	}

Fn "function" = "(" d0:_ "=>" d1:_ params:FnParam d2:_ body:Form d3:_ ")"
	{
		const exp = {
			ast: 'fn',
			...params,
			body
		}

		exp.params.forEach(it => it.body.parent = exp)
		if (exp.restParam) {
			exp.restParam.body.parent = exp
		}

		return exp
	}

FnParam "function parameter"
	= "[" d0:_ fixed:((Label / Symbol) _)* rest:("..." _ Label _)? "]"
	{
		const ret = {
			params: fixed.map(p => {
				if (p[0].ast === 'symbol') {
					return {
						label: p[0].value,
						body: {ast: 'value', value: {type: 'all'}}
					}
				} else {
					return p[0]
				}
			}),
		}

		if (rest) {
			ret.restParam = rest[2]
		}

		return ret
	}

FnType "function type"
	= "(" d0:_ "@=>" d1:_ params:FnTypeParam d2:_ out:Form d3:_ ")"
	{
		const exp = {
			ast: 'fnType',
			...params,
			out
		}

		exp.params.forEach(it => it.parent = exp)

		if (exp.restParam) {
			exp.restParam.parent = exp
		}

		return exp
	}

FnTypeParam "function parameter"
	= "[" d0:_ fixed:(Form _)* rest:("..." _ Form _)? "]"
	{
		const ret = {
			params: fixed.map(p => p[0]),
		}

		if (rest) {
			ret.restParam = rest[2]
		}

		return ret
	}

VectorType "vector type"
	= "[" d0:_ "..." d1:_ items:Form d2:_ "]"
	{
		const exp = {
			ast: 'vectorType',
			items,
		}

		items.parent = exp

		return exp
	}

List "list" = "(" d0:_ values:(Form _)* ")"
	{
		const exp = {
			ast: 'list',
			value: values.map(p => p[0]),
			delimiters: [d0, ...values.map(p => p[1])]
		}

		exp.value.forEach((e, key) => e.parent = exp)

		return exp
	}

Vector "vector" = "[" d0:_ values:(Form _)* "]"
	{
		const exp = {
			ast: 'vector',
		}

		const value = values.map(p => p[0])
		const itemDelimiters = values.map(p => p[1])

		exp.value = value
		exp.delimiters = [d0, ...itemDelimiters]

		exp.value.forEach((e, key) => e.parent = exp)

		return exp
	}

HashMap "hash map" = "{" d0:_ pairs:(Label _)* "}"
	{
		const value = {} // as {[key: string]: ExpForm}
		const delimiters = [d0] // as string[]

		for (const [pair, d1] of pairs) {
			value[pair.label] = pair.body
			delimiters.push(d1)
		}

		const exp = {
			ast: 'hashMap',
			value,
			delimiters
		}

		Object.values(exp.value).forEach(v => v.parent = exp)

		return exp
	}

Quote "quote" = "'" d:_ value:Form
	{
		const exp = {
			ast: 'quote',
			value
		}

		value.parent = exp

		return exp
	}

StringLabelLiteral = '"' value:$(!'"' .)+ '"'
 {
	 return value
 }

Label "labeled form" =
	label:(SymbolLiteral / StringLabelLiteral)
	d0:_ ":" d1:_
	body:Form
	{
		const exp = {
			label,
			body,
			delimiters: [d0, d1]
		}

		return exp
	}

Comment "comment" = $(";" [^\n\r]*)

Whitespace "whitespace" = $([ ,\t\n\r]*)

_ = w:Whitespace str:$(Comment Whitespace?)*
	{
		return w + str
	}