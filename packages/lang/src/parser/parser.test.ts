import * as Exp from '../exp'
import {parse} from '.'

describe('parsing literals', () => {
	testParsing('10', new Exp.Int(10))
	testParsing('   10   ', new Exp.Int(10))
	testParsing('false', new Exp.Bool(false))
	testParsing('true', new Exp.Bool(true))
	testParsing('   \t 5 \r\n', new Exp.Int(5))
})

describe('parsing vars', () => {
	run('foo', 'foo')
	run('BAR', 'BAR')
	run('true1', 'true1')
	run('abc123 ', 'abc123')
	run('+-*/&|<=>_', '+-*/&|<=>_')
	run('変数', '変数')
	run('🍡', '🍡')

	function run(input: string, expected: string) {
		testParsing(input, new Exp.Sym(expected))
	}
})

describe('parsing call expressions', () => {
	testParsing(
		'(+ 1 2)',
		new Exp.Call(new Exp.Sym('+'), [new Exp.Int(1), new Exp.Int(2)])
	)
	testParsing('(f)', new Exp.Call(new Exp.Sym('f'), []))
	testParsing('(0 false)', new Exp.Call(new Exp.Int(1), [new Exp.Bool(false)]))
	testParsing(
		'((true) pi)',
		new Exp.Call(new Exp.Call(new Exp.Bool(true), []), [new Exp.Sym('pi')])
	)
})

describe('parsing scope', () => {
	testParsing(
		'{a = 10 a}',
		new Exp.Scope({a: new Exp.Int(10)}, new Exp.Sym('a'))
	)
})

function testParsing(input: string, expected: Exp.Node) {
	test(`parsing '${input}'`, () => {
		const result = parse(input)
		expect(Exp.isEqual(result, expected)).toBe(true)
	})
}
