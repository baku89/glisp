start = space? expr:expr {return expr}

expr = (fncall / graph / symbol / atom)

fncall = "(" space? fn:expr params:(expr)* ")" space?
	{return {type: 'fncall', fn, params}}

graph = "{" space? pairs:(symbol expr)+ ret:symbol "}" space?
	{return {type: 'graph', values: Object.fromEntries(pairs), return: ret}}

symbol = str:[a-z+\-\*\/]i+ space?
	{return str.join("")}

atom  = number / fn

number = digits:([+\-0-9]+) space?
	{return parseInt(digits.join(""),10)}


dataType = dataType:(dataTypeNumber / dataTypeFn) space? {return dataType }

dataTypeNumber = num:"number" { return num }

dataTypeParam = "(" space? inTypes:(dataType space?)* space? ")" space? {
	return inTypes.map(it => it[0])
}

dataTypeFn = "(" space? inType:dataTypeParam space? "=>" space? outType:dataType space? ")" {
	return {
		in: inType,
		out: outType
	}
}

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

space "whitepace" = [ \t\n\r]*