import {
	call,
	fn,
	int,
	isEqual,
	Node,
	obj,
	scope,
	sym,
	tyFn,
	vec,
	vecV,
} from '../exp'
import {all, bottom} from '../val'
import {parse} from '.'

const Int = sym('Int')

describe('parsing literals', () => {
	testParsing('10', int(10))
	testParsing('   10   ', int(10))
	testParsing('   \t 5 \r\n', int(5))
	testParsing('false', sym('false'))
	testParsing('true', sym('true'))
	testParsing(' () ', obj(bottom))
	testParsing(' (  \t   ) ', obj(bottom))
	testParsing(' _ ', obj(all))
})

describe('parsing symbols', () => {
	run('foo', 'foo')
	run('BAR', 'BAR')
	run('true1', 'true1')
	run('abc123 ', 'abc123')
	run('+-*/&|<=>_', '+-*/&|<=>_')
	run('変数', '変数')
	run('🍡', '🍡')
	run('`a symbol with spaces`', 'a symbol with spaces')
	run('`    `', '    ')
	run('`_`', '_')
	run('`( )`', '( )')

	function run(input: string, expected: string) {
		testParsing(input, sym(expected))
	}
})

describe('parsing call expressions', () => {
	testParsing('(+ 1 2)', call(sym('+'), int(1), int(2)))
	testParsing('(* 1 2)', call(sym('*'), int(1), int(2)))
	testParsing('(f _)', call(sym('f'), obj(all)))
	testParsing('(f ())', call(sym('f'), obj(bottom)))
	testParsing('(f)', call(sym('f')))
	testParsing('(0 false)', call(int(1), sym('false')))
	testParsing('((true) pi)', call(call(sym('true')), sym('pi')))
})

describe('parsing scope', () => {
	testParsing('{a = 1 a}', scope({a: int(1)}, sym('a')))
	testParsing('{a = 1}', scope({a: int(1)}))
	testParsing('{a = {a = 1}}', scope({a: scope({a: int(1)})}))
	testParsing('{{1}}', scope({}, scope({}, int(1))))
})

describe('parsing vector', () => {
	testParsing('\t[   ]  ', vec())
	testParsing('[    1   \t]', vec(int(1)))
	testParsing('[1 2 3]', vec(int(1), int(2), int(3)))
	testParsing('[1[2]3   ]', vec(int(1), vec(int(2)), int(3)))
	testParsing(
		'[(+)false(+)+]',
		vec(call(sym('+')), sym('false'), call(sym('+')), sym('+'))
	)
	testParsing('[...1]', vecV(int(1)))
})

describe('parsing function definition', () => {
	testParsing('(=> x:Int x)', fn({x: Int}, sym('x')))
	testParsing('(=> (x:Int) x)', fn({x: Int}, sym('x')))
	testParsing(
		'(=> (x : Int y : Bool) x)',
		fn({x: Int, y: sym('Bool')}, sym('x'))
	)
	testParsing('(=>()_)', fn({}, obj(all)))
	testParsing('(=>()())', fn({}, obj(bottom)))
	testParsing('(=> () (+ 1 2))', fn({}, call(sym('+'), int(1), int(2))))
	testParsing('(=> () (=> () 1))', fn({}, fn({}, int(1))))
})

describe('parsing function type', () => {
	testParsing('(-> Int Int)', tyFn(Int, Int))
	testParsing('(-> [Int] Int)', tyFn(vec(Int), Int))
	testParsing('(-> [...Int] Int)', tyFn(vecV(Int), Int))
	testParsing('(-> (x y) z)', tyFn([sym('x'), sym('y')], sym('z')))
	testParsing('(-> [x y] z)', tyFn(vec(sym('x'), sym('y')), sym('z')))
})

function testParsing(input: string, expected: Node) {
	test(`parsing '${input}' to be ${expected.print()}`, () => {
		const result = parse(input)
		if (!isEqual(result, expected)) {
			throw new Error('Got=' + result.print())
		}
	})
}
