program = space? expr:expr? space? { return expr }

expr = boolean / number / string / symbol / list / hashMap

// Space
space "Whitepace" = [ \t\n\r]+

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

// String
string "String" = '"' str:$(!'"' .)+ '"'
	{ return str }

// Symbol
symbol "Symbol" = symbolIdentifier / symbolPath

symbolIdentifier = str:$([a-z0-9_+\-\*\/=?]i+)
	{ return Symbol.for(str) }

symbolPath = '@"' str:string
	{ return Symbol.for(str) }

// List
list "List" = "(" space? fn:expr space? params:(expr space?)* ")"
	{
		return {
			type: 'list',
			fn,
			params: params.map(p => p[0])
		}
	}

// Hash Map
hashMap "Hash Map" = "{" space? pairs:((string / symbol))