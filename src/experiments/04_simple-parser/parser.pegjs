start = space? expr:expr {return expr}

expr = (list / graph / number / symbol)

list = "(" space? left:expr fn:symbol right:expr ")" space? {return [fn, left, right]}

graph = "{" space? pairs:(symbol expr)* ret:expr "}" space? {return {...Object.fromEntries(pairs), $return: ret}}

symbol = str:[a-z+\-\*\/]+ space? {return str.join("")}

number = digits:[0-9]+ space? {return parseInt(digits.join(""),10)}

space = [ \t\n\r]*