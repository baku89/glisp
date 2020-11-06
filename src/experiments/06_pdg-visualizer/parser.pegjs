program = space? expr:expr? space? { return expr }

expr = atom / fncall / graph / symbol

// Space
space "whitepace" = [ \t\n\r]+

// Atom
atom = number / boolean / fn

// Boolean
boolean = value:("true" / "false") { return value === 'true' }

// Number
number = exponential / float / integer

integer = digits:$(("+" / "-")? (([1-9] [0-9]+) / [0-9]))
	{ return parseInt(digits, 10)}

float = digits:$(integer? "." [0-9]*)
	{ return parseFloat(digits) }

exponential = digits:$((integer / float) "e" integer)
	{ return parseFloat(digits) }

// Fn
fn = "#(" space? params:(symbol space? ":" space? dataType space?)* "=>" space? body:expr space? ":" space? outType:dataType space? ")"
	{
		return {
			type: 'fn',
			def: {
				params: params.map(p => p[0]),
				body
			},
			dataType: {
				in: params.map(p => p[4]),
				out: outType
			}
		}
	}

// Fncall
fncall = "(" space? fn:expr space? params:(expr space?)* ")"
	{
		return {
			type: 'fncall',
			fn,
			params: params.map(p => p[0])
		}
	}

// Graph
graph = "{" space? pairs:(symbol space? expr space?)+ ret:symbol space? "}"
	{
		return {
			type: 'graph',
			values: Object.fromEntries(pairs.map(p => [p[0], p[2]])),
			return: ret
		}
	}

// Symbol
symbol = str:$([a-z0-9_+\-\*\/=?]i+)
	{ return str }

// Data type
dataType = dataTypeCostant / dataTypeFn

dataTypeCostant = "number" / "boolean"

dataTypeFn = "(" space? inTypes:dataType* space? "->" space? outType:dataType space? ")" {
	return {
		in: inTypes,
		out: outType
	}
}