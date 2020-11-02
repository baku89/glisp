start = space? expr:expr {return expr}

expr = (list / graph / number / symbol)

list "funcall" = "(" space? fn:symbol params:(expr)* ")" space?
	{return {type: 'fncall', fn, params}}

graph "graph" = "{" space? pairs:(symbol expr)+ ret:symbol "}" space?
	{return {type: 'graph', values: Object.fromEntries(pairs), return: ret}}

symbol "symbol" = str:[a-z+\-\*\/]i+ space?
	{return str.join("")}

number "number" = digits:[0-9]+ space?
	{return parseInt(digits.join(""),10)}

space "whitepace" = [ \t\n\r]*