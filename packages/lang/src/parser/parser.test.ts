import * as Exp from '../exp'
import {parse} from '.'

describe('parsing literals', () => {
	testParsing('10', Exp.int(10))
	testParsing('   10   ', Exp.int(10))
	testParsing('false', Exp.bool(false))
	testParsing('true', Exp.bool(true))
	testParsing('   \t 5 \r\n', Exp.int(5))
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
		testParsing(input, Exp.sym(expected))
	}
})

describe('parsing call expressions', () => {
	testParsing('(+ 1 2)', Exp.call(Exp.sym('+'), [Exp.int(1), Exp.int(2)]))
	testParsing('(f)', Exp.call(Exp.sym('f'), []))
	testParsing('(0 false)', Exp.call(Exp.int(1), [Exp.bool(false)]))
	testParsing(
		'((true) pi)',
		Exp.call(Exp.call(Exp.bool(true), []), [Exp.sym('pi')])
	)
})

describe('parsing scope', () => {
	testParsing('{a = 10 a}', Exp.scope({a: Exp.int(10)}, Exp.sym('a')))
})

function testParsing(input: string, expected: Exp.Node) {
	test(`parsing '${input}'`, () => {
		const result = parse(input)
		expect(Exp.isEqual(result, expected)).toBe(true)
	})
}
