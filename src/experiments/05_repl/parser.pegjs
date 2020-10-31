start = space? expr:expr {return expr}

expr = (list / graph / number / symbol)

list "funcall" = "(" space? fn:symbol left:expr right:expr ")" space?
	{return [fn, left, right]}

graph "graph" = "{" space? pairs:(symbol expr)* space? ret:expr "}" space?
	{return {values: new Map(pairs), return: ret}}

symbol "symbol" = str:[a-z+\-\*\/]i+ space?
	{return Symbol.for(str.join(""))}

number "number" = digits:[0-9]+ space?
	{return parseInt(digits.join(""),10)}

space "whitepace" = [ \t\n\r]*