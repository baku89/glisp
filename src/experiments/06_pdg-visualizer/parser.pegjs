start = space? expr:expr {return expr}

expr = (atom / fncall / graph / symbol)

// Space
space "whitepace" = [ \t\n\r]*

// Atoms
atom  = number / fn

number = digits:([\-0-9]+) space?
	{return parseInt(digits.join(""),10)}

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

symbol = str:[a-z+\-\*\/]i+ space?
	{return str.join("")}

// Data Type
dataType = dataType:(dataTypeNumber / dataTypeFn) space? {return dataType }

dataTypeNumber = num:"number" { return num }

dataTypeFn = "(" space? inTypes:dataType* "->" space? outType:dataType space? ")" {
	return {
		in: inTypes,
		out: outType
	}
}