start = space? expr:expr {return expr}

expr = (atom / fncall / graph / symbol)

fncall = "(" space? fn:(symbol / fn) params:(expr)* ")" space?
	{return {type: 'fncall', fn, params}}

graph = "{" space? pairs:(symbol expr)+ ret:symbol "}" space?
	{return {type: 'graph', values: Object.fromEntries(pairs), return: ret}}

symbol = str:[a-z+\-\*\/]i+ space?
	{return str.join("")}

atom  = number / fn

number = digits:([+\-0-9]+) space?
	{return parseInt(digits.join(""),10)}

// fn "function" = "#(" space? params:(symbol)* "`" js:[^`]* "`" space? ")" space?
// 	{
// 		return {
// 			type: 'fn',
// 			def: eval(js.join('')),
// 			dataType: {
// 				in: Array(params.length).fill('number'),
// 				out: 'number'
// 			}
// 		}
// 	}

fn = "#(" space? params:(symbol)* "=>" space? body:expr space? ")" space?
	{
		return {
			type: 'fn',
			def: {
				params,
				body
			},
			dataType: {
				in: Array(params.length).fill('number'),
				out: 'number'
			}
		}
	}

space "whitepace" = [ \t\n\r]*