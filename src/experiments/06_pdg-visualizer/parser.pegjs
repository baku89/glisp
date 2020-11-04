start = space? expr:expr {return expr}

expr = (atom / fncall / graph / symbol)

// Space
space "whitepace" = [ \t\n\r]*

// Atoms
atom  = boolean / number / fn

boolean = value:("true" / "false") space?
	{return value === 'true'}

number = [0-9]+ space?
	{return parseInt(text(), 10)}

fn = "#(" space? params:(symbol ":" space? dataType)* "=>" space? body:expr ":" space? outType:dataType ")" space?
	{
		return {
			type: 'fn',
			def: {
				params: params.map(p => p[0]),
				body
			},
			dataType: {
				in: params.map(p => p[3]),
				out: outType
			}
		}
	}

// Types needs to be resolved
fncall = "(" space? fn:expr params:(expr)* ")" space?
	{return {type: 'fncall', fn, params}}

graph = "{" space? pairs:(symbol expr)+ ret:symbol "}" space?
	{return {type: 'graph', values: Object.fromEntries(pairs), return: ret}}

symbol = str:[a-z+\-\*\/=]i+ space?
	{return str.join("")}

// Data Type
dataType = dataType:(dataTypeCostant / dataTypeFn) space? {return dataType }

dataTypeCostant = "number" / "boolean" { return text() }

dataTypeFn = "(" space? inTypes:dataType* "->" space? outType:dataType space? ")" {
	return {
		in: inTypes,
		out: outType
	}
}