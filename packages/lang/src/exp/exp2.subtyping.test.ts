import * as Exp from '../Exp'
import {evaluate, parse} from '../utils/testUtils2'

describe('subtyping', () => {
	// Top, Bottom, Unit
	run('_|_', '_|_', '=')
	run('_|_', '_', '<')
	run('_|_', '()', '<')
	run('_|_', '0', '<')
	run('_|_', 'Num2', '<')
	run('0', '_', '<')
	run('Num2', '_', '<')
	run('_', '_', '=')
	run('()', '()', '=')
	run('()', '0', '!=')
	run('()', '_', '<')

	// Atom, TyAtom
	run('1', '1', '=')
	run('1', 'Num2', '<')
	// run('1', Exp.tyNum.extends('1'), true)
	run('"hello"', '"hello"', '=')
	run('"hello"', 'Str2', '<')
	run('Str2', 'Num2', '!=')
	run('"hello"', 'Num2', '!=')
	run('1', '_', '<')
	run('Str2', 'Str2', '=')
	run('Num2', 'Num2', '=')

	// Enum
	run('true2', 'true2', '=')
	run('false2', 'Bool2', '<')
	run('Bool2', 'Bool2', '=')

	// Vectors
	run('[]', '[]', '=')
	run('[1]', '[]', '<')
	run('[1]', '[1]', '=')
	run('[1 2]', '[1]', '<')
	run('[1]', '[true]', '!=')
	run('[1]', '[Num2]', '<')
	//run('[1 Num2]', '[(| 1 Bool2) Num2]', '<')
	run('[1 2]', '[Num2 Num2]', '<')
	run('[...0]', '[...0]', '=')
	run('[...0]', '[...1]', '!=')
	run('[0 ...0]', '[...0]', '<')
	run('[...0]', '[]', '=')
	run('[0 ...0]', '[]', '<')
	run('[0 0]', '[...0]', '<')
	// run('[true false]', '(-> Num2 (| () Bool2))', true)
	// run('[1 2 3 4 5]', '(-> Num2 (| () Num2))', true)
	// run('[...Num2]', '(-> Num2 (| () Num2))', true)
	// run('[...Bool2]', '(-> Num2 (| () Num2))', false)

	// Dict
	run('{}', '{}', '=')
	run('{a:0}', '{a:_}', '<')
	run('{a:_|_}', '{a:0}', '<')
	run('{a:0}', '{a:0}', '=')
	run('{a:0}', '{a:1}', '!=')
	run('{a:0 b:0}', '{a:0}', '<')
	run('{a:0}', '{a?:0}', '<')
	run('{a?:0}', '{a?:0}', '=')
	run('{}', '{a?:0}', '=')
	run('{a:0 b:0}', '{...0}', '<')
	run('{a:0 b:1}', '{...0}', '!=')
	run('{a?:0}', '{...0}', '=')
	run('{a?:0 ...1}', '{...0}', '!=')
	run('{a:0 ...0}', '{...0}', '<')
	run('{a?:0 ...0}', '{...0}', '=')
})

function run(
	xInput: string | Exp.Node,
	yInput: string | Exp.Node,
	expected: '<' | '=' | '!='
) {
	const xExp = parse(xInput)
	const yExp = parse(yInput)

	const x = evaluate(xExp)
	const y = evaluate(yExp)

	const [x2y, y2x] =
		expected === '<'
			? [true, false]
			: expected === '='
			? [true, true]
			: [false, false]

	test(`${xExp.print()} ${expected} ${yExp.print()}`, () => {
		expect(Exp.isSubtype(x, y)).toBe(x2y)
		expect(Exp.isSubtype(y, x)).toBe(y2x)
	})
}
