program = space? expr:expr? space? { return expr }

expr = atom / fncall / graph / symbol

// Space
space "Whitepace" = [ \t\n\r]+

// Atom
atom = number / boolean / fn

// Boolean
boolean "Boolean" = value:("true" / "false") { return value === 'true' }

// Number
number "Number" = exponential / float / integer

integer = digits:$(("+" / "-")? (([1-9] [0-9]+) / [0-9]))
	{ return parseInt(digits, 10)}

float = digits:$(integer? "." [0-9]*)
	{ return parseFloat(digits) }

exponential = digits:$((integer / float) "e" integer)
	{ return parseFloat(digits) }

// Fn
fn "Function" = "#(" space? params:(symbol space? ":" space? dataType space?)* "=>" space? body:expr space? ":" space? outType:dataType space? ")"
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
fncall "Function call" = "(" space? fn:expr space? params:(expr space?)* ")"
	{
		return {
			type: 'fncall',
			fn,
			params: params.map(p => p[0])
		}
	}

// Graph
graph "Graph" = "{" space? "[" pairs:(symbol space? expr space?)+ "]" space? ret:symbol space? "}"
	{
		return {
			type: 'graph',
			values: Object.fromEntries(pairs.map(p => [p[0], p[2]])),
			return: ret
		}
	}

// Symbol
symbol "Symbol" = symbolIdentifier / symbolPath

symbolIdentifier = str:$([a-z0-9_+\-\*\/=?]i+)
	{ return str }

symbolPath = '@"' str:$(!'"' .)+ '"'
	{ return str }

// Data type
dataType "Data type" = dataTypeCostant / dataTypeFn

dataTypeCostant = "number" / "boolean"

dataTypeFn = "(" space? inTypes:dataType* space? "->" space? outType:dataType space? ")" {
	return {
		in: inTypes,
		out: outType
	}
}